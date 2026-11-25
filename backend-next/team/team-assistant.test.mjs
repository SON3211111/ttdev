import assert from 'node:assert/strict'
import test from 'node:test'
import { assistant } from './team-assistant.mjs'
import { teamBriefing } from './team-work.mjs'
import { workQuestion, workPeriod } from './assistant-work-query.mjs'

test('단일 원문의 후속 마감일 질문은 최신 DB 값을 바로 답한다', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Model should not run') })
  const source = { route: 'work/7?team=2', title: '장비 출고', context: '기술영업', date: '2026-12-07', excerpt: '마감일 12월 7일' }
  const db = { request: () => ({ input() {}, query: async () => ({ recordset: [source] }) }) }
  const request = new Request('http://localhost/api/team/assistant', {
    method: 'POST', body: JSON.stringify({ question: '그거 언제까지야?', references: [source.route] }),
  })
  const response = await assistant(db, request, { id: 3, teamId: 2 })
  assert.match((await response.json()).answer, /장비 출고.*2026-12-07/)
  assert.equal(response.headers.get('x-assistant-mode'), 'reference')
  assert.equal(fetch.mock.calls.length, 0)
})

test('원문을 가리키는 설명 질문은 제목으로 검색을 보강하고 질문과 원문을 따로 전달한다', async t => {
  const user = { id: 3, teamId: 2 }
  const source = { route: 'team-reports?kind=daily&date=2026-12-07&team=2', title: '출고회의', context: '기술영업', date: '2026-12-07', approvalStatus: 'PENDING', excerpt: '출고회의에서 운송 일정을 다시 확인했다.' }
  const approved = { ...source, route: 'team-reports?kind=daily&date=2026-12-08&team=2', title: '승인 회의', approvalStatus: 'APPROVED' }
  let prompt
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.pathname !== '/generate') throw new Error('벡터 서비스 사용 불가')
    prompt = JSON.parse(JSON.parse(options.body).prompt)
    return Response.json({ response: '운송 일정을 다시 확인한 사실만 확인됩니다.' })
  })
  const values = []
  const db = { request() {
    const params = {}
    return { input(name, _type, value) { params[name] = value }, async query(sql) {
      values.push(params)
      return { recordset: sql.includes('FROM team_sessions') ? [user] : sql.includes('v.route=@route') ? [source] : [source, approved] }
    } }
  } }
  const request = new Request('http://localhost/api/team/assistant', {
    method: 'POST', headers: { Cookie: 'ttech_session=' + 'a'.repeat(64) },
    body: JSON.stringify({ question: '그거 왜 바뀌었어?', references: [source.route] }),
  })
  const response = await assistant(db, request, user)
  assert.equal(response.headers.get('x-assistant-outcome'), 'answered')
  assert.match(response.headers.get('server-timing'), /generation;dur=/)
  assert.ok(values.some(params => params.term0 === source.title))
  assert.equal(prompt.question, '그거 왜 바뀌었어?')
  assert.equal(prompt.previousSubject, source.title)
  assert.equal(prompt.environment.timeZone, 'Asia/Seoul')
  assert.equal(prompt.sources[0].approvalStatus, 'APPROVED')
  assert.equal(prompt.sources[1].recordState, '결재 대기')
  assert.deepEqual((await response.json()).sources, [source, approved])
})

test('띄어쓰기가 빠진 팀 인원 질문은 팀 조회 범위에서 DB 건수를 반환한다', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Model should not run') })
  const bindings = {}
  const db = { request: () => ({
    input(name, _type, value) { bindings[name] = value },
    query: async () => ({ recordset: [{ name: '솔루션개발 2팀', memberCount: 4 }] }),
  }) }
  for (const question of ['현재 솔루션개발2팀의 팀원수가 몇명이야?', '솔루션개발 2팀 인원은 몇명이야 ?',
    '솔루션개발 2팀은 몇 명이야?', '솔루션개발 2팀에 몇 명 있어?', '솔루션개발 2팀 구성원 수 알려줘',
    '솔루션개발 2팀 사람 몇명이야?', '솔루션개발 2팀 인원이 어떻게 돼?', '솔루션개발 2팀 인원수는?',
    '솔루션개발 2팀 총 인원', '솔루션개발 2팀 몇명임', '솔루션개발 2팀 총원 알려줘']) {
    const request = new Request('http://localhost/api/team/assistant', { method: 'POST', body: JSON.stringify({ question }) })
    const response = await assistant(db, request, { id: 3, teamId: 5, isAdmin: false })
    assert.match((await response.json()).answer, /솔루션개발 2팀.*4명/, question)
    assert.equal(response.headers.get('x-assistant-mode'), 'structured')
  }
  assert.equal(bindings.teamName, '솔루션개발2팀')
  assert.equal(bindings.team, 5)
  assert.equal(bindings.allTeams, 0)
  assert.equal(fetch.mock.calls.length, 0)
})

test('부서를 특정하지 않은 총인원 질문은 조회 가능한 부서 합계와 부서별 인원을 반환한다', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Model should not run') })
  const bindings = {}
  const db = { request: () => ({
    input(name, _type, value) { bindings[name] = value },
    query: async sql => {
      assert.doesNotMatch(sql, /@teamName/)
      if (/team_id IS NULL/.test(sql)) return { recordset: [{ count: 2 }] }
      return { recordset: [{ name: '기술영업 1팀', memberCount: 3 }, { name: '기업부설연구소', memberCount: 2 }] }
    },
  }) }
  const ask = (question, user) => assistant(db, new Request('http://localhost/api/team/assistant', { method: 'POST', body: JSON.stringify({ question }) }), user)
  for (const question of ['부서의 총인원은 몇명이야?', '전체 부서 인원 몇명?', '회사 전체 인원은?', '부서별 인원 알려줘', '총사원수 몇명이야?', '전체 직원 몇명?']) {
    const response = await ask(question, { id: 1, teamId: 5, isAdmin: true })
    assert.equal((await response.json()).answer,
      '현재 활성 사원은 총 7명입니다. 부서 소속 5명, 부서 미소속 2명입니다.\n· 기술영업 1팀 3명\n· 기업부설연구소 2명\n· 부서 미소속 2명', question)
    assert.equal(response.headers.get('x-assistant-mode'), 'structured')
  }
  assert.equal(bindings.team, 5)
  assert.equal((await (await ask('총사원수 몇명이야?', { id: 3, teamId: 5, isAdmin: false })).json()).answer,
    '열람할 수 있는 2개 부서의 현재 활성 구성원은 총 5명입니다.\n· 기술영업 1팀 3명\n· 기업부설연구소 2명')
})

test('여러 부서를 묶는 이름은 정확한 부서가 없을 때 앞부분이 같은 부서를 합산한다', async () => {
  const db = { request: () => {
    const bindings = {}
    return { input(name, _type, value) { bindings[name] = value }, query: async () => ({ recordset: bindings.stem === '솔루션개발'
      ? [{ name: '솔루션개발 1팀', memberCount: 4 }, { name: '솔루션개발 2팀', memberCount: 5 }] : [] }) }
  } }
  for (const question of ['솔루션개발팀 전체 몇명이야?', '솔루션 개발팀은 몇 명', '솔루션개발팀 전체는 인원 몇명']) {
    const request = new Request('http://localhost/api/team/assistant', { method: 'POST', body: JSON.stringify({ question }) })
    const answer = (await (await assistant(db, request, { id: 1, teamId: 5, isAdmin: true })).json()).answer
    assert.equal(answer, '솔루션개발팀 전체(2개 부서)의 현재 활성 구성원은 총 9명입니다.\n· 솔루션개발 1팀 4명\n· 솔루션개발 2팀 5명', question)
  }
})

test('팀으로 끝나지 않는 부서와 우리 부서 인원 질문도 팀 조회로 보낸다', async () => {
  const names = []
  const db = { request: () => {
    const bindings = {}
    return { input(name, _type, value) { bindings[name] = value }, query: async () => { names.push(bindings.teamName); return { recordset: [{ name: 'X', memberCount: 1 }] } } }
  } }
  for (const question of ['기업부설연구소 인원 몇명?', '우리 부서 인원 몇명이야?', '솔루션개발 2팀 부서 인원']) {
    const request = new Request('http://localhost/api/team/assistant', { method: 'POST', body: JSON.stringify({ question }) })
    await assistant(db, request, { id: 3, teamId: 5, isAdmin: false })
  }
  assert.deepEqual(names, ['기업부설연구소', '우리팀', '솔루션개발2팀'])
})

test('팀 이름과 인원 단어가 있어도 업무·회의·명단 질문은 인원수로 답하지 않는다', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline') })
  const db = { request: () => ({ input() {}, query: async () => ({ recordset: [] }) }) }
  for (const question of ['솔루션개발 2팀 인원 배정된 업무 알려줘', '솔루션개발 2팀 회의 몇 명 참석했어?',
    '솔루션개발 2팀 사람 누구야?', '솔루션개발 2팀 구성원 명단 보여줘', '솔루션개발 2팀 몇 명이 맡았어?']) {
    const request = new Request('http://localhost/api/team/assistant', { method: 'POST', body: JSON.stringify({ question }) })
    const answer = await assistant(db, request, { id: 3, teamId: 5, isAdmin: false }).then(r => r.json(), () => null)
    assert.doesNotMatch(answer?.answer ?? '', /활성 구성원은|해당 팀을 찾지 못했습니다/, question)
  }
})

test('다른 표현과 날짜 후속 질문을 같은 구조로 읽는다', () => {
  const first = workQuestion('손정익님 담당 건 뭐 있어?')
  assert.equal(first.name, '손정익')
  const due = workQuestion('그중 이번 주 마감만', first)
  assert.deepEqual(due, { ...first, period: 'thisWeek', dateField: 'due' })
  assert.deepEqual(workQuestion('다음 주는?', due), { ...due, period: 'nextWeek' })
  assert.equal(workQuestion('완료된 것만', due).status, 'done')
  assert.equal(workQuestion('삼성전자 납기가 왜 밀렸어?', due), null)
  assert.deepEqual(workPeriod('nextWeek', '2026-12-30'), ['2027-01-04', '2027-01-10'])
})

test('이름과 직급이 붙은 담당 업무 질문을 DB에서 직접 조회한다', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Model should not run') })
  const bindings = {}
  const source = { route: 'work/7?team=2', title: '납품 확인', context: '기술영업', date: '2026-11-25', excerpt: '진행 중' }
  const db = { request: () => ({ input(name, _type, value) { bindings[name] = value }, query: async () => ({ recordset: [source] }) }) }
  const request = new Request('http://localhost/api/team/assistant', {
    method: 'POST', body: JSON.stringify({ question: '손정익프로가 지금 맡은 업무 뭐가 있어?' }),
  })
  const result = await (await assistant(db, request, { id: 7, teamId: 2, isAdmin: false })).json()
  assert.equal(bindings.name, '손정익')
  assert.equal(bindings.team, 2)
  assert.equal(bindings.owner, 7)
  assert.equal(result.kind, 'assignment')
  assert.match(result.answer, /미완료 업무 1건/)
  assert.deepEqual(result.sources, [source])
  assert.equal(fetch.mock.calls.length, 0)
})

test('브리핑은 서울 날짜와 세 그룹의 전체 건수 및 원문 링크를 제공한다', async () => {
  const rows = [
    { groupName: 'dueToday', total: 5, route: 'work/7?team=2', title: '오늘 마감', dueDate: '2026-11-25' },
    { groupName: 'tomorrow', total: 1, route: 'personal-work/8', title: '내일 일정', dueDate: '2026-11-26' },
  ]
  const db = { request: () => ({ input() {}, query: async () => ({ recordset: rows }) }) }
  const response = await teamBriefing(db, { id: 3, teamId: 2 }, '2026-11-25')
  const data = await response.json()
  assert.equal(data.date, '2026-11-25')
  assert.equal(data.dueToday.total, 5)
  assert.equal(data.dueToday.items[0].route, 'work/7?team=2')
  assert.equal(data.tomorrow.items[0].route, 'personal-work/8')
  assert.deepEqual(data.overdue, { total: 0, items: [] })
})

test('벡터 서비스 장애와 키워드 미일치 시 생성 호출 없이 빈 결과를 돌려준다', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline') })
  const calls = []
  const db = { request() {
    const values = {}
    return {
      input(name, type, value) { values[name] = value },
      async query(sql) {
        calls.push({ sql, values })
        return { recordset: [] }
      },
    }
  } }
  const request = new Request('http://localhost/api/team/assistant', {
    method: 'POST',
    body: JSON.stringify({ question: '삼성전자 납품 일정이 언제였지?' }),
  })
  const response = await assistant(db, request, { id: 7, teamId: 2, isAdmin: false })
  assert.deepEqual(await response.json(), { sources: [], answer: null, unavailable: false })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].values.owner, 7)
  assert.equal(calls[0].values.team, 2)
  assert.equal(calls[0].values.allTeams, 0)
  assert.ok(Object.values(calls[0].values).includes('삼성전자'))
  assert.ok(!calls[0].sql.includes('삼성전자'))
  assert.ok(fetch.mock.calls.every(call => call.arguments[0].pathname.startsWith('/collections/')))
})
