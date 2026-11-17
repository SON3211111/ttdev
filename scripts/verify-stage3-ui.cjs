// 실제 API와 브라우저로 일기 CRUD·검색·모바일을 확인하고 생성 기록을 정리합니다.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
 const browser = await chromium.launch({ headless: true, channel: 'msedge' });
 const page = await browser.newPage(); const errors = []; let id;
 const marker = 'stage3-ui-' + Date.now();
 page.on('pageerror', e => errors.push(e.message));
 try {
  await page.goto('http://localhost:5173');
  await page.getByRole('button', {name:'일기 쓰기', exact:true}).click();
  const form = page.locator('section').filter({has: page.locator('#diary-heading')});
  await form.getByLabel('제목 (선택)').fill(marker);
  await form.getByLabel('기록 날짜').fill('2020-02-29');
  await form.getByLabel('일기 본문').fill('본문 검색 특수문자 %_!');
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/records'));
  await form.getByRole('button', {name:'일기 저장',exact:true}).click();
  const saved = await response; assert.equal(saved.status(),201); id = (await saved.json()).id;
  const records = page.locator('#records');
  assert.equal(await records.locator('.record-search').count(), 0);
  await records.getByRole('button',{name:'일기',exact:true}).click();
  while (!(await records.getByRole('button', {name:'일기 상세 보기: ' + marker, exact:true}).count())) {
    await records.getByRole('button',{name:'다음',exact:true}).click();
  }
  await records.getByRole('button', {name:'일기 상세 보기: ' + marker, exact:true}).click();
  const detail = page.locator('.record-detail');
  await detail.getByText('본문 검색 특수문자 %_!',{exact:true}).waitFor();
  await detail.getByRole('button',{name:'수정',exact:true}).click();
  await detail.getByLabel('제목 (선택)').fill(marker + '-edited');
  await detail.getByRole('button',{name:'수정 저장',exact:true}).click();
  await detail.getByRole('heading',{name:marker + '-edited',exact:true}).waitFor();
  await page.reload();
  await records.getByRole('button',{name:'일기',exact:true}).click();
  while (!(await records.getByRole('button', {name:'일기 상세 보기: ' + marker + '-edited', exact:true}).count())) {
    await records.getByRole('button',{name:'다음',exact:true}).click();
  }
  await records.getByRole('button',{name:'일기 상세 보기: ' + marker + '-edited',exact:true}).click();
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
  if(id) await page.request.delete('http://localhost:5173/api/records/' + id);
  await browser.close();
 }
})().catch(e => {console.error(e);process.exitCode=1});
