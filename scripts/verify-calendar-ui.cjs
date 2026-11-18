// 실제 Edge와 MySQL로 캘린더의 기록 작성·조회와 일정 관리를 검사합니다.
// PLAYWRIGHT_MODULE_PATH에 Playwright 경로를 지정한 뒤 node scripts/verify-calendar-ui.cjs로 실행합니다.
// 실제 DB에 생성한 검증 데이터는 finally에서 ID로 정리합니다.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, timezoneId: 'America/Los_Angeles' });
  const created = new Set();
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
    const id = (await response.json()).id;
    created.add('/api/records/' + id);
    const calendar = page.locator('#calendar');
    await calendar.getByText('2020년 2월', { exact: true }).waitFor();
    await calendar.getByRole('button', { name: /2020-02-29,/ }).click();
    const dayDialog = calendar.getByRole('dialog');
    await dayDialog.waitFor();
    const entry = calendar.getByRole('button').filter({ hasText: marker });
    await entry.waitFor();
    await entry.click();
    await page.locator('.detail-body').filter({ hasText: marker }).waitFor();
    await page.getByRole('link', { name: '캘린더', exact: true }).click();
    await calendar.getByRole('button', { name: '다음 달', exact: true }).click();
    await calendar.getByText('2020년 3월', { exact: true }).waitFor();
    await calendar.getByRole('button', { name: '이전 달', exact: true }).click();
    await calendar.getByRole('button', { name: /2020-02-29,/ }).click();
    await entry.waitFor();
    await page.keyboard.press('Escape');
    await dayDialog.waitFor({ state: 'hidden' });
    await calendar.getByRole('button', { name: /2020-02-29,/ }).click();

    async function submit(path, method, button) {
      const pending = page.waitForResponse(r => r.request().method() === method && new URL(r.url()).pathname === path);
      await button.click();
      const response = await pending;
      assert.equal(response.status(), method === 'POST' ? 201 : 200);
      const item = await response.json();
      if (method === 'POST') created.add(path + '/' + item.id);
      return item;
    }
    const button = name => calendar.getByRole('button', { name, exact: true });
    await button('메모 쓰기').click();
    const memo = calendar.locator('.memo');
    assert.equal(await memo.locator('input[type=date]').inputValue(), '2020-02-29');
    await memo.getByRole('textbox', { name: '메모 본문' }).fill(marker + '-memo');
    await submit('/api/records', 'POST', button('＋ 메모 남기기'));
    await button('일기 쓰기').click();
    assert.equal(await calendar.getByLabel('기록 날짜').inputValue(), '2020-02-29');
    await calendar.getByLabel('일기 본문').fill(marker + '-diary');
    await submit('/api/records', 'POST', button('일기 저장'));
    await calendar.locator('.calendar-entry').filter({hasText: marker + '-diary'}).waitFor();

    await button('날짜 팝업 닫기').click();
    await button('오늘').click();
    const seoulToday = await calendar.locator('[aria-current=date]').getAttribute('aria-label');
    await button('다음 달').click();
    // 다음 달 28일이면 오늘로부터 최소 28일 이후입니다.
    const futureDay = calendar.getByRole('button', { name: /^\d{4}-\d{2}-28,/ });
    const futureDate = (await futureDay.getAttribute('aria-label')).slice(0, 10);
    await futureDay.click();
    assert.equal(await button('일기 쓰기').count(), 0);
    assert.equal(await button('메모 쓰기').count(), 0);
    await button('일정 추가').click();
    const form = calendar.locator('.schedule-editor');
    const dateField = form.getByLabel('일정 날짜');
    assert.equal(await dateField.inputValue(), futureDate);
    const scheduleTitle = marker + '-schedule';
    await form.getByLabel('일정명').fill(scheduleTitle);
    const schedule = await submit('/api/schedules', 'POST', button('일정 저장'));
    const schedulePath = '/api/schedules/' + schedule.id;
    const scheduleEntry = calendar.locator('.calendar-entry').filter({ hasText: scheduleTitle });
    const homeEntry = page.locator('#schedules .event').filter({ hasText: scheduleTitle });
    await scheduleEntry.waitFor();
    assert.equal(await homeEntry.count(), 0);
    await scheduleEntry.click();
    const closedDate = (+futureDate.slice(0, 4) + 1) + '-12-31';
    await dateField.fill(closedDate);
    await form.getByLabel('일정 상태').selectOption('COMPLETED');
    await submit(schedulePath, 'PUT', button('일정 저장'));
    await scheduleEntry.filter({ hasText: '완료' }).waitFor();
    await button('날짜 팝업 닫기').click();
    await button('다음 달').click();
    await calendar.getByText((+closedDate.slice(0, 4) + 1) + '년 1월', { exact: true }).waitFor();
    await button('이전 달').click();
    await calendar.getByRole('button', { name: new RegExp('^' + closedDate + ',') }).click();
    await scheduleEntry.click();
    await form.getByLabel('일정 상태').selectOption('CANCELLED');
    await submit(schedulePath, 'PUT', button('일정 저장'));
    await scheduleEntry.filter({ hasText: '취소' }).waitFor();
    await scheduleEntry.click();
    await dateField.fill(seoulToday.slice(0, 10));
    await form.getByLabel('일정 상태').selectOption('PLANNED');
    await submit(schedulePath, 'PUT', button('일정 저장'));
    await homeEntry.waitFor();
    await scheduleEntry.click();
    page.once('dialog', dialog => dialog.accept());
    const deleting = page.waitForResponse(r => r.request().method() === 'DELETE' && r.url().endsWith(schedulePath));
    await button('영구 삭제').click();
    assert.equal((await deleting).status(), 204);
    created.delete(schedulePath);
    await scheduleEntry.waitFor({ state: 'hidden' });
    await homeEntry.waitFor({ state: 'hidden' });

    await page.reload();
    // 새로고침 뒤 API에서 같은 ID가 나오면 메모가 브라우저 메모리에만 있던 것이 아니라 DB에 남았다는 뜻입니다.
    const listing = await page.request.get('http://localhost:5173/api/records?start=2020-02-01&end=2020-02-29&size=100');
    assert.equal(listing.status(), 200);
    assert.ok((await listing.json()).items.some(item => item.id === id));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#calendar').scrollIntoViewIfNeeded();
    await calendar.locator('button[aria-current="date"]').click();
    const bounds = await dayDialog.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    console.log('PASS: 날짜별 메모·일기 작성, 원문 열기, 미래 일정 및 완료·취소 관리, 홈/캘린더 동기화, 월·연도 경계, 390px');
  } finally {
    try {
      const cleanups = await Promise.all([...created].map(path => page.request.delete('http://localhost:5173' + path)));
      for (const response of cleanups) assert.equal(response.status(), 204);
    } finally {
      await browser.close();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
