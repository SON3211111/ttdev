import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { query, transaction } from '../db/db.mjs'
import { loginLimiter } from './login-limit.mjs'
import { ApiError, body, text, validate } from '../lib/validation.mjs'

const derive = promisify(scrypt)
const cookieName = 'ttech_session'
const lifetime = 60 * 60 * 24 * 7
const credentials = ['email', 'password']
const invalidLogin = () => new ApiError(401, 'UNAUTHORIZED', '이메일 또는 비밀번호를 확인해 주세요.')
const inviteDays = 7
const checkLoginAttempts = loginLimiter()
// 세션과 로그인 응답에 쓰는 사용자 정보입니다. 관리자는 소속 팀이 없습니다.
const userColumns = `u.id,u.name,u.email,CASE WHEN u.managed_team_id IS NULL THEN 'MEMBER' ELSE 'LEAD' END AS role,
  u.is_admin AS isAdmin,u.title,u.team_id AS membershipTeamId,u.managed_team_id AS managedTeamId,
  COALESCE(u.managed_team_id,u.team_id) AS teamId,m.name AS membershipTeamName,
  COALESCE(t.name,CASE WHEN u.title=N'프로' THEN N'소속 없음' ELSE N'회사' END) AS teamName,COALESCE(t.kind,'SUPPORT') AS teamKind`
const userJoin = 'team_users u LEFT JOIN teams t ON t.id=COALESCE(u.managed_team_id,u.team_id) LEFT JOIN teams m ON m.id=u.team_id'

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
    JOIN ${userJoin} ON u.id=s.user_id WHERE s.token_hash=@hash AND s.expires_at>SYSUTCDATETIME() AND u.is_active=1`, { hash: tokenHash(token) })
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

export function requireAdmin(user) {
  if (!user.isAdmin) throw new ApiError(403, 'FORBIDDEN', '관리자 권한이 필요합니다.')
}

// 관리자와 팀장 이상(팀장·본부장·대표)은 모든 팀을 읽기 전용으로 볼 수 있습니다.
export const titles = ['대표', '본부장', '팀장', '프로']
export const canViewAll = user => !!user.isAdmin
export const canManageTeam = (user, teamId) => teamId != null && user.managedTeamId === teamId

// 대표·본부장은 회사 전체에 각각 1명만 둘 수 있습니다. exceptId는 직급을 바꾸는 본인을 제외할 때 씁니다.
export const uniqueTitles = ['대표', '본부장']
export const invitedTitle = role => role === 'LEAD' ? '팀장' : '프로'
export async function assertTitleAvailable(tx, title, exceptId = 0) {
  if (!uniqueTitles.includes(title)) return
  const [holder] = await query(tx, 'SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE title=@title AND id<>@exceptId', { title, exceptId })
  if (holder) throw new ApiError(409, 'TITLE_TAKEN', `이미 ${title}이(가) 있습니다. 다른 직급을 선택해 주세요.`, 'title')
}

export function checkOrigin(request) {
  if (request.method === 'GET') return
  const origin = request.headers.get('origin')
  if (process.env.TEAM_SECURE_COOKIE === 'true') {
    if (!process.env.TEAM_ORIGIN?.startsWith('https://') || origin !== process.env.TEAM_ORIGIN ||
        request.headers.get('sec-fetch-site') === 'cross-site') {
      throw new ApiError(403, 'FORBIDDEN', '허용되지 않은 요청 출처입니다.')
    }
    return
  }
  const allowed = [process.env.TEAM_ORIGIN, new URL(request.url).origin, 'http://localhost:5173', 'http://127.0.0.1:5173']
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && !allowed.includes(origin))) {
    throw new ApiError(403, 'FORBIDDEN', '허용되지 않은 요청 출처입니다.')
  }
}

function setupTokenRequired() {
  return !!process.env.TEAM_SETUP_TOKEN || process.env.TEAM_SECURE_COOKIE === 'true'
}

function checkSetupToken(input) {
  if (!setupTokenRequired()) return
  const expected = process.env.TEAM_SETUP_TOKEN
  if (!expected || typeof input !== 'string' || input.length > 256 ||
      !timingSafeEqual(Buffer.from(tokenHash(input), 'hex'), Buffer.from(tokenHash(expected), 'hex'))) {
    throw new ApiError(403, 'SETUP_TOKEN_REQUIRED', '초기 설정 키를 확인해 주세요.', 'setupToken')
  }
}

async function loginResponse(db, user, request, verifiedHash) {
  const token = issueToken()
  const previous = sessionToken(request)
  return transaction(db, async tx => {
    const [current] = await query(tx, 'SELECT password_hash FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND is_active=1', { id: user.id })
    if (!current || current.password_hash !== verifiedHash) throw invalidLogin()
    if (previous) await query(tx, 'DELETE FROM team_sessions WHERE token_hash=@hash', { hash: tokenHash(previous) })
    await query(tx, 'INSERT INTO team_sessions VALUES (@hash,@id,DATEADD(second,@lifetime,SYSUTCDATETIME()))', { hash: tokenHash(token), id: user.id, lifetime })
    return Response.json({ user: await userById(tx, user.id) }, { headers: { 'Set-Cookie': cookie(token, lifetime) } })
  })
}

export async function auth(db, request, action) {
  if (request.method === 'GET' && action === 'session') {
    // setupRequired: 사용자가 한 명도 없는 처음 설치입니다. 첫 사용자가 소속 팀을 골라 관리자 겸 팀장이 되므로 팀 목록을 함께 줍니다.
    const [{ users }] = await query(db, 'SELECT COUNT(*) AS users FROM team_users')
    const teams = users === 0 ? await query(db, 'SELECT id,name FROM teams ORDER BY sort_order,id') : undefined
    // 가입 화면에서 이미 있는 대표·본부장을 고르지 못하게 표시하도록, 사용 중인 직급만 알려줍니다(이름은 알려주지 않음).
    const takenTitles = (await query(db, "SELECT DISTINCT title FROM team_users WHERE title IN (N'대표',N'본부장')")).map(row => row.title)
    return Response.json({ user: await currentUser(db, request), setupRequired: users === 0,
      setupTokenRequired: users === 0 && setupTokenRequired(), teams, takenTitles })
  }
  if (request.method === 'GET' && action === 'invite') {
    // 초대 수락 화면에서 어느 팀에 어떤 자리(팀장·팀원)로 초대됐는지 보여주기 위한 조회입니다. 유효한 토큰만 답합니다.
    const token = new URL(request.url).searchParams.get('token') ?? ''
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError(400, 'INVALID_INVITE', '초대 링크를 확인해 주세요.')
    const [invite] = await query(db, `SELECT i.email,i.role,t.name AS teamName FROM team_invites i JOIN teams t ON t.id=i.team_id
      WHERE i.token_hash=@hash AND i.consumed_at IS NULL AND i.expires_at>SYSUTCDATETIME()
        AND NOT EXISTS (SELECT 1 FROM team_users u WHERE u.email=i.email)`, { hash: tokenHash(token) })
    if (!invite) throw new ApiError(400, 'INVALID_INVITE', '만료되었거나 이미 사용한 초대입니다.')
    return Response.json(invite)
  }
  if (request.method === 'GET' && action === 'invites') {
    // 아직 수락하지 않은 유효한 초대 목록입니다. 관리자는 전체, 팀장은 자기 팀 팀원 초대, 팀원은 본인이 보낸 초대만 봅니다.
    const viewer = await requireUser(db, request)
    const scope = viewer.isAdmin ? 'ALL' : viewer.role === 'LEAD' ? 'TEAM' : 'OWN'
    return Response.json(await query(db, `SELECT i.email,i.role,i.team_id AS teamId,t.name AS teamName,
      CONVERT(varchar(33),i.expires_at,126) AS expiresAt,inviter.name AS invitedByName FROM team_invites i
      LEFT JOIN teams t ON t.id=i.team_id LEFT JOIN team_users inviter ON inviter.id=i.invited_by
      WHERE i.consumed_at IS NULL AND i.expires_at>SYSUTCDATETIME()
        AND (@scope='ALL' OR (i.team_id=@team AND i.role='MEMBER' AND (@scope='TEAM' OR i.invited_by=@viewer)))
        AND NOT EXISTS (SELECT 1 FROM team_users u WHERE u.email=i.email) ORDER BY i.expires_at DESC`,
    { scope, team: viewer.teamId, viewer: viewer.id }))
  }
  if (request.method !== 'POST') return
  if (action === 'profile') {
    const user = await requireUser(db, request)
    const { name } = await body(request, ['name'])
    await query(db, 'UPDATE team_users SET name=@name WHERE id=@id', { name: text(name, 'name', 80, true), id: user.id })
    return Response.json({ user: await userById(db, user.id) })
  }
  if (action === 'logout') {
    const token = sessionToken(request)
    if (token) await query(db, 'DELETE FROM team_sessions WHERE token_hash=@hash', { hash: tokenHash(token) })
    return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie('', 0) } })
  }
  if (action === 'login') {
    const input = await body(request, credentials)
    const email = emailOf(input.email)
    const password = passwordOf(input.password, 1)
    checkLoginAttempts(email)
    const [user] = await query(db, 'SELECT id,password_hash FROM team_users WHERE email=@email AND is_active=1', { email })
    const placeholder = '0'.repeat(32) + ':' + '0'.repeat(128)
    if (!await verifyPassword(password, user?.password_hash ?? placeholder) || !user) throw invalidLogin()
    return loginResponse(db, user, request, user.password_hash)
  }
  if (action === 'password') {
    const user = await requireUser(db, request)
    const input = await body(request, ['currentPassword', 'newPassword'])
    const currentPassword = passwordOf(input.currentPassword, 1)
    const newPassword = passwordOf(input.newPassword, 12)
    if (currentPassword === newPassword) validate('newPassword', '새 비밀번호는 기존 비밀번호와 달라야 합니다.')
    const [account] = await query(db, 'SELECT password_hash FROM team_users WHERE id=@id AND is_active=1', { id: user.id })
    if (!account || !await verifyPassword(currentPassword, account.password_hash)) throw invalidLogin()
    const passwordHash = await hashPassword(newPassword)
    await transaction(db, async tx => {
      const [changed] = await query(tx, `UPDATE team_users SET password_hash=@passwordHash OUTPUT inserted.id
        WHERE id=@id AND is_active=1 AND password_hash=@previous`, { id: user.id, passwordHash, previous: account.password_hash })
      if (!changed) throw invalidLogin()
      await query(tx, 'DELETE FROM team_sessions WHERE user_id=@id', { id: user.id })
    })
    return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie('', 0) } })
  }
  if (action === 'invite' || action === 'invite-cancel') {
    // 관리자는 팀(생략하면 자기 팀)과 역할(팀장·팀원)을 지정하고, 팀장·팀원은 자기 팀의 팀원만 초대합니다. 다시 초대하면 이전 링크는 무효가 됩니다.
    // 팀원은 본인이 보낸 초대만 다시 보내거나 취소하고, 다른 사람이 보낸 대기 중 초대는 덮어쓰지 못합니다. 팀장은 자기 팀 팀원 초대를 모두 관리합니다.
    const inviter = await requireUser(db, request)
    const lead = !inviter.isAdmin && inviter.role === 'LEAD'
    const member = !inviter.isAdmin && !lead
    if (member && !inviter.teamId) throw new ApiError(403, 'FORBIDDEN', '소속 팀이 있어야 초대할 수 있습니다.')
    const input = await body(request, action === 'invite' ? ['email', 'teamId', 'role'] : ['email', 'teamId'])
    const email = emailOf(input.email)
    const admin = !!inviter.isAdmin
    const teamId = admin ? input.teamId ?? inviter.teamId : inviter.teamId
    const role = admin ? input.role ?? 'MEMBER' : 'MEMBER'
    if (!Number.isSafeInteger(teamId) || teamId < 1) validate('teamId', '팀을 선택해 주세요.')
    if (!admin && input.teamId !== undefined && input.teamId !== inviter.teamId) throw new ApiError(403, 'FORBIDDEN', '자기 팀에만 초대할 수 있습니다.')
    if (action === 'invite-cancel') {
      await query(db, `DELETE FROM team_invites WHERE email=@email AND team_id=@teamId AND consumed_at IS NULL
        AND (@admin=1 OR role='MEMBER') AND (@member=0 OR invited_by=@inviter)`, { email, teamId, admin: admin ? 1 : 0, member: member ? 1 : 0, inviter: inviter.id })
      return new Response(null, { status: 204 })
    }
    if (!admin && input.role !== undefined && input.role !== 'MEMBER') throw new ApiError(403, 'FORBIDDEN', '팀장·팀원은 팀원만 초대할 수 있습니다.')
    if (!['LEAD', 'MEMBER'].includes(role)) validate('role')
    const token = issueToken()
    await transaction(db, async tx => {
      const [team] = await query(tx, 'SELECT id FROM teams WHERE id=@teamId', { teamId })
      if (!team) validate('teamId', '팀을 선택해 주세요.')
      const [existing] = await query(tx, 'SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE email=@email', { email })
      if (existing) throw new ApiError(409, 'ALREADY_MEMBER', '이미 참여한 사용자입니다.')
      if (!admin) {
        const [pendingLead] = await query(tx, `SELECT 1 AS pending FROM team_invites WHERE email=@email AND team_id=@teamId
          AND role='LEAD' AND consumed_at IS NULL AND expires_at>SYSUTCDATETIME()`, { email, teamId })
        if (pendingLead) throw new ApiError(409, 'LEAD_INVITE_PENDING', '관리자가 보낸 팀장 초대가 대기 중입니다.')
      }
      if (member) {
        const [others] = await query(tx, `SELECT 1 AS pending FROM team_invites WHERE email=@email AND team_id=@teamId AND consumed_at IS NULL
          AND expires_at>SYSUTCDATETIME() AND (invited_by IS NULL OR invited_by<>@inviter)`, { email, teamId, inviter: inviter.id })
        if (others) throw new ApiError(409, 'INVITE_PENDING', '다른 사람이 보낸 초대가 이미 대기 중입니다. 팀장에게 확인해 주세요.')
      }
      if (role === 'LEAD') await assertNoLead(tx, teamId)
      await query(tx, `DELETE FROM team_invites WHERE email=@email AND team_id=@teamId AND consumed_at IS NULL
          AND (@admin=1 OR role='MEMBER');
        INSERT INTO team_invites (token_hash,email,expires_at,team_id,role,invited_by) VALUES (@hash,@email,DATEADD(day,@days,SYSUTCDATETIME()),@teamId,@role,@inviter);`,
      { email, hash: tokenHash(token), days: inviteDays, teamId, role, admin: admin ? 1 : 0, inviter: inviter.id })
    })
    return Response.json({ token, expiresInDays: inviteDays }, { status: 201 })
  }
  if (action !== 'setup' && action !== 'accept') return
  const setup = action === 'setup'
  // 처음 설치(사용자 0명)에서만 첫 사용자가 소속 팀을 골라 관리자 겸 팀장 계정을 만듭니다. 그 뒤로는 초대로만 가입합니다.
  const input = await body(request, setup ? [...credentials, 'name', 'setupToken'] : ['name', 'password', 'token', 'title'])
  if (setup) checkSetupToken(input.setupToken)
  if (!setup && (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token))) {
    throw new ApiError(400, 'INVALID_INVITE', '초대 링크를 확인해 주세요.')
  }
  const name = text(input.name, 'name', 80, true)
  const passwordHash = await hashPassword(passwordOf(input.password, 12))
  const user = await transaction(db, async tx => {
    let email, role = 'MEMBER', teamId = null, title = '대표'
    const isAdmin = setup ? 1 : 0
    if (setup) {
      email = emailOf(input.email)
      const [{ users }] = await query(tx, 'SELECT COUNT(*) AS users FROM team_users WITH (UPDLOCK,HOLDLOCK)')
      if (users > 0) throw new ApiError(409, 'SETUP_COMPLETE', '이미 처음 설정을 마쳤습니다. 초대 링크로 가입해 주세요.')
    } else {
      const [invite] = await query(tx, `UPDATE team_invites SET consumed_at=SYSUTCDATETIME() OUTPUT inserted.email,inserted.team_id AS teamId,inserted.role
        WHERE token_hash=@hash AND consumed_at IS NULL AND expires_at>SYSUTCDATETIME()`, { hash: tokenHash(input.token) })
      if (!invite) throw new ApiError(400, 'INVALID_INVITE', '만료되었거나 이미 사용한 초대입니다.')
      ;({ email, role, teamId } = invite)
      const assignedTitle = invitedTitle(role)
      if (input.title !== undefined && input.title !== assignedTitle) {
        throw new ApiError(400, 'INVITE_TITLE', '초대에서 지정된 직급으로 가입해 주세요.', 'title')
      }
      title = assignedTitle
      if (role === 'LEAD') await assertNoLead(tx, teamId)
    }
    const [existing] = await query(tx, 'SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE email=@email', { email })
    if (existing) throw new ApiError(409, 'ALREADY_MEMBER', '이미 참여한 사용자입니다.')
    await assertTitleAvailable(tx, title)
    const [created] = await query(tx, `INSERT INTO team_users (email,name,password_hash,role,team_id,is_admin,title,managed_team_id)
      OUTPUT inserted.id VALUES (@email,@name,@passwordHash,@role,@teamId,@isAdmin,@title,@managedTeamId)`,
    { email, name, passwordHash, role, teamId, isAdmin, title, managedTeamId: role === 'LEAD' ? teamId : null })
    return created
  })
  return loginResponse(db, user, request, passwordHash)
}

async function assertNoLead(tx, teamId) {
  const [lead] = await query(tx, "SELECT id FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE managed_team_id=@teamId", { teamId })
  if (lead) throw new ApiError(409, 'LEAD_EXISTS', '이 팀에는 이미 팀장이 있습니다.')
}
