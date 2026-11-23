import { database, query } from '../../../db.mjs'
import { records } from '../../../records.mjs'
import { schedules, scheduleCalendar } from '../../../schedules.mjs'
import { tasks, taskCalendar } from '../../../tasks.mjs'
import { ApiError } from '../../../validation.mjs'
import { auth, canViewAll, checkOrigin, requireUser } from '../../../team-auth.mjs'
import { teamDashboard, teamWork } from '../../../team-work.mjs'
import { teamReports } from '../../../team-reports.mjs'
import { teamMeetings } from '../../../team-meetings.mjs'
import { teams, users as orgUsers } from '../../../team-org.mjs'

export const runtime = 'nodejs'

async function generate(request) {
  const input = await request.json().catch(() => null)
  const prompt = typeof input?.prompt === 'string' ? input.prompt.trim() : ''
  if (!prompt) return Response.json({ error: '질문을 입력해주세요.' }, { status: 400 })
  let response
  try {
    response = await fetch(new URL('/generate', process.env.AI_SERVER_URL ?? 'http://localhost:18000'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(180000),
    })
  } catch (error) {
    const timeout = error.name === 'TimeoutError'
    return Response.json({ error: timeout ? 'AI 서버 응답 시간이 초과되었습니다.' : 'AI 서버에 연결할 수 없습니다.' },
      { status: timeout ? 504 : 503 })
  }
  const payload = response.ok ? await response.json().catch(() => null) : null
  if (!payload) return Response.json({ error: 'AI 서버 요청 처리에 실패했습니다.' }, { status: 502 })
  return Response.json(payload)
}

// 팀 데이터는 기본으로 요청한 사용자의 팀으로 범위를 제한합니다.
// ?team=ID로 다른 팀을 고르면 관리자·대표·본부장만, 읽기 전용으로 볼 수 있습니다.
async function teamScope(db, request, user, search) {
  const value = search.get('team')
  if (value === null || value === String(user.teamId)) return user.teamId
  if (!/^\d+$/.test(value) || +value < 1 || +value > 2147483647) throw new ApiError(400, 'INVALID_REQUEST', '팀을 확인해 주세요.', 'team')
  if (!canViewAll(user)) throw new ApiError(403, 'FORBIDDEN', '다른 팀은 관리자·대표·본부장만 조회할 수 있습니다.')
  const [team] = await query(db, 'SELECT id FROM teams WHERE id=@id', { id: +value })
  if (!team) throw new ApiError(404, 'TEAM_NOT_FOUND', '팀을 찾을 수 없습니다.')
  if (request.method !== 'GET') throw new ApiError(403, 'FORBIDDEN', '다른 팀의 업무·회의·보고서는 조회만 할 수 있습니다.')
  return +value
}

async function teamRequest(db, request, [resource, ...path], search) {
  if (resource === 'auth' && path.length === 1) return auth(db, request, path[0])
  const user = await requireUser(db, request)
  if (resource === 'personal') {
    const scope = { owner: user.id }
    if (path[0] === 'work') return teamWork(db, request, path.slice(1), search, user, scope)
    if (path.length === 1 && path[0] === 'dashboard' && request.method === 'GET') return teamDashboard(db, scope)
  }
  if (resource === 'teams') return teams(db, request, path, user)
  if (resource === 'users') return orgUsers(db, request, path, user)
  if (!['work', 'reports', 'meetings', 'dashboard', 'members'].includes(resource)) return
  const team = await teamScope(db, request, user, search)
  const params = new URLSearchParams(search)
  params.delete('team')
  if (resource === 'work') return teamWork(db, request, path, params, user, { team })
  if (resource === 'reports') return teamReports(db, request, path, user, team)
  if (resource === 'meetings') return teamMeetings(db, request, path, user, team)
  if (resource === 'dashboard' && !path.length && request.method === 'GET') return teamDashboard(db, { team })
  if (resource === 'members' && !path.length && request.method === 'GET') {
    return Response.json(await query(db, 'SELECT id,name,email,role,title,is_admin AS isAdmin FROM team_users WHERE team_id=@team ORDER BY name,id', { team }))
  }
}

async function handle(request, { params }) {
  const { path: [resource, ...path] } = await params
  const search = new URL(request.url).searchParams
  try {
    if (resource === 'team') {
      checkOrigin(request)
      const response = await teamRequest(await database(), request, path, search)
      if (response) {
        response.headers.set('Cache-Control', 'no-store')
        return response
      }
    }
    // 기존 개인 기능도 팀 계정으로 로그인한 사용자만 사용합니다. 상태 확인(health)은 Compose healthcheck용으로 공개합니다.
    if (['records', 'tasks', 'schedules', 'calendar', 'ai'].includes(resource)) {
      checkOrigin(request)
      await requireUser(await database(), request)
    }
    if (resource === 'ai' && path.length === 1 && path[0] === 'generate' && request.method === 'POST') return await generate(request)
    if (resource === 'health' && path.length === 0 && request.method === 'GET') {
      await query(await database(), 'SELECT 1')
      return Response.json({ status: 'ok' })
    }
    if (resource === 'calendar' && path.length === 1 && request.method === 'GET') {
      if (path[0] === 'tasks') return await taskCalendar(await database(), search)
      if (path[0] === 'schedules') return await scheduleCalendar(await database(), search)
    }
    const handlers = new Map([['records', records], ['tasks', tasks], ['schedules', schedules]])
    const handler = handlers.get(resource)
    const response = handler && await handler(await database(), request, path, search)
    return response || Response.json({ code: 'NOT_FOUND', message: '요청한 API가 없습니다.', fieldErrors: [] }, { status: 404 })
  } catch (error) {
    if (error instanceof ApiError) {
      const { code, message, field, status } = error
      return Response.json({ code, message, fieldErrors: field ? [{ field, message }] : [] }, { status })
    }
    const unavailable = ['ConnectionError', 'TransactionError'].includes(error.name)
    const code = unavailable ? 'STORAGE_UNAVAILABLE' : 'INTERNAL_ERROR'
    const message = unavailable ? 'DB에 연결할 수 없습니다.' : '서버 내부 오류가 발생했습니다.'
    console.error('API error', error.code ?? error.name, error.number ?? '')
    return Response.json({ code, message, fieldErrors: [] }, { status: unavailable ? 503 : 500 })
  }
}

export { handle as GET, handle as POST, handle as PUT, handle as DELETE }
