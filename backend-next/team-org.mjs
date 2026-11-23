import { query, transaction } from './db.mjs'
import { assertTitleAvailable, requireAdmin, titles } from './team-auth.mjs'
import { ApiError, body, choice, invalid, seoulToday, text, validate } from './validation.mjs'

const kinds = ['SALES', 'DEV', 'TECH', 'SUPPORT']
const teamColumns = `t.id,t.name,t.kind,t.location,
  (SELECT TOP 1 name FROM team_users l WHERE l.team_id=t.id AND l.role='LEAD') AS leadName,
  (SELECT COUNT(*) FROM team_users m WHERE m.team_id=t.id) AS memberCount,
  (SELECT COUNT(*) FROM team_work w WHERE w.team_id=t.id AND w.status<>'DONE' AND w.start_date<=@today AND w.due_date>=@today) AS todayCount,
  (SELECT COUNT(*) FROM team_work w WHERE w.team_id=t.id AND w.status<>'DONE' AND w.due_date<@today) AS overdueCount`

function idOf(value) {
  if (!/^\d+$/.test(String(value)) || +value < 1 || +value > 2147483647) invalid()
  return +value
}

async function teamList(db, where = '1=1', params = {}) {
  return query(db, `SELECT ${teamColumns} FROM teams t WHERE ${where} ORDER BY t.sort_order,t.id`, { ...params, today: seoulToday() })
}

function teamValues(input) {
  return {
    name: text(input.name, 'name', 60, true),
    kind: choice(input.kind, 'kind', kinds),
    location: text(input.location, 'location', 20, true),
  }
}

// 팀 목록은 로그인한 모든 사용자가 봅니다(화면의 팀 이름·관리자 팀 선택용). 팀 생성·수정은 관리자만 합니다.
export async function teams(db, request, path, user) {
  if (!path.length && request.method === 'GET') return Response.json(await teamList(db))
  requireAdmin(user)
  if (!path.length && request.method === 'POST') {
    const value = teamValues(await body(request, ['name', 'kind', 'location']))
    return transaction(db, async tx => {
      await uniqueName(tx, value.name)
      const [{ id }] = await query(tx, `INSERT INTO teams (name,kind,location,sort_order) OUTPUT inserted.id
        VALUES (@name,@kind,@location,(SELECT COALESCE(MAX(sort_order),0)+10 FROM teams))`, value)
      return Response.json((await teamList(tx, 't.id=@id', { id }))[0], { status: 201 })
    })
  }
  if (path.length === 1 && request.method === 'PUT') {
    const id = idOf(path[0])
    const value = teamValues(await body(request, ['name', 'kind', 'location']))
    return transaction(db, async tx => {
      await uniqueName(tx, value.name, id)
      const [updated] = await query(tx, 'UPDATE teams SET name=@name,kind=@kind,location=@location OUTPUT inserted.id WHERE id=@id', { ...value, id })
      if (!updated) throw new ApiError(404, 'TEAM_NOT_FOUND', '팀을 찾을 수 없습니다.')
      return Response.json((await teamList(tx, 't.id=@id', { id }))[0])
    })
  }
}

async function uniqueName(tx, name, id = 0) {
  const [same] = await query(tx, 'SELECT id FROM teams WITH (UPDLOCK,HOLDLOCK) WHERE name=@name AND id<>@id', { name, id })
  if (same) validate('name', '같은 이름의 팀이 있습니다.')
}

// 관리자의 사용자 관리: 전체 사용자 조회, 팀 이동, 팀장 지정, 직급 수정, 관리자 권한 주기·회수.
// 팀장을 지정하면 그 팀의 기존 팀장은 팀원이 됩니다. 관리자는 최소 1명 남아야 합니다. 팀을 옮겨도 이미 등록된 업무는 원래 팀에 남습니다.
const accountColumns = 'u.id,u.name,u.email,u.role,u.is_admin AS isAdmin,u.title,u.team_id AS teamId,t.name AS teamName'
export async function users(db, request, path, user) {
  requireAdmin(user)
  if (!path.length && request.method === 'GET') {
    return Response.json(await query(db, `SELECT ${accountColumns}
      FROM team_users u LEFT JOIN teams t ON t.id=u.team_id ORDER BY t.sort_order,CASE WHEN u.role='LEAD' THEN 0 ELSE 1 END,u.name,u.id`))
  }
  if (path.length !== 1 || request.method !== 'PUT') return
  const id = idOf(path[0])
  const input = await body(request, ['teamId', 'role', 'title', 'isAdmin'])
  const role = choice(input.role, 'role', ['LEAD', 'MEMBER'])
  if (input.title !== undefined) choice(input.title, 'title', titles)
  if (role === 'MEMBER' && input.title === '팀장') validate('title', '팀장 직급은 팀장 권한과 함께 지정합니다.')
  if (input.isAdmin !== undefined && typeof input.isAdmin !== 'boolean') validate('isAdmin')
  if (!Number.isSafeInteger(input.teamId) || input.teamId < 1) validate('teamId', '팀을 선택해 주세요.')
  return transaction(db, async tx => {
    const [target] = await query(tx, 'SELECT id,role,is_admin AS isAdmin,title FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE id=@id', { id })
    if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.')
    if (target.isAdmin && input.isAdmin === false) {
      const [{ admins }] = await query(tx, 'SELECT COUNT(*) AS admins FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE is_admin=1')
      if (admins <= 1) throw new ApiError(409, 'LAST_ADMIN', '관리자는 최소 1명 있어야 합니다.')
    }
    const [team] = await query(tx, 'SELECT id FROM teams WHERE id=@teamId', { teamId: input.teamId })
    if (!team) validate('teamId', '팀을 선택해 주세요.')
    // 팀장 권한을 주면 직급도 팀장이 되고, 그 팀의 기존 팀장은 팀원 권한·프로가 됩니다. 팀장에서 내려오면 직급은 프로가 됩니다.
    const title = role === 'LEAD' ? '팀장' : input.title ?? (target.title === '팀장' ? '프로' : target.title)
    if (role === 'LEAD') {
      await query(tx, "UPDATE team_users SET role='MEMBER',title=N'프로' WHERE team_id=@teamId AND role='LEAD' AND id<>@id", { teamId: input.teamId, id })
    }
    await assertTitleAvailable(tx, title, id)
    const isAdmin = input.isAdmin === undefined ? (target.isAdmin ? 1 : 0) : input.isAdmin ? 1 : 0
    await query(tx, 'UPDATE team_users SET team_id=@teamId,role=@role,title=@title,is_admin=@isAdmin WHERE id=@id',
      { teamId: input.teamId, role, id, title, isAdmin })
    const [updated] = await query(tx, `SELECT ${accountColumns} FROM team_users u LEFT JOIN teams t ON t.id=u.team_id WHERE u.id=@id`, { id })
    return Response.json(updated)
  })
}
