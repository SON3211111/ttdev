import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { query, transaction } from './db.mjs'
import { ApiError, body, text, validate } from './validation.mjs'

const derive = promisify(scrypt)
const cookieName = 'ttech_session'
const lifetime = 60 * 60 * 24 * 7
const credentials = ['email', 'password']
const invalidLogin = () => new ApiError(401, 'UNAUTHORIZED', '이메일 또는 비밀번호를 확인해 주세요.')
const inviteDays = 7
// 세션과 로그인 응답에 쓰는 사용자 정보입니다. 관리자는 소속 팀이 없습니다.
const userColumns = `u.id,u.name,u.email,u.role,u.is_admin AS isAdmin,u.title,u.team_id AS teamId,t.name AS teamName,t.kind AS teamKind`
const userJoin = 'team_users u LEFT JOIN teams t ON t.id=u.team_id'

export const issueToken = () => randomBytes(32).toString('hex')
export const tokenHash = token => createHash('sha256').update(token).digest('hex')

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const key = await derive(password, salt, 64)
  return salt + ':' + key.toString('hex')
}

export async function verifyPassword(password, encoded) {
  const [salt, key] = encoded.split(':')
  return timingSafeEqual(await derive(password, salt, 64), Buffer.from(key, 'hex'))
}

function emailOf(value) {
  const email = text(value, 'email', 254, true).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) validate('email', '이메일 주소를 확인해 주세요.')
  return email
}

function passwordOf(value, minimum) {
  if (typeof value !== 'string' || value.length < minimum || value.length > 128) validate('password', '비밀번호 길이를 확인해 주세요.')
  return value
}

function sessionToken(request) {
  const cookie = request.headers.get('cookie') ?? ''
  return cookie.match(/(?:^|;\s*)ttech_session=([a-f0-9]{64})(?:;|$)/)?.[1]
}

function cookie(token, maxAge) {
  const secure = process.env.TEAM_SECURE_COOKIE === 'true' ? '; Secure' : ''
  return `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`
}

export async function currentUser(db, request) {
  const token = sessionToken(request)
  if (!token) return null
  const [user] = await query(db, `SELECT ${userColumns} FROM team_sessions s
    JOIN ${userJoin} ON u.id=s.user_id WHERE s.token_hash=@hash AND s.expires_at>SYSUTCDATETIME()`, { hash: tokenHash(token) })
  return user ?? null
}

async function userById(db, id) {
  const [user] = await query(db, `SELECT ${userColumns} FROM ${userJoin} WHERE u.id=@id`, { id })
  return user
}

export async function requireUser(db, request) {
  const user = await currentUser(db, request)
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', '로그인이 필요합니다.')
  return user
}

export function requireLead(user) {
  if (user.role !== 'LEAD') throw new ApiError(403, 'FORBIDDEN', '팀장 권한이 필요합니다.')
}

export function requireAdmin(user) {
  if (!user.isAdmin) throw new ApiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.')
}

// 직급은 본인이 고르는 표시용입니다. 대표·본부장과 관리자는 모든 팀을 읽기 전용으로 볼 수 있습니다.
export const titles = ['대표', '본부장', '팀장', '프로']
export const canViewAll = user => !!user.isAdmin || ['대표', '본부장'].includes(user.title)

// 대표·본부장은 회사 전체에 각각 1명만 둘 수 있습니다. exceptId는 직급을 바꾸는 본인을 제외할 때 씁니다.
export const uniqueTitles = ['대표', '본부장']
export async function assertTitleAvailable(tx, title, exceptId = 0) {
  if (!uniqueTitles.includes(title)) return
  const [holder] = await query(tx, 'SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE title=@title AND id<>@exceptId', { title, exceptId })
  if (holder) throw new ApiError(409, 'TITLE_TAKEN', `이미 ${title}이(가) 있습니다. 다른 직급을 선택해 주세요.`, 'title')
}

function titleOf(value, fallback) {
  const title = value ?? fallback
  if (!titles.includes(title)) validate('title', '직급을 선택해 주세요.')
  return title
}

export function checkOrigin(request) {
  if (request.method === 'GET') return
  const origin = request.headers.get('origin')
  const allowed = [process.env.TEAM_ORIGIN, new URL(request.url).origin, 'http://localhost:5173', 'http://127.0.0.1:5173']
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && !allowed.includes(origin))) {
    throw new ApiError(403, 'FORBIDDEN', '허용되지 않은 요청 출처입니다.')
  }
}

async function loginResponse(db, user, request) {
  const token = issueToken()
  const previous = sessionToken(request)
  if (previous) await query(db, 'DELETE FROM team_sessions WHERE token_hash=@hash', { hash: tokenHash(previous) })
  await query(db, 'INSERT INTO team_sessions VALUES (@hash,@id,DATEADD(second,@lifetime,SYSUTCDATETIME()))', { hash: tokenHash(token), id: user.id, lifetime })
  return Response.json({ user: await userById(db, user.id) }, { headers: { 'Set-Cookie': cookie(token, lifetime) } })
}

export async function auth(db, request, action) {
  if (request.method === 'GET' && action === 'session') {
    // setupRequired: 사용자가 한 명도 없는 처음 설치입니다. 첫 사용자가 소속 팀을 골라 관리자 겸 팀장이 되므로 팀 목록을 함께 줍니다.
    const [{ users }] = await query(db, 'SELECT COUNT(*) AS users FROM team_users')
    const teams = users === 0 ? await query(db, 'SELECT id,name FROM teams ORDER BY sort_order,id') : undefined
    // 가입 화면에서 이미 있는 대표·본부장을 고르지 못하게 표시하도록, 사용 중인 직급만 알려줍니다(이름은 알려주지 않음).
    const takenTitles = (await query(db, "SELECT DISTINCT title FROM team_users WHERE title IN (N'대표',N'본부장')")).map(row => row.title)
    return Response.json({ user: await currentUser(db, request), setupRequired: users === 0, teams, takenTitles })
  }
  if (request.method === 'GET' && action === 'invite') {
    // 초대 수락 화면에서 어느 팀에 어떤 자리(팀장·팀원)로 초대됐는지 보여주기 위한 조회입니다. 유효한 토큰만 답합니다.
    const token = new URL(request.url).searchParams.get('token') ?? ''
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError(400, 'INVALID_INVITE', '초대 링크를 확인해 주세요.')
    const [invite] = await query(db, `SELECT i.email,i.role,t.name AS teamName FROM team_invites i JOIN teams t ON t.id=i.team_id
      WHERE i.token_hash=@hash AND i.consumed_at IS NULL AND i.expires_at>SYSUTCDATETIME()`, { hash: tokenHash(token) })
    if (!invite) throw new ApiError(400, 'INVALID_INVITE', '만료되었거나 이미 사용한 초대입니다.')
    return Response.json(invite)
  }
  if (request.method === 'GET' && action === 'invites') {
    // 아직 수락하지 않은 유효한 초대 목록입니다. 관리자는 전체, 팀장은 자기 팀만 봅니다.
    const viewer = await requireUser(db, request)
    if (!viewer.isAdmin && viewer.role !== 'LEAD') throw new ApiError(403, 'FORBIDDEN', '관리자와 팀장만 초대 현황을 볼 수 있습니다.')
    return Response.json(await query(db, `SELECT i.email,i.role,i.team_id AS teamId,t.name AS teamName,
      CONVERT(varchar(33),i.expires_at,126) AS expiresAt FROM team_invites i LEFT JOIN teams t ON t.id=i.team_id
      WHERE i.consumed_at IS NULL AND i.expires_at>SYSUTCDATETIME() AND (@all=1 OR i.team_id=@team) ORDER BY i.expires_at DESC`,
    { all: viewer.isAdmin ? 1 : 0, team: viewer.teamId }))
  }
  if (request.method !== 'POST') return
  if (action === 'logout') {
    const token = sessionToken(request)
    if (token) await query(db, 'DELETE FROM team_sessions WHERE token_hash=@hash', { hash: tokenHash(token) })
    return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie('', 0) } })
  }
  if (action === 'login') {
    const input = await body(request, credentials)
    const email = emailOf(input.email)
    const password = passwordOf(input.password, 1)
    const [user] = await query(db, 'SELECT id,name,email,role,password_hash FROM team_users WHERE email=@email', { email })
    const placeholder = '0'.repeat(32) + ':' + '0'.repeat(128)
    if (!await verifyPassword(password, user?.password_hash ?? placeholder) || !user) throw invalidLogin()
    return loginResponse(db, user, request)
  }
  if (action === 'invite') {
    // 관리자는 팀(생략하면 자기 팀)과 역할(팀장·팀원)을 지정하고, 팀장은 자기 팀의 팀원만 초대합니다. 다시 초대하면 이전 링크는 무효가 됩니다.
    const inviter = await requireUser(db, request)
    if (!inviter.isAdmin && inviter.role !== 'LEAD') throw new ApiError(403, 'FORBIDDEN', '관리자와 팀장만 초대할 수 있습니다.')
    const input = await body(request, ['email', 'teamId', 'role'])
    const email = emailOf(input.email)
    const admin = !!inviter.isAdmin
    const teamId = admin ? input.teamId ?? inviter.teamId : inviter.teamId
    const role = admin ? input.role ?? 'MEMBER' : 'MEMBER'
    if (!Number.isSafeInteger(teamId) || teamId < 1) validate('teamId', '팀을 선택해 주세요.')
    if (!admin && input.teamId !== undefined && input.teamId !== inviter.teamId) throw new ApiError(403, 'FORBIDDEN', '자기 팀에만 초대할 수 있습니다.')
    if (!admin && input.role !== undefined && input.role !== 'MEMBER') throw new ApiError(403, 'FORBIDDEN', '팀장은 팀원만 초대할 수 있습니다.')
    if (!['LEAD', 'MEMBER'].includes(role)) validate('role')
    const token = issueToken()
    await transaction(db, async tx => {
      const [team] = await query(tx, 'SELECT id FROM teams WHERE id=@teamId', { teamId })
      if (!team) validate('teamId', '팀을 선택해 주세요.')
      const [existing] = await query(tx, 'SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE email=@email', { email })
      if (existing) throw new ApiError(409, 'ALREADY_MEMBER', '이미 참여한 사용자입니다.')
      if (role === 'LEAD') await assertNoLead(tx, teamId)
      await query(tx, `DELETE FROM team_invites WHERE email=@email AND consumed_at IS NULL;
        INSERT INTO team_invites (token_hash,email,expires_at,team_id,role) VALUES (@hash,@email,DATEADD(day,@days,SYSUTCDATETIME()),@teamId,@role);`,
      { email, hash: tokenHash(token), days: inviteDays, teamId, role })
    })
    return Response.json({ token, expiresInDays: inviteDays }, { status: 201 })
  }
  if (action !== 'setup' && action !== 'accept') return
  const setup = action === 'setup'
  // 처음 설치(사용자 0명)에서만 첫 사용자가 소속 팀을 골라 관리자 겸 팀장 계정을 만듭니다. 그 뒤로는 초대로만 가입합니다.
  const input = await body(request, setup ? [...credentials, 'name', 'teamId', 'title'] : ['name', 'password', 'token', 'title'])
  if (!setup && (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token))) {
    throw new ApiError(400, 'INVALID_INVITE', '초대 링크를 확인해 주세요.')
  }
  const name = text(input.name, 'name', 80, true)
  let title = titleOf(input.title, setup ? '팀장' : '프로')
  const passwordHash = await hashPassword(passwordOf(input.password, 12))
  const user = await transaction(db, async tx => {
    // 처음 설정: '팀장'을 고르면 그 팀 팀장 겸 관리자, 대표·본부장·프로를 고르면 팀장 권한 없이 관리자입니다.
    let email, role = title === '팀장' ? 'LEAD' : 'MEMBER', teamId = input.teamId, isAdmin = setup ? 1 : 0
    if (setup) {
      email = emailOf(input.email)
      const [{ users }] = await query(tx, 'SELECT COUNT(*) AS users FROM team_users WITH (UPDLOCK,HOLDLOCK)')
      if (users > 0) throw new ApiError(409, 'SETUP_COMPLETE', '이미 처음 설정을 마쳤습니다. 초대 링크로 가입해 주세요.')
      if (!Number.isSafeInteger(teamId) || teamId < 1) validate('teamId', '소속 팀을 선택해 주세요.')
      const [team] = await query(tx, 'SELECT id FROM teams WHERE id=@teamId', { teamId })
      if (!team) validate('teamId', '소속 팀을 선택해 주세요.')
    } else {
      const [invite] = await query(tx, `UPDATE team_invites SET consumed_at=SYSUTCDATETIME() OUTPUT inserted.email,inserted.team_id AS teamId,inserted.role
        WHERE token_hash=@hash AND consumed_at IS NULL AND expires_at>SYSUTCDATETIME()`, { hash: tokenHash(input.token) })
      if (!invite) throw new ApiError(400, 'INVALID_INVITE', '만료되었거나 이미 사용한 초대입니다.')
      ;({ email, role, teamId } = invite)
      // 팀장으로 초대받으면 직급은 팀장으로 정해지고, 팀원으로 초대받으면 팀장 직급을 고를 수 없습니다(실패하면 초대는 소모되지 않음).
      if (role === 'LEAD') title = '팀장'
      else if (title === '팀장') throw new ApiError(400, 'LEAD_TITLE', '팀장 직급은 팀장으로 초대받은 사람만 고를 수 있습니다.', 'title')
      if (role === 'LEAD') await assertNoLead(tx, teamId)
    }
    const [existing] = await query(tx, 'SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE email=@email', { email })
    if (existing) throw new ApiError(409, 'ALREADY_MEMBER', '이미 참여한 사용자입니다.')
    await assertTitleAvailable(tx, title)
    const [created] = await query(tx, `INSERT INTO team_users (email,name,password_hash,role,team_id,is_admin,title)
      OUTPUT inserted.id VALUES (@email,@name,@passwordHash,@role,@teamId,@isAdmin,@title)`, { email, name, passwordHash, role, teamId, isAdmin, title })
    return created
  })
  return loginResponse(db, user, request)
}

async function assertNoLead(tx, teamId) {
  const [lead] = await query(tx, "SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE team_id=@teamId AND role='LEAD'", { teamId })
  if (lead) throw new ApiError(409, 'LEAD_EXISTS', '이 팀에는 이미 팀장이 있습니다.')
}
