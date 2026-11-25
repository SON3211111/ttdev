import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeAssistantSources, vectorFilter, sourceFingerprint } from './assistant-vector.mjs'

test('벡터 검색 범위는 자기 개인 업무와 열람 가능한 팀으로 제한한다', () => {
  const own = { key: 'scope', match: { value: 'owner:3' } }
  assert.deepEqual(vectorFilter({ id: 3, teamId: null }), { should: [own] })
  assert.deepEqual(vectorFilter({ id: 3, teamId: 5 }), { should: [own, { key: 'scope', match: { value: 'team:5' } }] })
  assert.deepEqual(vectorFilter({ id: 3, isAdmin: true }), { should: [own, { key: 'kind', match: { value: 'team' } }] })
})

test('현재 원문과 일치하는 벡터만 키워드 결과와 합친다', () => {
  const exact = { route: 'work/5?team=2', title: '견적', context: '팀', date: '2026-11-01', excerpt: '업체명' }
  const similar = { ...exact, route: 'work/6?team=2', title: '출고', excerpt: '현재 원문' }
  const changed = { ...exact, route: 'work/7?team=2', excerpt: '수정된 원문' }
  const hits = [exact, similar, { ...changed, excerpt: '이전 원문' }, { ...exact, route: 'work/8?team=3' }]
    .map(source => ({ route: source.route, fingerprint: sourceFingerprint(source) }))
  assert.deepEqual(mergeAssistantSources([exact], [exact, similar, changed], hits), [exact, similar])
})
