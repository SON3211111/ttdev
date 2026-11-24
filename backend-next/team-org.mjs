import { query, transaction } from './db.mjs'
import { assertTitleAvailable, canViewAll, requireAdmin, titles, uniqueTitles } from './team-auth.mjs'
import { ApiError, body, choice, invalid, seoulToday, text, validate } from './validation.mjs'

const kinds = ['SALES', 'DEV', 'TECH', 'SUPPORT']
const teamColumns = `t.id,t.name,t.kind,t.location,
  (SELECT name FROM team_users l WHERE l.managed_team_id=t.id AND l.is_active=1) AS leadName,
  (SELECT COUNT(*) FROM team_users m WHERE m.team_id=t.id AND m.is_active=1) AS memberCount,
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
  if (!path.length && request.method === 'GET') {
    return Response.json(await (canViewAll(user) ? teamList(db) : teamList(db, 't.id=@team', { team: user.teamId })))
  }
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
const accountColumns = `u.id,u.name,u.email,u.is_admin AS isAdmin,u.is_active AS isActive,u.title,
  u.team_id AS teamId,COALESCE(t.name,N'회사') AS teamName,u.managed_team_id AS managedTeamId`
const organizationState = 'id,title,team_id AS teamId,managed_team_id AS managedTeamId,is_admin AS isAdmin,is_active AS isActive'

async function recordChange(tx, actor, before, after) {
  const changes = Object.fromEntries(Object.keys(after).filter(key => after[key] !== before[key])
    .map(key => [key, { before: before[key], after: after[key] }]))
  if (!Object.keys(changes).length) return
  await query(tx, 'INSERT INTO team_org_history(actor_id,target_id,changes) VALUES (@actor,@target,@changes)',
    { actor, target: before.id, changes: JSON.stringify(changes) })
}

async function organizationTarget(tx, actor, id) {
  const [manager] = await query(tx, 'SELECT is_admin AS isAdmin FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE id=@id AND is_active=1', { id: actor })
  requireAdmin(manager ?? {})
  const [target] = await query(tx, `SELECT ${organizationState} FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE id=@id`, { id })
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', '사용자를 찾을 수 없습니다.')
  return target
}

async function keepActiveAdmin(tx) {
  const [{ admins }] = await query(tx, 'SELECT COUNT(*) AS admins FROM team_users WITH (UPDLOCK,HOLDLOCK) WHERE is_admin=1 AND is_active=1')
  if (admins <= 1) throw new ApiError(409, 'LAST_ADMIN', '활성 관리자 계정이 최소 1명 있어야 합니다.')
}

export async function users(db, request, path, user) {
  requireAdmin(user)
  if (!path.length && request.method === 'GET') {
    return Response.json(await query(db, `SELECT ${accountColumns}
      FROM team_users u LEFT JOIN teams t ON t.id=u.team_id ORDER BY CASE WHEN u.team_id IS NULL THEN 0 ELSE 1 END,t.sort_order,
        CASE u.title WHEN N'대표' THEN 0 WHEN N'본부장' THEN 1 WHEN N'팀장' THEN 2 ELSE 3 END,
        CASE WHEN u.role='LEAD' THEN 0 ELSE 1 END,u.name,u.id`))
  }
  if (path.length === 1 && path[0] === 'history' && request.method === 'GET') {
    const rows = await query(db, `SELECT TOP (100) h.id,a.name AS actor,b.name AS target,h.changed_at AS changedAt,h.changes
      FROM team_org_history h JOIN team_users a ON a.id=h.actor_id JOIN team_users b ON b.id=h.target_id ORDER BY h.id DESC`)
    return Response.json(rows.map(row => ({ ...row, changes: JSON.parse(row.changes) })))
  }
  if (request.method !== 'PUT' || !(path.length === 1 || (path.length === 2 && path[1] === 'access'))) return
  const id = idOf(path[0])
  if (id === user.id) throw new ApiError(403, 'SELF_MANAGEMENT', '본인의 소속·권한·직급이나 계정 상태는 변경할 수 없습니다.')
  if (path[1] === 'access') {
    const { active } = await body(request, ['active'])
    if (typeof active !== 'boolean') validate('active')
    return transaction(db, async tx => {
      const target = await organizationTarget(tx, user.id, id)
      if (!active && target.isActive && target.isAdmin) await keepActiveAdmin(tx)
      await query(tx, 'UPDATE team_users SET is_active=@active WHERE id=@id', { active: active ? 1 : 0, id })
      if (!active) await query(tx, 'DELETE FROM team_sessions WHERE user_id=@id', { id })
      await recordChange(tx, user.id, target, { isActive: active })
      return new Response(null, { status: 204 })
    })
  }
  const input = await body(request, ['teamId', 'title', 'managedTeamId', 'replaceLead'])
  const title = choice(input.title, 'title', titles)
  const isAdmin = uniqueTitles.includes(title)
  const teamId = isAdmin ? null : Number.isSafeInteger(input.teamId) && input.teamId > 0 ? idOf(input.teamId) : null
  if (!isAdmin && !teamId) validate('teamId', '소속 팀을 선택해 주세요.')
  if (isAdmin && input.teamId != null) validate('teamId', '대표·본부장의 소속은 회사입니다.')
  if (input.managedTeamId != null && (title !== '본부장' || !Number.isSafeInteger(input.managedTeamId))) validate('managedTeamId')
  const role = title === '팀장' ? 'LEAD' : 'MEMBER'
  const managedTeamId = role === 'LEAD' ? teamId : input.managedTeamId == null ? null : idOf(input.managedTeamId)
  return transaction(db, async tx => {
    const target = await organizationTarget(tx, user.id, id)
    if (target.isActive && target.isAdmin && !isAdmin) await keepActiveAdmin(tx)
    if (!target.isActive && (isAdmin || managedTeamId)) validate('title', '활성 계정에만 관리 권한을 지정할 수 있습니다.')
    if (teamId || managedTeamId) {
      const [team] = await query(tx, 'SELECT id FROM teams WHERE id=@id', { id: teamId ?? managedTeamId })
      if (!team) validate('teamId', '팀을 선택해 주세요.')
    }
    if (managedTeamId) {
      const [previous] = await query(tx, `SELECT ${organizationState} FROM team_users WITH (UPDLOCK,HOLDLOCK)
        WHERE managed_team_id=@managedTeamId AND id<>@id`, { managedTeamId, id })
      if (previous) {
        if (previous.id === user.id) throw new ApiError(403, 'SELF_MANAGEMENT', '다른 회사 관리자가 팀장을 교체해야 합니다.')
        if (input.replaceLead !== true) throw new ApiError(409, 'LEAD_EXISTS', '팀장 교체를 확인해 주세요.')
        const replacementTitle = previous.title === '팀장' ? '프로' : previous.title
        await query(tx, "UPDATE team_users SET managed_team_id=NULL,role='MEMBER',title=@title WHERE id=@id",
          { title: replacementTitle, id: previous.id })
        await recordChange(tx, user.id, previous, { title: replacementTitle, managedTeamId: null })
      }
    }
    await assertTitleAvailable(tx, title, id)
    await query(tx, 'UPDATE team_users SET team_id=@teamId,managed_team_id=@managedTeamId,role=@role,title=@title,is_admin=@isAdmin WHERE id=@id',
      { teamId, managedTeamId, role, id, title, isAdmin: isAdmin ? 1 : 0 })
    await recordChange(tx, user.id, target, { title, teamId, managedTeamId, isAdmin })
    if (isAdmin) {
      const legacy = await query(tx, `UPDATE team_users SET is_admin=0 OUTPUT deleted.id,deleted.is_admin AS isAdmin
        WHERE is_admin=1 AND title NOT IN (N'대표',N'본부장')`)
      for (const account of legacy) await recordChange(tx, user.id, account, { isAdmin: false })
    }
    const [updated] = await query(tx, `SELECT ${accountColumns} FROM team_users u LEFT JOIN teams t ON t.id=u.team_id WHERE u.id=@id`, { id })
    return Response.json(updated)
  })
}
