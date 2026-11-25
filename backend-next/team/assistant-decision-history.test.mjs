import assert from 'node:assert/strict'
import test from 'node:test'
import { decisionEvidence } from './assistant-decision-history.mjs'

const work = { title: '장비 납품', company: '한빛연구소' }
const entry = (date, approvalStatus, decisions, linkedCount = 1) => ({
  route: `team-reports?kind=daily&date=${date}&team=2`, date, approvalStatus, decisions, linkedCount,
})

test('최종 승인, 이전 제안, 미기록 사유를 각 원문에 연결한다', () => {
  const approved = entry('2026-11-24', 'APPROVED', '납품일을 12월 9일로 확정했습니다. 변경 이유는 기록되어 있지 않습니다.')
  const draft = entry('2026-11-20', 'DRAFT', '납품일을 12월 7일로 제안했습니다.')
  const later = entry('2026-11-25', 'PENDING', '납품일을 12월 12일로 제안했습니다.')
  const [decision, proposal, reason] = decisionEvidence(work, [later, approved, draft])
  assert.deepEqual(decision.quotes.map(quote => quote.text), ['납품일을 12월 9일로 확정했습니다.'])
  assert.equal(decision.quotes[0].route, approved.route)
  assert.deepEqual(proposal.quotes.map(quote => quote.text), ['납품일을 12월 7일로 제안했습니다.'])
  assert.equal(proposal.quotes[0].route, draft.route)
  assert.equal(reason.quotes[0].route, approved.route)
  assert.match(reason.message, /확인되지/)
})

test('다른 업무와 함께 연결된 문장은 대상을 확인할 수 있을 때만 쓰고 사유는 명시된 경우만 사용한다', () => {
  const approved = entry('2026-11-24', 'APPROVED', '다른 장비 납기일을 12월 5일로 확정했습니다. 장비 납품 일정을 12월 9일로 결정했습니다. 장비 납품 일정 변경 사유: 운송사 배차 조정.', 2)
  const [decision, proposal, reason] = decisionEvidence(work, [approved])
  assert.deepEqual(decision.quotes.map(quote => quote.text), ['장비 납품 일정을 12월 9일로 결정했습니다.'])
  assert.deepEqual(proposal.quotes, [])
  assert.deepEqual(reason.quotes.map(quote => quote.text), ['장비 납품 일정 변경 사유: 운송사 배차 조정.'])
})
