// Playwright로 실제 Edge를 조작해 메모 저장→캘린더 표시→원문 열기를 검사합니다.
// PLAYWRIGHT_MODULE_PATH에 Playwright 경로를 지정한 뒤 node scripts/verify-calendar-ui.cjs로 실행합니다.
// 실제 DB에 테스트 메모 1개를 만들므로 마지막 finally에서 생성한 ID만 삭제합니다.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, timezoneId: 'America/Los_Angeles' });
  let id;
  const marker = 'calendar-ui-' + Date.now();
  try {
    await page.goto('http://localhost:5173');
    await page.locator('#calendar').waitFor();
    await page.locator('.memo input[type=date]').fill('2020-02-29');
    await page.locator('#memo').fill(marker);
    // 클릭 전에 응답 대기를 걸어 둡니다. 클릭 직후 서버가 빨리 응답해도 결과를 놓치지 않게 합니다.
    const responsePromise = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/records'));
    await page.getByRole('button', { name: '＋ 메모 남기기' }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 201);
    id = (await response.json()).id;
    const calendar = page.locator('#calendar');
    await calendar.getByText('2020년 2월', { exact: true }).waitFor();
    const entry = calendar.getByRole('button').filter({ hasText: marker });
    await entry.waitFor();
    await entry.click();
    await page.locator('.detail-body').filter({ hasText: marker }).waitFor();
    await calendar.getByRole('button', { name: '다음 달', exact: true }).click();
    await calendar.getByText('2020년 3월', { exact: true }).waitFor();
    await calendar.getByRole('button', { name: '이전 달', exact: true }).click();
    await calendar.getByRole('button', { name: /2020-02-29,/ }).click();
    await entry.waitFor();
    await page.reload();
    // 새로고침 뒤 API에서 같은 ID가 나오면 메모가 브라우저 메모리에만 있던 것이 아니라 DB에 남았다는 뜻입니다.
    const listing = await page.request.get('http://localhost:5173/api/records?start=2020-02-01&end=2020-02-29&size=100');
    assert.equal(listing.status(), 200);
    assert.ok((await listing.json()).items.some(item => item.id === id));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#calendar').scrollIntoViewIfNeeded();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    console.log('PASS: 메모 저장 → 해당 월/날짜 표시 → 원문 열기, 윤년 월 이동, 새로고침 유지, 모바일 가로 넘침 없음');
  } finally {
    // 실패했더라도 이 검사에서 만든 메모만 삭제하고 브라우저를 종료합니다.
    if (id) assert.equal((await page.request.delete('http://localhost:5173/api/records/' + id)).status(), 204);
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
