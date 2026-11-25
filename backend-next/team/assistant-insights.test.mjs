import assert from 'node:assert/strict'
import test from 'node:test'
import { approvalQuestion, helpQuestion, meetingQuestion, orgQuestion } from './assistant-insights.mjs'
import { assistant } from './team-assistant.mjs'

test('인사·짧은 질문은 안내로, 업무 질문은 안내로 보내지 않는다', () => {
  for (const question of ['안녕', 'ㅎㅇ', '업무', '도움말', 'hi']) assert.equal(helpQuestion(question), true, question)
  for (const question of ['이번주', '이번 주 업무', '안녕하세요 이번 주 업무 알려줘']) assert.equal(helpQuestion(question), false, question)
})

test('팀장·구성원·대표 질문을 조직 조회로 나눈다', () => {
  assert.deepEqual(orgQuestion('기술영업 2팀 팀장 누구야?'), { type: 'lead', team: '기술영업 2팀' })
  assert.deepEqual(orgQuestion('우리 팀장 누구야'), { type: 'lead', team: '우리팀' })
  assert.deepEqual(orgQuestion('우리 팀원 누구 있어?'), { type: 'members', team: '우리팀' })
  assert.deepEqual(orgQuestion('솔루션개발 2팀 구성원 누구야?'), { type: 'members', team: '솔루션개발 2팀' })
  assert.deepEqual(orgQuestion('대표 누구야?'), { type: 'executive', title: '대표' })
  assert.equal(orgQuestion('김지우 팀장 업무 뭐야'), null)
  assert.equal(orgQuestion('그 업무 담당자 누구야?'), null)
})

test('결재·회의 질문을 구분한다', () => {
  assert.equal(approvalQuestion('보고서 결재 대기 중인 거 있어?'), true)
  assert.equal(approvalQuestion('승인 안 된 회의록'), true)
  assert.equal(meetingQuestion('어제 일일회의 내용 요약해줘'), true)
  assert.equal(meetingQuestion('다음 주 월요일 회의 있어?'), true)
  assert.equal(meetingQuestion('회의에서 왜 바뀌었어?'), false)
  assert.equal(meetingQuestion('회의 몇 명 참석했어?'), false)
})

test('정확한 숫자·사람을 묻는데 조회로 답하지 못한 질문은 모델을 부르지 않고 원문만 보여준다', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Model should not run') })
  const source = { route: 'work/1?team=5', title: '삼성 견적', context: '기술영업 1팀', date: '2026-11-25', excerpt: '견적', owner: null, team: 5 }
  const db = { request: () => ({ input() {}, query: async () => ({ recordset: [source] }) }) }
  const request = new Request('http://localhost/api/team/assistant', { method: 'POST', body: JSON.stringify({ question: '삼성 견적 평균 금액 통계 알려줘' }) })
  const response = await assistant(db, request, { id: 1, teamId: 5, isAdmin: true })
  const body = await response.json()
  assert.match(body.answer, /정확한 숫자나 사람을 계산해 드릴 수 없어/)
  assert.equal(body.sources.length, 1)
  assert.equal(fetch.mock.calls.filter(call => String(call.arguments[0]).includes('/generate')).length, 0)
})
