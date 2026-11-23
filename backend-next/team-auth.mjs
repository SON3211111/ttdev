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
const userColumns = `u.id,u.name,u.email,u.role,u.team_id AS teamId,t.name AS teamName,t.kind AS teamKind`
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
  if (user.role !== 'ADMIN') throw new ApiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.')
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
    const [{ configured }] = await query(db, "SELECT COUNT(*) AS configured FROM team_users WHERE role='ADMIN'")
    return Response.json({ user: await currentUser(db, request), setupRequired: configured === 0 })
  }
  if (request.method === 'GET' && action === 'invites') {
    // 아직 수락하지 않은 유효한 초대 목록입니다. 관리자는 전체, 팀장은 자기 팀만 봅니다.
    const viewer = await requireUser(db, request)
    if (viewer.role === 'MEMBER') throw new ApiError(403, 'FORBIDDEN', '관리자와 팀장만 초대 현황을 볼 수 있습니다.')
    return Response.json(await query(db, `SELECT i.email,i.role,i.team_id AS teamId,t.name AS teamName,
      CONVERT(varchar(33),i.expires_at,126) AS expiresAt FROM team_invites i LEFT JOIN teams t ON t.id=i.team_id
      WHERE i.consumed_at IS NULL AND i.expires_at>SYSUTCDATETIME() AND (@all=1 OR i.team_id=@team) ORDER BY i.expires_at DESC`,
    { all: viewer.role === 'ADMIN' ? 1 : 0, team: viewer.teamId ?? 0 }))
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
    // 관리자는 팀과 역할(팀장·팀원)을 지정하고, 팀장은 자기 팀의 팀원만 초대합니다. 다시 초대하면 이전 링크는 무효가 됩니다.
    const inviter = await requireUser(db, request)
    if (inviter.role === 'MEMBER') throw new ApiError(403, 'FORBIDDEN', '관리자와 팀장만 초대할 수 있습니다.')
    const input = await body(request, ['email', 'teamId', 'role'])
    const email = emailOf(input.email)
    const admin = inviter.role === 'ADMIN'
    const teamId = admin ? input.teamId : inviter.teamId
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
  // 관리자 계정은 처음 설치할 때 누구나 한 번 만들 수 있습니다. 이미 사용자가 있는 기존 설치에서는 로그인한 팀장만 만들 수 있고,
  // 이때는 팀장 세션을 유지하고 새 관리자 정보만 돌려줍니다.
  let bootstrapper = null
  if (setup) {
    const [{ users }] = await query(db, 'SELECT COUNT(*) AS users FROM team_users')
    if (users > 0) {
      bootstrapper = await currentUser(db, request)
      if (bootstrapper?.role !== 'LEAD') throw new ApiError(409, 'SETUP_COMPLETE', '관리자 계정은 팀장이 로그인한 뒤 만들 수 있습니다.')
    }
  }
  const input = await body(request, setup ? [...credentials, 'name'] : ['name', 'password', 'token'])
  if (!setup && (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token))) {
    throw new ApiError(400, 'INVALID_INVITE', '초대 링크를 확인해 주세요.')
  }
  const name = text(input.name, 'name', 80, true)
  const passwordHash = await hashPassword(passwordOf(input.password, 12))
  const user = await transaction(db, async tx => {
    let email, role = 'ADMIN', teamId = null
    if (setup) {
      email = emailOf(input.email)
      const [admin] = await query(tx, "SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE role='ADMIN'")
      if (admin) throw new ApiError(409, 'SETUP_COMPLETE', '이미 관리자 계정이 설정되었습니다.')
    } else {
      const [invite] = await query(tx, `UPDATE team_invites SET consumed_at=SYSUTCDATETIME() OUTPUT inserted.email,inserted.team_id AS teamId,inserted.role
        WHERE token_hash=@hash AND consumed_at IS NULL AND expires_at>SYSUTCDATETIME()`, { hash: tokenHash(input.token) })
      if (!invite) throw new ApiError(400, 'INVALID_INVITE', '만료되었거나 이미 사용한 초대입니다.')
      ;({ email, role, teamId } = invite)
      if (role === 'LEAD') await assertNoLead(tx, teamId)
    }
    const [existing] = await query(tx, 'SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE email=@email', { email })
    if (existing) throw new ApiError(409, 'ALREADY_MEMBER', '이미 참여한 사용자입니다.')
    const [created] = await query(tx, `INSERT INTO team_users (email,name,password_hash,role,team_id)
      OUTPUT inserted.id VALUES (@email,@name,@passwordHash,@role,@teamId)`, { email, name, passwordHash, role, teamId })
    return created
  })
  if (bootstrapper) return Response.json({ user: await userById(db, user.id) }, { status: 201 })
  return loginResponse(db, user, request)
}

async function assertNoLead(tx, teamId) {
  const [lead] = await query(tx, "SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE team_id=@teamId AND role='LEAD'", { teamId })
  if (lead) throw new ApiError(409, 'LEAD_EXISTS', '이 팀에는 이미 팀장이 있습니다.')
}
