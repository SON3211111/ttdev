import assert from 'node:assert/strict'

const base = process.env.TEAM_VERIFY_URL
if (!base || !/^http:\/\/127\.0\.0\.1:18\d{3}$/.test(base)) throw new Error('Use an isolated local team test server.')

const password = 'local-test-password'
const leadEmail = 'lead@example.test'
const memberEmail = 'member@example.test'
const observerEmail = 'observer@example.test'

async function request(path, expectedStatus, { cookie, method = 'GET', value } = {}) {
  const response = await fetch(base + '/api/team/' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie && { Cookie: cookie }) },
    body: value === undefined ? undefined : JSON.stringify(value),
  })
  const data = response.status === 204 ? null : await response.json()
  assert.equal(response.status, expectedStatus, method + ' ' + path + ' ' + (data?.code ?? ''))
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] }
}

const post = (path, expectedStatus, value, cookie) => request(path, expectedStatus, { method: 'POST', value, cookie })
// 처음 설치하면 관리자를 만들고, 관리자가 팀을 지정해 팀장을 초대합니다. 팀장은 자기 팀원을 초대합니다.
assert.equal((await request('auth/session', 200)).data.setupRequired, true)
const admin = await post('auth/setup', 200, { email: 'admin@example.test', name: '관리자', password })
assert.equal(admin.data.user.role, 'ADMIN')
assert.equal(admin.data.user.teamId, null)
await post('auth/setup', 409, { email: 'admin2@example.test', name: '관리자 다시 설정', password })
assert.equal((await request('auth/session', 200)).data.setupRequired, false)
const teamList = (await request('teams', 200, { cookie: admin.cookie })).data
assert.deepEqual(teamList.map(team => team.name), ['기술영업 1팀', '기술영업 2팀', '기술영업팀(서울지사)', '솔루션개발 1팀', '솔루션개발 2팀', '경영지원팀', '기업부설연구소'])
const [salesOne, salesTwo] = teamList
await post('auth/invite', 401, { email: memberEmail })
await post('auth/invite', 400, { email: leadEmail, role: 'LEAD' }, admin.cookie)
const leadInvite = await post('auth/invite', 201, { email: leadEmail, teamId: salesOne.id, role: 'LEAD' }, admin.cookie)
assert.equal(leadInvite.data.expiresInDays, 7)
const lead = await post('auth/accept', 200, { token: leadInvite.data.token, name: '팀장', password })
assert.equal(lead.data.user.role, 'LEAD')
assert.equal(lead.data.user.teamName, '기술영업 1팀')
await post('auth/invite', 409, { email: 'lead-two@example.test', teamId: salesOne.id, role: 'LEAD' }, admin.cookie)
await post('auth/invite', 403, { email: 'outsider@example.test', teamId: salesTwo.id }, lead.cookie)
await post('auth/invite', 403, { email: 'outsider@example.test', role: 'LEAD' }, lead.cookie)

async function inviteMember(email, name) {
  const invite = await post('auth/invite', 201, { email }, lead.cookie)
  const payload = { token: invite.data.token, name, password }
  const member = await post('auth/accept', 200, payload)
  assert.equal(member.data.user.role, 'MEMBER')
  assert.equal(member.data.user.teamId, salesOne.id)
  await post('auth/accept', 400, payload)
  return member
}

const member = await inviteMember(memberEmail, '팀원')
await post('auth/invite', 403, { email: observerEmail }, member.cookie)
const observer = await inviteMember(observerEmail, '동료')
await post('auth/login', 401, { email: memberEmail, password: 'wrong' })
const login = await post('auth/login', 200, { email: memberEmail, password })
assert.equal((await request('auth/session', 200, { cookie: login.cookie })).data.user.email, memberEmail)
await post('auth/logout', 204, undefined, login.cookie)
assert.equal((await request('auth/session', 200, { cookie: login.cookie })).data.user, null)
console.log('PASS team setup, invite roles, one-time acceptance, login and logout')

const workInput = { title: '장비 견적', company: '테스트 업체', category: 'QUOTE', startDate: '2026-11-29', dueDate: '2026-12-02', notes: '테스트', status: 'WAITING' }
await request('work?month=2026-12', 401)
await post('work', 403, { ...workInput, assigneeId: observer.data.user.id }, member.cookie)
await post('work', 400, { ...workInput, dueDate: '2026-11-28' }, member.cookie)
const work = (await post('work', 201, workInput, member.cookie)).data
assert.equal(work.assigneeId, member.data.user.id)
assert.ok((await request('work?month=2026-12', 200, { cookie: observer.cookie })).data.some(item => item.id === work.id))
const workPath = 'work/' + work.id
await request(workPath, 403, { method: 'PUT', value: { ...workInput, status: 'DONE' }, cookie: observer.cookie })
await request(workPath, 403, { method: 'DELETE', cookie: observer.cookie })
assert.equal((await request(workPath, 200, { method: 'PUT', value: { ...workInput, status: 'DONE' }, cookie: member.cookie })).data.status, 'DONE')
const delivery = (await post(workPath + '/delivery', 201, { title: '현장 납품', startDate: '2026-12-03', dueDate: '2026-12-04', assigneeId: observer.data.user.id }, lead.cookie)).data
assert.equal(delivery.sourceQuoteId, work.id)
assert.equal(delivery.company, workInput.company)
assert.equal(delivery.notes, workInput.notes)
await request(workPath, 200, { method: 'PUT', value: { ...workInput, status: 'DONE', assigneeId: observer.data.user.id }, cookie: lead.cookie })
await request(workPath, 403, { method: 'DELETE', cookie: member.cookie })
await request('work/' + delivery.id, 204, { method: 'DELETE', cookie: observer.cookie })
console.log('PASS team work sharing, month overlap, owner permissions and quote-to-delivery')

const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
function dayOffset(offset) {
  const date = new Date(today)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
const current = (await post('work', 201, { ...workInput, startDate: today, dueDate: today }, member.cookie)).data
const late = (await post('work', 201, { ...workInput, startDate: dayOffset(-1), dueDate: dayOffset(-1) }, member.cookie)).data
const overview = (await request('dashboard', 200, { cookie: observer.cookie })).data
assert.ok(overview.today.some(item => item.id === current.id))
assert.ok(overview.overdue.some(item => item.id === late.id))
assert.ok(overview.week.some(item => item.id === current.id))
assert.ok(overview.month.some(item => item.id === current.id))
await request('work/' + late.id, 200, { method: 'PUT', value: { ...workInput, startDate: dayOffset(-1), dueDate: dayOffset(-1), status: 'DONE' }, cookie: member.cookie })
assert.ok(!(await request('dashboard', 200, { cookie: observer.cookie })).data.overdue.some(item => item.id === late.id))
console.log('PASS dashboard date buckets and work updates')

const monday = dayOffset(-((new Date(today).getUTCDay() + 6) % 7))
const report = { accomplishments: '완료한 업무', issues: '지원 요청', nextPlan: '다음 주 계획', submit: false }
const reportsPath = 'reports/' + monday
await request(reportsPath + '/team', 403, { method: 'PUT', value: report, cookie: member.cookie })
await request(reportsPath + '/team', 200, { method: 'PUT', value: { ...report, submit: true }, cookie: lead.cookie })
assert.equal((await request(reportsPath, 200, { cookie: observer.cookie })).data.team.accomplishments, report.accomplishments)
await request(reportsPath + '/personal', 200, { method: 'PUT', value: report, cookie: member.cookie })
assert.equal((await request(reportsPath, 200, { cookie: lead.cookie })).data.submissions.length, 0)
const submitted = (await request(reportsPath + '/personal', 200, { method: 'PUT', value: { ...report, submit: true }, cookie: member.cookie })).data
assert.ok(submitted.report.submittedAt)
assert.ok(submitted.completed.some(item => item.id === late.id))
assert.equal((await request(reportsPath, 200, { cookie: lead.cookie })).data.submissions.length, 1)
assert.equal((await request(reportsPath, 200, { cookie: observer.cookie })).data.submissions.length, 0)
await request(reportsPath + '/personal', 409, { method: 'PUT', value: report, cookie: member.cookie })
console.log('PASS weekly personal drafts, leader submissions, team publication and frozen work references')

const own = (await post('personal/work', 201, { ...workInput, startDate: today, dueDate: today }, member.cookie)).data
assert.ok((await request('personal/work?month=' + today.slice(0, 7), 200, { cookie: member.cookie })).data.some(item => item.id === own.id))
for (const account of [lead, observer]) {
  await request('personal/work/' + own.id, 404, { cookie: account.cookie })
}
await request('work/' + own.id, 404, { cookie: member.cookie })
assert.ok(!(await request('dashboard', 200, { cookie: member.cookie })).data.today.some(item => item.id === own.id))
assert.ok((await request('personal/dashboard', 200, { cookie: member.cookie })).data.today.some(item => item.id === own.id))
console.log('PASS team and private workspace isolation')
const meeting = { agenda: '업무 검토', decisions: '견적 재확인', followups: '담당자 일정 확인' }
await request('meetings/daily/' + today, 401)
await request('meetings/daily/' + today, 200, { method: 'PUT', value: meeting, cookie: member.cookie })
assert.equal((await request('meetings/daily/' + today, 200, { cookie: observer.cookie })).data.decisions, meeting.decisions)
await request('meetings/daily/' + today, 403, { method: 'PUT', value: meeting, cookie: observer.cookie })
await request('meetings/weekly/' + monday, 200, { method: 'PUT', value: meeting, cookie: lead.cookie })
console.log('PASS daily and weekly meeting reports and edit permissions')

const live = (await post('work', 201, {
  ...workInput, time: '10:30', alerts: ['3일 전', '당일'], repeat: '매주',
}, member.cookie)).data
const saved = (await request('work/' + live.id, 200, { cookie: observer.cookie })).data
assert.equal(saved.time, '10:30')
assert.deepEqual(saved.alerts, ['3일 전', '당일'])
assert.equal(saved.repeat, '매주')
assert.ok((await request('work?scope=all', 200, { cookie: observer.cookie })).data.some(item => item.id === live.id))
assert.ok(!(await request('work?scope=all', 200, { cookie: observer.cookie })).data.some(item => item.id === own.id))
await request('work/' + live.id, 200, { method: 'PUT', value: { ...workInput, status: 'DONE' }, cookie: member.cookie })
assert.deepEqual((await request('work/' + live.id, 200, { cookie: observer.cookie })).data.alerts, saved.alerts)
console.log('PASS work time and reminders persistence, compatible updates and workspace isolation')
const meetingPath = 'meetings/daily/' + today
assert.ok((await request(meetingPath + '/work', 200, { cookie: member.cookie })).data.some(item => item.id === current.id))
await request(meetingPath, 400, { method: 'PUT', value: { ...meeting, workIds: [own.id], action: 'submit' }, cookie: member.cookie })
const pending = await request(meetingPath, 200, { method: 'PUT', value: { ...meeting, workIds: [current.id], action: 'submit' }, cookie: member.cookie })
assert.equal(pending.data.approvalStatus, 'PENDING')
await request(meetingPath, 403, { method: 'PUT', value: { action: 'approve' }, cookie: member.cookie })
const approval = await request(meetingPath, 200, { method: 'PUT', value: { action: 'approve' }, cookie: lead.cookie })
assert.equal(approval.data.approvalStatus, 'APPROVED')
assert.deepEqual(approval.data.workIds, [current.id])

// 다른 팀은 서로의 업무·회의·보고서·구성원을 보지 못합니다.
const otherInvite = await post('auth/invite', 201, { email: 'lead-two@example.test', teamId: salesTwo.id, role: 'LEAD' }, admin.cookie)
const otherLead = await post('auth/accept', 200, { token: otherInvite.data.token, name: '2팀 팀장', password })
assert.equal(otherLead.data.user.teamName, '기술영업 2팀')
assert.ok(!(await request('work?scope=all', 200, { cookie: otherLead.cookie })).data.some(item => item.id === current.id))
await request('work/' + current.id, 404, { cookie: otherLead.cookie })
await request('work/' + current.id, 404, { method: 'PUT', value: { ...workInput, status: 'DONE' }, cookie: otherLead.cookie })
assert.equal((await request(meetingPath, 200, { cookie: otherLead.cookie })).data, null)
assert.equal((await request(reportsPath, 200, { cookie: otherLead.cookie })).data.team, null)
assert.ok(!(await request('dashboard', 200, { cookie: otherLead.cookie })).data.today.some(item => item.id === current.id))
assert.deepEqual((await request('members', 200, { cookie: otherLead.cookie })).data.map(item => item.name), ['2팀 팀장'])
const teamMembers = (await request('members', 200, { cookie: member.cookie })).data
assert.ok(teamMembers.every(item => item.email) && teamMembers.length === 3)
await post('work', 400, { ...workInput, assigneeId: member.data.user.id }, otherLead.cookie)
await request('work/' + current.id, 400, { method: 'PUT', value: { ...workInput, assigneeId: otherLead.data.user.id }, cookie: lead.cookie })
console.log('PASS team isolation for work, meetings, reports, dashboard, members and assignment')

// 관리자는 ?team=으로 고른 팀을 읽기만 하고, 팀 정보·팀장 지정·팀 이동을 관리합니다.
await request('work?scope=all', 400, { cookie: admin.cookie })
assert.ok((await request('work?scope=all&team=' + salesOne.id, 200, { cookie: admin.cookie })).data.some(item => item.id === current.id))
assert.equal((await request(meetingPath + '?team=' + salesOne.id, 200, { cookie: admin.cookie })).data.approvalStatus, 'APPROVED')
assert.equal((await request(reportsPath + '?team=' + salesOne.id, 200, { cookie: admin.cookie })).data.team.accomplishments, report.accomplishments)
await request('work?team=' + salesOne.id, 403, { method: 'POST', value: workInput, cookie: admin.cookie })
await request('work/' + current.id + '?team=' + salesOne.id, 403, { method: 'DELETE', cookie: admin.cookie })
await request('users', 403, { cookie: lead.cookie })
await request('teams', 403, { method: 'POST', value: { name: '새 팀', kind: 'DEV', location: '대구 본사' }, cookie: lead.cookie })
const renamed = (await request('teams/' + salesTwo.id, 200, { method: 'PUT', value: { name: '기술영업 2팀', kind: 'SALES', location: '대구 본사' }, cookie: admin.cookie })).data
assert.equal(renamed.leadName, '2팀 팀장')
await request('teams/' + salesTwo.id, 400, { method: 'PUT', value: { name: '기술영업 1팀', kind: 'SALES', location: '대구 본사' }, cookie: admin.cookie })
const moved = (await request('users/' + observer.data.user.id, 200, { method: 'PUT', value: { teamId: salesTwo.id, role: 'LEAD' }, cookie: admin.cookie })).data
assert.equal(moved.teamName, '기술영업 2팀')
const accounts = (await request('users', 200, { cookie: admin.cookie })).data
assert.equal(accounts.find(item => item.id === otherLead.data.user.id).role, 'MEMBER')
assert.equal(accounts.find(item => item.id === observer.data.user.id).role, 'LEAD')
await request('users/' + admin.data.user.id, 409, { method: 'PUT', value: { teamId: salesOne.id, role: 'MEMBER' }, cookie: admin.cookie })
assert.ok(!(await request('work?scope=all', 200, { cookie: observer.cookie })).data.some(item => item.id === current.id))
assert.equal((await request('auth/session', 200, { cookie: observer.cookie })).data.user.teamName, '기술영업 2팀')
console.log('PASS admin read-only team view, team management, lead assignment and team moves')

// 팀 유형별 업무 구분: 개발형 팀은 개발·테스트 등을, 영업형 팀은 견적·납품 등을 씁니다.
const devTeam = teamList.find(team => team.name === '솔루션개발 1팀')
const devInvite = await post('auth/invite', 201, { email: 'dev-lead@example.test', teamId: devTeam.id, role: 'LEAD' }, admin.cookie)
const devLead = await post('auth/accept', 200, { token: devInvite.data.token, name: '개발 팀장', password })
assert.equal(devLead.data.user.teamKind, 'DEV')
const devWork = (await post('work', 201, { ...workInput, category: 'DEVELOP', company: null }, devLead.cookie)).data
assert.equal(devWork.category, 'DEVELOP')
await post('work', 400, { ...workInput, category: 'QUOTE' }, devLead.cookie)
await post('work', 400, { ...workInput, category: 'DEVELOP' }, lead.cookie)
await post('personal/work', 201, { ...workInput, category: 'TEST' }, devLead.cookie)
await post('personal/work', 400, { ...workInput, category: 'TEST' }, member.cookie)
console.log('PASS team kind categories for team and personal work')

// 알림 시점은 90일 전(장기 일정)부터 당일까지 고를 수 있습니다.
const longAlerts = ['90일 전', '30일 전', '7일 전', '3일 전', '1일 전', '당일']
const longTerm = (await post('work', 201, { ...workInput, alerts: longAlerts, repeat: '없음' }, member.cookie)).data
assert.deepEqual(longTerm.alerts, longAlerts)
await post('work', 400, { ...workInput, alerts: ['60일 전'] }, member.cookie)
console.log('PASS long-range reminder options')

// 초대 수락 대기 목록: 관리자는 전체, 팀장은 자기 팀만 보고, 재발송하면 같은 이메일의 초대는 1건으로 유지됩니다.
await post('auth/invite', 201, { email: 'pending-two@example.test', teamId: salesTwo.id }, admin.cookie)
await post('auth/invite', 201, { email: 'pending-one@example.test' }, lead.cookie)
const allInvites = (await request('auth/invites', 200, { cookie: admin.cookie })).data
assert.ok(allInvites.some(item => item.email === 'pending-two@example.test' && item.teamName === '기술영업 2팀'))
assert.ok(allInvites.some(item => item.email === 'pending-one@example.test'))
const teamInvites = (await request('auth/invites', 200, { cookie: lead.cookie })).data
assert.deepEqual(teamInvites.map(item => item.email), ['pending-one@example.test'])
await request('auth/invites', 403, { cookie: member.cookie })
await post('auth/invite', 201, { email: 'pending-one@example.test' }, lead.cookie)
assert.equal((await request('auth/invites', 200, { cookie: lead.cookie })).data.length, 1)
console.log('PASS pending invite lists by role and resend')
