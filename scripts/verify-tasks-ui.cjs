// 실제 로컬 서비스에서 작업 한 건을 만들고 화면과 대시보드가 함께 갱신되는지 확인합니다.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = 'http://localhost:5173';
const title = 'task-ui-' + Date.now();

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let taskId;
  try {
    await page.goto(base);
    const baseline = await (await page.request.get(base + '/api/tasks/dashboard')).json();
    const today = baseline.upcomingDue[0].date;
    const dueChart = page.getByRole('region', { name: '일주일 안에 끝낼 일' });
    const completedChart = page.getByRole('region', { name: '지난 일주일에 끝낸 일' });
    const statusChart = page.getByRole('region', { name: '내 일정, 지금은' });
    const yesterday = new Date(Date.now() + 9 * 3600000 - 86400000).toISOString().slice(0, 10);
    await page.locator('#memo').fill('보존할 메모 초안');
    await page.locator('#schedules').getByRole('button', { name: '일정 관리', exact: true }).click();
    await page.getByRole('button', { name: '＋ 할 일 추가' }).click();
    const menu = page.locator('.site-header:visible').getByRole('navigation', { name: '주 메뉴' });
    assert.equal(await menu.getByRole('button', { name: '일정 관리' }).getAttribute('aria-current'), 'page');
    await page.getByRole('textbox', { name: '일정 이름' }).fill(title);
    await page.getByLabel('마감일 (선택)').fill(yesterday);
    assert.equal(await page.getByLabel('우선순위').count(), 0);

    const creating = page.waitForResponse(response =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/tasks');
    await page.getByRole('button', { name: '일정 저장' }).click();
    const response = await creating;
    assert.equal(response.status(), 201, await response.text());
    taskId = (await response.json()).id;
    const card = page.locator('.task-item').filter({ hasText: title });
    const status = label => card.getByRole('group', { name: '진행 상태 변경' }).getByRole('button', { name: label, exact: true });
    const active = label => status(label).and(card.locator('[aria-pressed="true"]')).waitFor();
    const overdue = page.locator('.task-overdue strong');
    const doing = statusChart.locator('.task-donut-doing strong');
    const done = statusChart.locator('.task-donut-done strong');
    async function expectCount(locator, label) {
      await locator.filter({ hasText: new RegExp('^' + label + '$') }).waitFor();
    }
    await card.getByText('기한 지남', { exact: false }).waitFor();
    await expectCount(overdue, `${baseline.overdue + 1}건`);
    await statusChart.getByText(`${baseline.total - baseline.doing - baseline.done + 1}건`, { exact: true })
      .locator('..').filter({ hasText: '하기 전' }).waitFor();
    await card.locator('summary').click();
    await active('하기 전');
    await status('하는 중').click();
    await active('하는 중');
    await expectCount(doing, `${baseline.doing + 1}건`);
    await status('하기 전').click();
    await active('하기 전');
    await expectCount(doing, `${baseline.doing}건`);
    await card.getByRole('button', { name: '변경 이력' }).click();
    await card.getByText('하는 중 → 하기 전').waitFor();
    await status('하는 중').click();
    await active('하는 중');

    await status('완료').click();
    await active('완료');
    await expectCount(done, `${baseline.done + 1}건`);
    await expectCount(overdue, `${baseline.overdue}건`);
    assert.equal(await completedChart.locator('li').count(), 7);
    assert.equal(Number(await completedChart.locator('li').last().locator('strong').textContent()), baseline.trend.at(-1).count + 1);
    assert.equal(await dueChart.locator('li').count(), 7);
    await card.getByText('하는 중 → 완료').waitFor();

    await status('하기 전').click();
    await active('하기 전');
    await expectCount(done, `${baseline.done}건`);
    await card.getByText('완료 → 하기 전').waitFor();
    await status('하는 중').click();
    await active('하는 중');

    await card.getByRole('button', { name: '수정' }).click();
    await page.getByRole('textbox', { name: '일정 이름' }).fill(title + '-edited');
    await page.getByLabel('마감일 (선택)').fill(today);
    await page.getByRole('button', { name: '일정 저장' }).click();
    await card.getByText(title + '-edited', { exact: true }).waitFor();
    await dueChart.locator('li').first().locator('strong')
      .filter({ hasText: new RegExp('^' + (baseline.upcomingDue[0].count + 1) + '$') }).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));

    await menu.getByRole('link', { name: '홈', exact: true }).click();
    assert.equal(await page.locator('#memo').inputValue(), '보존할 메모 초안');
    const agenda = page.locator('#schedules');
    const agendaTask = agenda.getByRole('button', { name: new RegExp(title + '-edited') });
    await agendaTask.locator(`time[datetime="${today}"]`).waitFor();
    assert.equal(await agendaTask.getByText('할 일 · 하는 중', { exact: true }).count(), 0);
    await agendaTask.click();
    await page.getByRole('heading', { name: '할 일 상세' }).waitFor();
    await page.getByRole('button', { name: '앞으로 7일로 돌아가기' }).click();
    const calendar = page.locator('#calendar');
    await calendar.getByRole('button', { name: new RegExp('^' + today + ',') }).click();
    const calendarTask = calendar.locator('.calendar-entry').filter({ hasText: title + '-edited' });
    await calendarTask.getByText('할 일', { exact: true }).waitFor();
    await calendarTask.click();
    await page.getByRole('heading', { name: '할 일 상세' }).waitFor();
    await status('완료').click();
    await active('완료');
    await page.getByRole('button', { name: '캘린더로 돌아가기' }).click();
    await calendar.getByRole('button', { name: new RegExp('^' + today + ',') }).click();
    await calendarTask.getByText('완료', { exact: true }).waitFor();
    await agendaTask.waitFor({state: 'hidden'});
    await page.reload();
    await agenda.getByRole('button', { name: '일정 관리', exact: true }).click();
    await card.getByText(title + '-edited', { exact: true }).waitFor();
    page.once('dialog', dialog => dialog.accept());
    const deleting = page.waitForResponse(response =>
      response.request().method() === 'DELETE' && response.url().endsWith('/api/tasks/' + taskId));
    await card.locator('summary').click();
    await card.getByRole('button', { name: '삭제' }).click();
    assert.equal((await deleting).status(), 204);
    taskId = undefined;
    await expectCount(statusChart.locator('.task-donut strong'), baseline.total);
    await page.setViewportSize({ width: 1280, height: 900 });
    const list = await page.locator('.task-workspace .home-primary').boundingBox();
    const dashboard = await page.locator('.task-workspace .home-sidebar').boundingBox();
    assert.ok(list.x + list.width < dashboard.x);
    await menu.getByRole('link', { name: '캘린더' }).click();
    await page.locator('#calendar').waitFor();
    console.log('PASS: 작업 CRUD·상태 전이·이력·지연·7일 집계·새로고침 유지·390px');
  } finally {
    try {
      if (taskId) await page.request.delete(base + '/api/tasks/' + taskId);
    } finally {
      await browser.close();
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
