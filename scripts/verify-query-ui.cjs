// Playwright로 필터 변경/조회 실패/재시도를 확인합니다. 응답을 가짜로 만들어 실제 DB를 읽거나 쓰지 않습니다.
// PLAYWRIGHT_MODULE_PATH에 Playwright 경로를 지정하고 node scripts/verify-query-ui.cjs로 실행합니다.
// assert는 기대한 결과와 다르면 오류를 내 테스트를 실패시키는 검사 함수입니다.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let failList = false;
  let failCalendar = false;
  // route가 API 요청을 가로채고 fulfill이 가짜 응답을 돌려줍니다. start가 있으면 캘린더 요청입니다.
  await page.route('**/api/records?**', async route => {
    const params = new URL(route.request().url()).searchParams;
    const calendar = params.has('start');
    const fail = calendar ? failCalendar : failList;
    // 0.25초 늦게 응답해 잠깐 표시되는 '불러오는 중' 상태도 검사할 수 있게 합니다.
    await new Promise(resolve => setTimeout(resolve, 250));
    const item = {
      id: 'query-test', recordType: 'MEMO', title: null,
      preview: '조회 상태 검증', recordDate: params.get('start') || '2020-01-01',
    };
    const items = params.get('type') === 'DIARY' ? [] : [item];
    await route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json',
      body: JSON.stringify(fail ? { message: '조회 실패 검증', fieldErrors: [] }
        : { items, page: 0, size: 5, totalElements: items.length, totalPages: items.length ? 1 : 0 }),
    });
  });
  try {
    await page.goto('http://localhost:5173');
    const records = page.locator('#records');
    const calendar = page.locator('#calendar');
    await records.locator('.record-select').waitFor();
    await records.getByRole('button', { name: '일기', exact: true }).click();
    await records.getByText('기록을 불러오는 중입니다…').waitFor();
    assert.equal(await records.locator('.record-select').count(), 0);
    await records.getByText('아직 기록이 없어요.', { exact: false }).waitFor();
    // 메모→일기를 빠르게 눌러 먼저 요청한 메모 응답이 나중에 와도 일기 화면을 덮지 않는지 검사합니다.
    await records.getByRole('button', { name: '메모', exact: true }).click();
    await records.getByRole('button', { name: '일기', exact: true }).click();
    await records.getByText('아직 기록이 없어요.', { exact: false }).waitFor();
    failList = true;
    await records.getByRole('button', { name: '새로고침', exact: true }).click();
    await records.getByText('조회 실패 검증', { exact: true }).waitFor();
    failList = false;
    await records.getByRole('button', { name: '다시 조회', exact: true }).click();
    await records.getByText('아직 기록이 없어요.', { exact: false }).waitFor();
    failCalendar = true;
    await calendar.getByRole('button', { name: '다음 달', exact: true }).click();
    await calendar.getByText('조회 실패 검증', { exact: false }).waitFor();
    failCalendar = false;
    await calendar.getByRole('button', { name: '다시 조회', exact: true }).click();
    await calendar.getByText('캘린더를 불러오는 중입니다…').waitFor();
    await page.waitForFunction(() => document.querySelector('#calendar')?.getAttribute('aria-busy') === 'false');
    assert.equal(await calendar.locator('[role=alert]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS: 필터 전환·이전 결과 숨김·목록/캘린더 실패와 재시도·런타임 오류 없음 (DB 쓰기 없음)');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
