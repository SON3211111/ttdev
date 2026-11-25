import assert from 'node:assert/strict'
import test from 'node:test'
import { users } from './team-org.mjs'

const member = { id: 2, title: '프로', teamId: 10, managedTeamId: null, isAdmin: false, isActive: true }

test('본부장은 대표의 직급이나 계정 상태를 변경할 수 없다', async () => {
  const director = { id: 1, title: '본부장', isAdmin: true }
  const president = { ...member, title: '대표', teamId: null, isAdmin: true }
  const tx = {
    async begin() {},
    async rollback() {},
    request() {
      let id
      return {
        input(name, type, value) { if (name === 'id') id = value },
        async query(statement) {
          if (statement.startsWith('SELECT')) return { recordset: [id === director.id ? director : president] }
          assert.fail('대표 계정은 변경할 수 없어야 한다')
        },
      }
    },
  }
  for (const [path, value] of [
    [['2'], { title: '프로', teamId: 10 }],
    [['2', 'access'], { active: false }],
  ]) {
    const request = new Request('http://localhost/api/team/users/' + path.join('/'), {
      method: 'PUT',
      body: JSON.stringify(value),
    })
    await assert.rejects(users({ transaction: () => tx }, request, path, director), { status: 403, code: 'HIGHER_RANK' })
  }
})

test('본부장은 자신의 소속팀만 저장하고 변경 이력을 남긴다', async () => {
  const director = { id: 1, title: '본부장', teamId: null, managedTeamId: 10, isAdmin: true, isActive: true }
  const writes = []
  const tx = {
    async begin() {},
    async commit() {},
    async rollback() {},
    request() {
      const params = {}
      return {
        input(name, type, value) { params[name] = value },
        async query(statement) {
          if (statement.startsWith('SELECT')) return { recordset: [statement.includes('FROM teams') ? { id: 20 } : director] }
          writes.push([statement, params])
          return {}
        },
      }
    },
  }
  const request = new Request('http://localhost/api/team/users/my-membership', {
    method: 'PUT',
    body: JSON.stringify({ teamId: 20 }),
  })
  const response = await users({ transaction: () => tx }, request, ['my-membership'], director)
  assert.equal(response?.status, 204)
  assert.match(writes[0][0], /UPDATE team_users SET team_id=@teamId WHERE id=@id/)
  assert.deepEqual(writes[0][1], { id: 1, teamId: 20 })
  assert.deepEqual(JSON.parse(writes[1][1].changes), { teamId: { before: null, after: 20 } })
})

function remove(managerTeam, target = member, targetId = target.id) {
  const writes = []
  const tx = {
    async begin() {},
    async commit() {},
    async rollback() {},
    request() {
      const params = {}
      return {
        input(name, type, value) { params[name] = value },
        async query(statement) {
          if (statement.startsWith('SELECT')) {
            return { recordset: [params.id === 1 ? { id: 1, managedTeamId: managerTeam } : target] }
          }
          writes.push([statement, params])
          return {}
        },
      }
    },
  }
  const request = new Request('http://localhost/api/team/users/remove-member', {
    method: 'POST',
    body: JSON.stringify({ userId: targetId }),
  })
  return { response: users({ transaction: () => tx }, request, ['remove-member'], { id: 1 }), writes }
}

test('팀장은 담당 팀의 프로를 소속 해제하고 변경 이력을 남긴다', async () => {
  const { response, writes } = remove(10)
  assert.equal((await response).status, 204)
  assert.match(writes[0][0], /UPDATE team_users SET team_id=NULL/)
  assert.deepEqual(writes[0][1], { id: 2 })
  assert.match(writes[1][0], /INSERT INTO team_org_history/)
  assert.deepEqual(JSON.parse(writes[1][1].changes), { teamId: { before: 10, after: null } })
})

test('팀장 권한이 없거나 내보낼 수 없는 대상이면 조직을 변경하지 않는다', async () => {
  for (const attempt of [
    remove(null), remove(20), remove(10, member, 1),
    remove(10, { ...member, isAdmin: true }), remove(10, { ...member, managedTeamId: 10 }),
    remove(10, { ...member, isActive: false }), remove(10, { ...member, teamId: null }),
  ]) {
    await assert.rejects(attempt.response, { status: 403 })
    assert.deepEqual(attempt.writes, [])
  }
})
