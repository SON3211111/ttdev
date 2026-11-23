import assert from 'node:assert/strict'

const origin = process.env.VERIFY_BASE_URL ?? 'http://localhost:5173'
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
const month = today.slice(0, 7)
const marker = 'SQL Server 검증 ' + Date.now()
const created = []
let cookie = ''

async function request(path, status = 200, method = 'GET', input) {
  const response = await fetch(origin + '/api/' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    body: input === undefined ? undefined : JSON.stringify(input),
  })
  assert.equal(response.status, status, method + ' ' + path)
  const setCookie = response.headers.get('set-cookie')
  if (setCookie) cookie = setCookie.split(';')[0]
  return status === 204 ? null : response.json()
}

// 기존 개인 기능 API도 로그인이 필요합니다. 비로그인 차단을 확인한 뒤 팀 계정으로 로그인합니다.
// 팀장이 없는 격리 서버(127.0.0.1:18xxx)에서는 검증용 팀장을 만들고, 그 외에는 VERIFY_EMAIL·VERIFY_PASSWORD로 로그인합니다.
async function signIn() {
  await request('records', 401)
  const session = await request('team/auth/session')
  if (session.setupRequired) {
    if (!/^http:\/\/127\.0\.0\.1:18\d{3}$/.test(origin)) throw new Error('팀장 설정은 격리 검증 서버에서만 자동으로 진행합니다.')
    await request('team/auth/setup', 200, 'POST', { email: 'legacy-verify@example.test', name: '기존 API 검증', password: 'legacy-verify-password' })
  } else {
    if (!process.env.VERIFY_EMAIL || !process.env.VERIFY_PASSWORD) throw new Error('VERIFY_EMAIL과 VERIFY_PASSWORD를 지정해 주세요.')
    await request('team/auth/login', 200, 'POST', { email: process.env.VERIFY_EMAIL, password: process.env.VERIFY_PASSWORD })
  }
}

async function create(resource, input) {
  const item = await request(resource, 201, 'POST', input)
  created.push(resource + '/' + item.id)
  assert.match(item.id, /^\d+$/)
  return item
}

try {
  assert.equal((await request('health')).status, 'ok')
  await signIn()
  const record = await create('records', { recordType: 'DIARY', content: marker, recordDate: today })
  const recordPath = 'records/' + record.id
  assert.equal((await request(recordPath)).content, marker)
  const updated = await request(recordPath, 200, 'PUT', { content: marker + ' 수정', recordDate: today })
  assert.equal(updated.contentVersion, 2)
  assert.equal((await request('records?start=' + today + '&end=' + today)).items.find(row => row.id === record.id)?.preview, updated.content)

  const schedule = await create('schedules', { title: marker, scheduleDate: today, scheduleTime: '23:59' })
  const calendar = await request('calendar/schedules?month=' + month)
  assert.equal(calendar.find(item => item.id === schedule.id)?.scheduleTime, '23:59')

  const task = await create('tasks', { title: marker, dueDate: today })
  const taskPath = 'tasks/' + task.id
  const before = await request('tasks/dashboard')
  await request(taskPath + '/status', 200, 'PUT', { status: 'DOING' })
  const done = await request(taskPath + '/status', 200, 'PUT', { status: 'DONE' })
  assert.equal((await request(taskPath + '/status', 200, 'PUT', { status: 'DONE' })).completedAt, done.completedAt)
  assert.equal((await request(taskPath + '/history')).length, 2)
  assert.equal((await request('tasks/dashboard')).done, before.done + 1)
  assert.equal((await request(taskPath + '/reopen', 200, 'PUT')).status, 'DOING')
  assert.equal((await request('calendar/tasks?month=' + month)).find(item => item.id === task.id)?.status, 'DOING')
} finally {
  const results = await Promise.allSettled(created.map(path => request(path, 204, 'DELETE')))
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason
  }
}

console.log('PASS: login required, SQL Server records, schedules, task transitions, dashboard and cleanup via API')
