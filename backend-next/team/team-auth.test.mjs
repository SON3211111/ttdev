import assert from 'node:assert/strict'
import test from 'node:test'
import * as authorization from './team-auth.mjs'
import { hashPassword, verifyPassword, tokenHash, issueToken, invitedTitle } from './team-auth.mjs'
import { loginLimiter } from './login-limit.mjs'

test('password hashes are salted and verify only the original password', async () => {
  const password = 'local-test-password'
  const encoded = await hashPassword(password)
  assert.notEqual(await hashPassword(password), encoded)
  assert.equal(await verifyPassword(password, encoded), true)
  assert.equal(await verifyPassword('other-password', encoded), false)
})

test('invitation and session tokens can be stored without storing their plaintext', () => {
  const token = issueToken()
  assert.match(token, /^[a-f0-9]{64}$/)
  assert.notEqual(tokenHash(token), token)
  assert.notEqual(token, issueToken())
})

test('invited accounts get the title assigned by their invitation role', () => {
  assert.equal(invitedTitle('LEAD'), '팀장')
  assert.equal(invitedTitle('MEMBER'), '프로')
})

test('company scope and team management are independent', () => {
  const director = { title: '본부장', isAdmin: true, managedTeamId: 2 }
  const lead = { title: '팀장', role: 'LEAD', isAdmin: false, managedTeamId: 3 }
  assert.equal(authorization.canViewAll(director), true)
  assert.equal(authorization.canViewAll(lead), false)
  assert.equal(authorization.canManageTeam(director, 2), true)
  assert.equal(authorization.canManageTeam(director, 3), false)
})

test('login attempts pause per account and resume after the window', () => {
  const check = loginLimiter()
  for (let i = 0; i < 8; i++) check('first@example.test', 1000)
  assert.throws(() => check('first@example.test', 1000), { status: 429 })
  check('second@example.test', 1000)
  check('first@example.test', 61000)
})
