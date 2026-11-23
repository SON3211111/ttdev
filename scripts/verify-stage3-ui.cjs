// 실제 API와 브라우저로 일기 CRUD·종류 필터·페이지·모바일을 확인하고 생성 기록을 정리합니다.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
 const browser = await chromium.launch({ headless: true, channel: 'msedge' });
 const page = await browser.newPage(); const errors = []; const fixtureIds = []; let id;
 const marker = 'stage3-ui-' + Date.now();
 // 필터/페이지의 응답이 화면에 반영된 뒤 탐색합니다. 마지막 페이지에서는 명확하게 실패합니다.
 async function findDiary(title) {
  const records = page.locator('#records');
  const target = records.getByRole('button', {name:'일기 상세 보기: ' + title, exact:true});
  for (;;) {
   await page.waitForFunction(() => document.querySelector('#records')?.getAttribute('aria-busy') === 'false');
   assert.equal(await records.locator('[role=alert]').count(),0,'기록 조회 실패');
   if (await target.count()) { await target.click(); return; }
   const next = records.getByRole('button',{name:'다음',exact:true});
   assert.ok(await next.count() && await next.isEnabled(),'마지막 페이지까지 대상 일기를 찾지 못했습니다.');
   await next.click();
  }
 }
 // 실제 목록 응답을 조금 늦춰 필터 전환/페이지의 로딩 대기를 항상 검사합니다.
 await page.route('**/api/records?**', async route => {
  const response = await route.fetch();
  await new Promise(resolve => setTimeout(resolve,200));
  await route.fulfill({response});
 });
 page.on('pageerror', e => errors.push(e.message));
 try {
  await page.goto('http://localhost:5173/#home');
  await page.locator('.journal-composer').getByRole('button', {name:'일기 쓰기', exact:true}).click();
  const form = page.locator('section').filter({has: page.locator('#diary-heading')});
  await form.getByLabel('제목 (선택)').fill(marker);
  await form.getByLabel('기록 날짜').fill('2020-02-29');
  await form.getByLabel('일기 본문').fill('본문 검색 특수문자 %_!');
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/records'));
  await form.getByRole('button', {name:'일기 저장',exact:true}).click();
  const saved = await response; assert.equal(saved.status(),201); id = (await saved.json()).id;
  await page.getByRole('link', { name: '기록', exact: true }).click();
  const records = page.locator('#records');
  assert.equal(await records.locator('.record-search').count(), 0);
  await records.getByRole('button',{name:'일기',exact:true}).click();
  await findDiary(marker);
  const detail = page.locator('.record-detail');
  await detail.getByText('본문 검색 특수문자 %_!',{exact:true}).waitFor();
  await detail.getByRole('button',{name:'수정',exact:true}).click();
  await detail.getByLabel('제목 (선택)').fill(marker + '-edited');
  await detail.getByRole('button',{name:'수정 저장',exact:true}).click();
  await detail.getByRole('heading',{name:marker + '-edited',exact:true}).waitFor();
  // 더 최신 날짜의 테스트 일기를 5개 만들어 다음 페이지 탐색도 실제 API로 확인합니다.
  for (let n=0;n<5;n++) {
    const fixture = await page.request.post('http://localhost:5173/api/records',{data:{recordType:'DIARY',title:marker + '-page-' + n,content:'페이지 검증',recordDate:'2020-03-01'}});
    assert.equal(fixture.status(),201); fixtureIds.push((await fixture.json()).id);
  }
  await page.reload();
  await page.getByRole('link', { name: '기록', exact: true }).click();
  await records.getByRole('button',{name:'일기',exact:true}).click();
  await findDiary(marker + '-edited');
  page.once('dialog', d => d.accept());
  await page.locator('.record-detail').getByRole('button',{name:'영구 삭제',exact:true}).click();
  await page.waitForFunction(() => !document.querySelector('.record-detail'));
  assert.equal((await page.request.get('http://localhost:5173/api/records/' + id)).status(),404);
  id = null;
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: 일기 작성·종류 필터·상세·제목 수정·새로고침·삭제·390px·런타임 오류 없음');
 } finally {
  for(const fixtureId of fixtureIds) await page.request.delete('http://localhost:5173/api/records/' + fixtureId);
  if(id) await page.request.delete('http://localhost:5173/api/records/' + id);
  await browser.close();
 }
})().catch(e => {console.error(e);process.exitCode=1});
