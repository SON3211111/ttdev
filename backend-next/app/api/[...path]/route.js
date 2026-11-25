import { database, query } from '../../../db/db.mjs'
import { ApiError } from '../../../lib/validation.mjs'
import { auth, canViewAll, checkOrigin, requireUser } from '../../../team/team-auth.mjs'
import { teamDashboard, teamWork } from '../../../team/team-work.mjs'
import { teamReports } from '../../../team/team-reports.mjs'
import { teamMeetings } from '../../../team/team-meetings.mjs'
import { teams, users as orgUsers } from '../../../team/team-org.mjs'

export const runtime = 'nodejs'

// 팀 데이터는 기본으로 요청한 사용자의 팀으로 범위를 제한합니다.
// ?team=ID로 다른 팀을 고르면 관리자와 팀장 이상(팀장·본부장·대표)만, 읽기 전용으로 볼 수 있습니다.
async function teamScope(db, request, user, search, approval) {
  const value = search.get('team')
  if (value === null) {
    if (!user.teamId) throw new ApiError(400, 'TEAM_REQUIRED', '조회할 팀을 지정해 주세요.')
    return user.teamId
  }
  if (user.teamId && value === String(user.teamId)) return user.teamId
  if (!/^\d+$/.test(value) || +value < 1 || +value > 2147483647) throw new ApiError(400, 'INVALID_REQUEST', '팀을 확인해 주세요.', 'team')
  if (!canViewAll(user)) throw new ApiError(403, 'FORBIDDEN', '다른 팀은 회사 관리자만 조회할 수 있습니다.')
  const [team] = await query(db, 'SELECT id FROM teams WHERE id=@id', { id: +value })
  if (!team) throw new ApiError(404, 'TEAM_NOT_FOUND', '팀을 찾을 수 없습니다.')
  if (request.method !== 'GET' && !approval) throw new ApiError(403, 'FORBIDDEN', '다른 팀의 업무·회의·보고서는 조회만 할 수 있습니다.')
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
  const approval = resource === 'meetings' && request.method === 'PUT' && path.length === 3 && path[2] === 'approval'
  const team = await teamScope(db, request, user, search, approval)
  const params = new URLSearchParams(search)
  params.delete('team')
  if (resource === 'work') return teamWork(db, request, path, params, user, { team })
  if (resource === 'reports') return teamReports(db, request, path, user, team)
  if (resource === 'meetings') return teamMeetings(db, request, path, user, team)
  if (resource === 'dashboard' && !path.length && request.method === 'GET') return teamDashboard(db, { team })
  if (resource === 'members' && !path.length && request.method === 'GET') {
    return Response.json(await query(db, `SELECT id,name,email,title,is_admin AS isAdmin,
      CASE WHEN managed_team_id=@team THEN 'LEAD' ELSE 'MEMBER' END AS role
      FROM team_users WHERE (team_id=@team OR managed_team_id=@team) AND is_active=1 ORDER BY name,id`, { team }))
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
    if (resource === 'health' && path.length === 0 && request.method === 'GET') {
      await query(await database(), 'SELECT 1')
      return Response.json({ status: 'ok' })
    }
    return Response.json({ code: 'NOT_FOUND', message: '요청한 API가 없습니다.', fieldErrors: [] }, { status: 404 })
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
