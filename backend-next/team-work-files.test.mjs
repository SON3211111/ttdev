import assert from 'node:assert/strict'
import test from 'node:test'
import { readAttachment } from './team-work-files.mjs'

test('work attachments accept PDF bytes and reject a mismatched file type', async () => {
  const makeRequest = (type, content) => new Request('http://localhost/work/1/attachments', {
    method: 'POST', headers: { 'Content-Type': type }, body: content,
  })
  const pdf = Buffer.from('%PDF-1.7\n', 'ascii')
  assert.deepEqual(await readAttachment(makeRequest('application/pdf', pdf), '회의록.pdf'), {
    filename: '회의록.pdf', type: 'application/pdf', data: pdf,
  })
  await assert.rejects(readAttachment(makeRequest('image/png', pdf), 'image.png'), { status: 400 })
})
