import assert from 'node:assert/strict'

const base = process.env.TEAM_VERIFY_URL
if (!base || !/^http:\/\/127\.0\.0\.1:18\d{3}$/.test(base)) throw new Error('Use an isolated local team test server.')

const password = 'local-test-password'
const leadEmail = 'lead@example.test'
const memberEmail = 'member@example.test'
const observerEmail = 'observer@example.test'

for (const [path, method] of [
  ['records', 'GET'], ['schedules', 'GET'], ['tasks', 'GET'],
  ['calendar/tasks?month=2026-11', 'GET'], ['calendar/schedules?month=2026-11', 'GET'], ['ai/generate', 'POST'],
]) {
  const response = await fetch(base + '/api/' + path, { method })
  assert.equal(response.status, 404, method + ' /api/' + path)
}

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
// 처음 설치: 첫 사용자가 소속 팀과 직급을 골라 관리자 겸 팀장이 됩니다(관리자 겸직). 이후에는 초대로만 가입합니다.
const firstSession = (await request('auth/session', 200)).data
assert.equal(firstSession.setupRequired, true)
assert.deepEqual(firstSession.teams.map(team => team.name), ['기술영업 1팀', '기술영업 2팀', '기술영업팀(서울지사)', '솔루션개발 1팀', '솔루션개발 2팀', '경영지원팀', '기업부설연구소'])
const supportTeam = firstSession.teams.find(team => team.name === '경영지원팀')
const admin = await post('auth/setup', 200, { email: 'admin@example.test', name: '대표 계정', password })
assert.equal(admin.data.user.role, 'MEMBER')
assert.equal(admin.data.user.isAdmin, true)
assert.equal(admin.data.user.title, '대표')
assert.equal(admin.data.user.membershipTeamId, null)
assert.equal(admin.data.user.teamId, null)
assert.equal(admin.data.user.teamName, '회사')
await post('auth/setup', 409, { email: 'admin2@example.test', name: '대표 다시 설정', password })
const laterSession = (await request('auth/session', 200)).data
assert.equal(laterSession.setupRequired, false)
assert.equal(laterSession.teams, undefined)
const teamList = (await request('teams', 200, { cookie: admin.cookie })).data
const [salesOne, salesTwo] = teamList
await post('auth/invite', 401, { email: memberEmail })
const leadInvite = await post('auth/invite', 201, { email: leadEmail, teamId: salesOne.id, role: 'LEAD' }, admin.cookie)
assert.equal(leadInvite.data.expiresInDays, 7)
await post('auth/accept', 400, { token: leadInvite.data.token, name: '팀장', password, title: '사장' })
const lead = await post('auth/accept', 200, { token: leadInvite.data.token, name: '팀장', password, title: '팀장' })
assert.equal(lead.data.user.role, 'LEAD')
assert.equal(lead.data.user.isAdmin, false)
assert.equal(lead.data.user.title, '팀장')
assert.equal(lead.data.user.teamName, '기술영업 1팀')
await post('auth/invite', 409, { email: 'lead-two@example.test', teamId: salesOne.id, role: 'LEAD' }, admin.cookie)
await post('auth/invite', 403, { email: 'outsider@example.test', teamId: salesTwo.id }, lead.cookie)
await post('auth/invite', 403, { email: 'outsider@example.test', role: 'LEAD' }, lead.cookie)

async function inviteMember(email, name) {
  const invite = await post('auth/invite', 201, { email }, lead.cookie)
  const payload = { token: invite.data.token, name, password }
  const member = await post('auth/accept', 200, payload)
  assert.equal(member.data.user.role, 'MEMBER')
  assert.equal(member.data.user.title, '프로')
  assert.equal(member.data.user.teamId, salesOne.id)
  await post('auth/accept', 400, payload)
  return member
}

const member = await inviteMember(memberEmail, '팀원')
// 팀원도 자기 팀에 팀원으로 초대할 수 있습니다(팀장 자리·다른 팀은 거절). 팀원은 본인이 보낸 초대만 목록에서 봅니다.
await post('auth/invite', 201, { email: observerEmail }, member.cookie)
await post('auth/invite', 403, { email: 'member-lead@example.test', role: 'LEAD' }, member.cookie)
await post('auth/invite', 403, { email: 'member-other@example.test', teamId: salesOne.id + 1 }, member.cookie)
const ownInvites = (await request('auth/invites', 200, { cookie: member.cookie })).data
assert.deepEqual(ownInvites.map(item => item.email), [observerEmail])
assert.equal(ownInvites[0].invitedByName, '팀원')
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
  ...workInput, time: '10:30', endTime: '11:45', alerts: ['3일 전', '당일'], repeat: '매주',
}, member.cookie)).data
const saved = (await request('work/' + live.id, 200, { cookie: observer.cookie })).data
assert.equal(saved.time, '10:30')
assert.equal(saved.endTime, '11:45')
assert.equal(saved.createdBy, member.data.user.id)
assert.ok(Number.isFinite(Date.parse(saved.createdAt)))
assert.deepEqual(saved.alerts, ['3일 전', '당일'])
assert.equal(saved.repeat, '매주')
assert.ok((await request('work?scope=all', 200, { cookie: observer.cookie })).data.some(item => item.id === live.id))
assert.ok(!(await request('work?scope=all', 200, { cookie: observer.cookie })).data.some(item => item.id === own.id))
await request('work/' + live.id, 200, { method: 'PUT', value: { ...workInput, status: 'DONE' }, cookie: member.cookie })
const updatedWork = (await request('work/' + live.id, 200, { cookie: observer.cookie })).data
assert.deepEqual(updatedWork.alerts, saved.alerts)
assert.equal(updatedWork.endTime, saved.endTime)
const history = (await request('work/' + live.id + '/history', 200, { cookie: observer.cookie })).data
assert.equal(history[0].changes.status.before, 'WAITING')
assert.equal(history[0].changes.status.after, 'DONE')
const attachmentPath = 'work/' + live.id + '/attachments'
const testPdf = '%PDF-1.7\n'
const upload = await fetch(base + '/api/team/' + attachmentPath + '?name=review.pdf', {
  method: 'POST', headers: { Cookie: member.cookie, 'Content-Type': 'application/pdf' }, body: testPdf,
})
assert.equal(upload.status, 201)
const attachment = await upload.json()
const download = await fetch(base + '/api/team/' + attachmentPath + '/' + attachment.id, { headers: { Cookie: observer.cookie } })
assert.equal(download.status, 200)
assert.match(download.headers.get('Content-Disposition'), /^attachment;/)
assert.equal(await download.text(), testPdf)
await request(attachmentPath + '/' + attachment.id, 204, { method: 'DELETE', cookie: member.cookie })
assert.deepEqual((await request(attachmentPath, 200, { cookie: member.cookie })).data, [])
console.log('PASS work time and reminders persistence, compatible updates and workspace isolation')
const meetingPath = 'meetings/daily/' + today
assert.ok((await request(meetingPath + '/work', 200, { cookie: member.cookie })).data.some(item => item.id === current.id))
await request(meetingPath, 400, { method: 'PUT', value: { ...meeting, workIds: [own.id], action: 'submit' }, cookie: member.cookie })
const pending = await request(meetingPath, 200, { method: 'PUT', value: { ...meeting, workIds: [current.id], action: 'submit' }, cookie: member.cookie })
assert.ok((await request('work/' + current.id + '/meetings', 200, { cookie: member.cookie })).data.some(item => item.kind === 'daily' && item.day === today))
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

const setAccount = (account, value, cookie = admin.cookie, status = 200) =>
  request('users/' + account.data.user.id, status, { method: 'PUT', value, cookie })
const savedProfile = await post('auth/profile', 200, { name: '대표 계정' }, admin.cookie)
assert.equal(savedProfile.data.user.name, '대표 계정')
await setAccount(admin, { title: '대표', teamId: null }, admin.cookie, 403)
assert.ok((await request('work?scope=all&team=' + salesOne.id, 200, { cookie: admin.cookie })).data.some(item => item.id === current.id))
const companyReport = (await request(reportsPath + '?team=' + salesOne.id, 200, { cookie: admin.cookie })).data
assert.equal(companyReport.team.accomplishments, report.accomplishments)
assert.ok(companyReport.submissions.some(item => item.userId === member.data.user.id))
await request('users', 403, { cookie: lead.cookie })
const renamed = (await request('teams/' + salesTwo.id, 200, { method: 'PUT', value: { name: '기술영업 2팀', kind: 'SALES', location: '대구 본사' }, cookie: admin.cookie })).data
assert.equal(renamed.leadName, '2팀 팀장')
await setAccount(observer, { teamId: salesTwo.id, title: '팀장' }, admin.cookie, 409)
const moved = await setAccount(observer, { teamId: salesTwo.id, title: '팀장', replaceLead: true })
assert.equal(moved.data.managedTeamId, salesTwo.id)
const accounts = (await request('users', 200, { cookie: admin.cookie })).data
assert.equal(accounts.find(item => item.id === otherLead.data.user.id).title, '프로')
assert.equal(accounts.find(item => item.id === observer.data.user.id).title, '팀장')
await request('work?scope=all&team=' + salesTwo.id, 403, { cookie: lead.cookie })
console.log('PASS company setup, personal profile, self-management denial, team isolation and explicit lead replacement')

const director = (await setAccount(member, { title: '본부장', teamId: null, managedTeamId: supportTeam.id })).data
assert.equal(director.teamId, null)
assert.equal(director.isAdmin, true)
assert.equal(director.managedTeamId, supportTeam.id)
await setAccount(otherLead, { title: '대표', teamId: null }, admin.cookie, 409)
await setAccount(otherLead, { title: '본부장', teamId: null }, admin.cookie, 409)
const session = (await request('auth/session', 200, { cookie: member.cookie })).data.user
assert.equal(session.membershipTeamId, null)
assert.equal(session.managedTeamId, supportTeam.id)
assert.equal(session.title, '본부장')
const protectedPresident = await setAccount(admin, { title: '프로', teamId: salesOne.id }, member.cookie, 403)
assert.equal(protectedPresident.data.code, 'HIGHER_RANK')
const protectedAccess = await request('users/' + admin.data.user.id + '/access', 403, { method: 'PUT', value: { active: false }, cookie: member.cookie })
assert.equal(protectedAccess.data.code, 'HIGHER_RANK')
assert.equal((await request('auth/session', 200, { cookie: admin.cookie })).data.user.title, '대표')
const directorWork = (await post('work', 201, { ...workInput, category: 'PURCHASE', company: null }, member.cookie)).data
assert.equal(directorWork.category, 'PURCHASE')
assert.ok((await request('work?scope=all&team=' + salesOne.id, 200, { cookie: member.cookie })).data.some(item => item.id === current.id))
await request('work?team=' + salesOne.id, 403, { method: 'POST', value: workInput, cookie: member.cookie })
const otherMeeting = 'meetings/daily/' + today
await request(otherMeeting, 200, { method: 'PUT', value: { ...meeting, action: 'submit' }, cookie: observer.cookie })
const approved = (await request(otherMeeting + '/approval?team=' + salesTwo.id, 200, { method: 'PUT', value: {}, cookie: member.cookie })).data
assert.ok(approved.approvedBy)
assert.ok(Number.isFinite(Date.parse(approved.approvedAt)))
const orgHistory = (await request('users/history', 200, { cookie: admin.cookie })).data
assert.ok(orgHistory.some(item => item.changes.title?.after === '본부장'))
console.log('PASS company director and team lead overlap, submitted reports, company approval, audit and unique titles')

// '팀장' 직급은 팀장 권한과 같고 부서마다 1명입니다. 초대 정보로 어느 팀에 어떤 자리인지 보여줍니다.
const seoulTeam = teamList.find(team => team.name === '기술영업팀(서울지사)')
const seoulInvite = await post('auth/invite', 201, { email: 'seoul-lead@example.test', teamId: seoulTeam.id, role: 'LEAD' }, admin.cookie)
assert.deepEqual((await request('auth/invite?token=' + seoulInvite.data.token, 200)).data, { email: 'seoul-lead@example.test', role: 'LEAD', teamName: '기술영업팀(서울지사)' })
await request('auth/invite?token=' + 'f'.repeat(64), 400)
const seoulLead = await post('auth/accept', 200, { token: seoulInvite.data.token, name: '서울 팀장', password })
assert.equal(seoulLead.data.user.title, '팀장')
assert.equal(seoulLead.data.user.role, 'LEAD')
const proInvite = await post('auth/invite', 201, { email: 'pro-one@example.test' }, seoulLead.cookie)
await post('auth/accept', 400, { token: proInvite.data.token, name: '팀장 희망', password, title: '팀장' })
const pro = await post('auth/accept', 200, { token: proInvite.data.token, name: '서울 프로', password })
assert.equal(pro.data.user.title, '프로')
await request('users/' + pro.data.user.id, 400, { method: 'PUT', value: { teamId: seoulTeam.id, role: 'MEMBER', title: '팀장' }, cookie: admin.cookie })
const promoted = (await request('users/' + pro.data.user.id, 200, { method: 'PUT', value: { teamId: seoulTeam.id, title: '팀장', replaceLead: true }, cookie: admin.cookie })).data
assert.equal(promoted.title, '팀장')
const seoulMembers = (await request('members?team=' + seoulTeam.id, 200, { cookie: admin.cookie })).data
assert.deepEqual(seoulMembers.filter(item => item.title === '팀장').map(item => item.name), ['서울 프로'])
assert.equal(seoulMembers.find(item => item.name === '서울 팀장').title, '프로')
console.log('PASS 팀장 title tied to lead role, one per department, invite info')

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
// 기업부설연구소는 기술 유형이며 업무 구분은 개발 유형과 같습니다.
const researchTeam = teamList.find(team => team.name === '기업부설연구소')
assert.equal(researchTeam.kind, 'TECH')
const researchInvite = await post('auth/invite', 201, { email: 'research-lead@example.test', teamId: researchTeam.id, role: 'LEAD' }, admin.cookie)
const researchLead = await post('auth/accept', 200, { token: researchInvite.data.token, name: '연구소 팀장', password })
assert.equal(researchLead.data.user.teamKind, 'TECH')
await post('work', 201, { ...workInput, category: 'TEST', company: null }, researchLead.cookie)
await post('work', 400, { ...workInput, category: 'QUOTE' }, researchLead.cookie)
console.log('PASS team kind categories for team and personal work')

// 알림 시점은 90일 전(장기 일정)부터 당일까지 고를 수 있습니다.
const longAlerts = ['90일 전', '30일 전', '7일 전', '3일 전', '1일 전', '당일']
const longTerm = (await post('work', 201, { ...workInput, alerts: longAlerts, repeat: '없음' }, otherLead.cookie)).data
assert.deepEqual(longTerm.alerts, longAlerts)
await post('work', 400, { ...workInput, alerts: ['60일 전'] }, otherLead.cookie)
console.log('PASS long-range reminder options')

// 초대 수락 대기 목록: 관리자는 전체, 팀장은 자기 팀, 다른 팀 사람은 이 팀 초대를 보지 못하고, 재발송하면 같은 이메일의 초대는 1건으로 유지됩니다.
await post('auth/invite', 201, { email: 'pending-two@example.test', teamId: salesTwo.id }, admin.cookie)
await post('auth/invite', 201, { email: 'pending-one@example.test' }, lead.cookie)
const allInvites = (await request('auth/invites', 200, { cookie: admin.cookie })).data
assert.ok(allInvites.some(item => item.email === 'pending-two@example.test' && item.teamName === '기술영업 2팀'))
assert.ok(allInvites.some(item => item.email === 'pending-one@example.test'))
const teamInvites = (await request('auth/invites', 200, { cookie: lead.cookie })).data
assert.ok(teamInvites.some(item => item.email === 'pending-one@example.test'))
assert.ok(teamInvites.every(item => item.teamId === salesOne.id))
assert.ok((await request('auth/invites', 200, { cookie: otherLead.cookie })).data.every(item => item.teamId !== salesOne.id))
await post('auth/invite', 201, { email: 'pending-one@example.test' }, lead.cookie)
assert.equal((await request('auth/invites', 200, { cookie: lead.cookie })).data.filter(item => item.email === 'pending-one@example.test').length, 1)
console.log('PASS pending invite lists by role and resend')

const accountInvite = await post('auth/invite', 201, { email: 'account-lifecycle@example.test' }, lead.cookie)
const account = await post('auth/accept', 200, { token: accountInvite.data.token, name: '계정 검증', password })
const secondSession = await post('auth/login', 200, { email: 'account-lifecycle@example.test', password })
const newPassword = 'changed-test-password'
await post('auth/password', 204, { currentPassword: password, newPassword }, account.cookie)
assert.equal((await request('auth/session', 200, { cookie: secondSession.cookie })).data.user, null)
const changed = await post('auth/login', 200, { email: 'account-lifecycle@example.test', password: newPassword })
await request('users/' + admin.data.user.id + '/access', 403, { method: 'PUT', value: { active: false }, cookie: admin.cookie })
await request('users/' + account.data.user.id + '/access', 204, { method: 'PUT', value: { active: false }, cookie: admin.cookie })
assert.equal((await request('auth/session', 200, { cookie: changed.cookie })).data.user, null)
await request('users/' + account.data.user.id + '/access', 204, { method: 'PUT', value: { active: true }, cookie: admin.cookie })
await post('auth/login', 200, { email: 'account-lifecycle@example.test', password: newPassword })
console.log('PASS password change, session revocation, account deactivation and reactivation')

const removalTarget = await inviteMember('remove-member@example.test', '내보내기 검증')
const removalId = removalTarget.data.user.id
const removal = { userId: removalId }
const teamWork = (await post('work', 201, workInput, removalTarget.cookie)).data
const privateWork = (await post('personal/work', 201, workInput, removalTarget.cookie)).data
await request(reportsPath + '/personal', 200, { method: 'PUT', value: { ...report, submit: true }, cookie: removalTarget.cookie })
await post('users/remove-member', 403, removal, removalTarget.cookie)
await post('users/remove-member', 403, removal, observer.cookie)
await post('users/remove-member', 403, { userId: otherLead.data.user.id }, lead.cookie)
await post('users/remove-member', 403, { userId: lead.data.user.id }, lead.cookie)
await post('users/remove-member', 204, removal, lead.cookie)
await post('users/remove-member', 403, removal, lead.cookie)
const removedUser = (await request('auth/session', 200, { cookie: removalTarget.cookie })).data.user
assert.equal(removedUser.teamId, null)
assert.equal(removedUser.teamName, '소속 없음')
await request(`work/${teamWork.id}?team=${salesOne.id}`, 403, { cookie: removalTarget.cookie })
await request(`work/${teamWork.id}`, 200, { cookie: lead.cookie })
await request(`personal/work/${privateWork.id}`, 200, { cookie: removalTarget.cookie })
assert.ok((await request(reportsPath, 200, { cookie: lead.cookie })).data.submissions.some(item => item.userId === removalId))
assert.ok(!(await request('members', 200, { cookie: lead.cookie })).data.some(item => item.id === removalId))
const removalHistory = (await request('users/history', 200, { cookie: admin.cookie })).data
assert.deepEqual(removalHistory[0].changes.teamId, { before: salesOne.id, after: null })
await request('users/' + removalId, 200, { method: 'PUT', value: { title: '프로', teamId: salesTwo.id }, cookie: admin.cookie })
assert.equal((await request('auth/session', 200, { cookie: removalTarget.cookie })).data.user.teamId, salesTwo.id)
console.log('PASS team member removal, record retention, personal access, audit and reassignment')

const ownMembership = (teamId, cookie = member.cookie, status = 204) =>
  request('users/my-membership', status, { method: 'PUT', value: { teamId }, cookie })
await ownMembership(salesTwo.id, admin.cookie, 403)
await ownMembership(salesTwo.id, lead.cookie, 403)
await ownMembership(2147483647, member.cookie, 400)
await request('users/my-membership', 400, { method: 'PUT', value: { teamId: salesTwo.id, managedTeamId: salesTwo.id }, cookie: member.cookie })
await ownMembership(salesTwo.id)
const assignedDirector = (await request('auth/session', 200, { cookie: member.cookie })).data.user
assert.equal(assignedDirector.membershipTeamId, salesTwo.id)
assert.equal(assignedDirector.membershipTeamName, salesTwo.name)
assert.equal(assignedDirector.managedTeamId, supportTeam.id)
assert.equal(assignedDirector.teamId, supportTeam.id)
assert.equal(assignedDirector.isAdmin, true)
const membershipHistory = (await request('users/history', 200, { cookie: admin.cookie })).data[0]
assert.equal(membershipHistory.actor, membershipHistory.target)
assert.deepEqual(membershipHistory.changes, { teamId: { before: null, after: salesTwo.id } })
await ownMembership(null)
await setAccount(member, { title: '본부장', teamId: salesOne.id, managedTeamId: null })
const directorWithoutLead = (await request('auth/session', 200, { cookie: member.cookie })).data.user
assert.equal(directorWithoutLead.teamId, salesOne.id)
assert.equal(directorWithoutLead.managedTeamId, null)
assert.equal(directorWithoutLead.role, 'MEMBER')
console.log('PASS director membership, separate management scope, permissions and audit')
