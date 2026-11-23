import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword, tokenHash, issueToken } from './team-auth.mjs'

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
