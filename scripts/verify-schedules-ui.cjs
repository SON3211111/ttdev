// 실제 Edge + MySQL 검증. 생성한 일정만 finally에서 삭제합니다.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
 const browser = await chromium.launch({headless:true, channel:'msedge'});
 const page = await browser.newPage(); const errors = []; const ids = new Set();
 const marker = 'stage4-ui-' + Date.now();
 page.on('pageerror', e => errors.push(e.message));
 page.on('response', async r => { if (r.request().method() === 'POST' && r.url().endsWith('/api/schedules') && r.status() === 201) ids.add((await r.json()).id); });
 const section = page.locator('#schedules'); const editor = section.locator('.schedule-editor');
 async function save() {
  const response = page.waitForResponse(r => r.request().method() !== 'GET' && r.url().includes('/api/schedules'));
  await editor.getByRole('button',{name:'일정 저장',exact:true}).click();
  const result = await response; assert.ok([200,201].includes(result.status()), await result.text());
  await editor.waitFor({state:'detached'});
  await section.getByRole('button',{name:'새로고침',exact:true}).waitFor();
 }
 async function open(title) {
  const target = section.locator('button.event').filter({hasText:title});
  await target.waitFor(); await target.click(); await editor.waitFor();
 }
 try {
  await page.goto('http://localhost:5173');
  await section.getByRole('button',{name:'새로운 일정 추가',exact:false}).click();
  assert.equal(await editor.getByRole('button',{name:'일정 저장',exact:true}).isDisabled(),true);
  await editor.getByLabel('일정명',{exact:true}).fill(marker);
  const date = await editor.getByLabel('일정 날짜',{exact:true}).inputValue();
  // 저장 실패는 입력을 지우지 않습니다.
  await page.route('**/api/schedules', async route => {
   if (route.request().method() === 'POST') await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'저장 실패 검증',fieldErrors:[]})}); else await route.continue();
  });
  await editor.getByRole('button',{name:'일정 저장',exact:true}).click();
  await editor.getByText('저장 실패 검증').waitFor();
  assert.equal(await editor.getByLabel('일정명',{exact:true}).inputValue(),marker);
  await page.unroute('**/api/schedules');
  // 저장 응답은 성공, 뒤따른 목록 조회만 실패해도 새 일정 폼은 닫혀야 합니다.
  let failList = true;
  await page.route('**/api/schedules?**', async route => {
   if(failList) await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'목록 실패 검증',fieldErrors:[]})}); else await route.continue();
  });
  await save(); await section.getByText('목록 실패 검증').waitFor();
  failList=false;
  await section.getByRole('button',{name:'다시 조회',exact:true}).click();
  await page.unroute('**/api/schedules?**');
  await open(marker);
  assert.equal(await editor.getByLabel('시간 (선택)',{exact:true}).inputValue(),'');
  await editor.getByRole('button',{name:'닫기',exact:true}).click();
  await page.reload(); await open(marker);
  await editor.getByLabel('시간 (선택)',{exact:true}).fill('00:05');
  await editor.getByLabel('장소 (선택)',{exact:true}).fill('가상 장소');
  await editor.getByLabel('메모 (선택)',{exact:true}).fill('가상 준비 메모');
  await editor.getByLabel('일정 상태',{exact:true}).selectOption('COMPLETED');
  await save();
  await page.waitForFunction(m => ![...document.querySelectorAll('#schedules button.event')].some(e => e.textContent.includes(m)),marker);
  await section.getByRole('button',{name:'일정 관리',exact:true}).click();
  await open(marker);
  assert.equal(await editor.getByLabel('시간 (선택)',{exact:true}).inputValue(),'00:05');
  assert.equal(await editor.getByLabel('일정 상태',{exact:true}).inputValue(),'COMPLETED');
  await editor.getByLabel('일정 상태',{exact:true}).selectOption('CANCELLED'); await save();
  await open(marker);
  await editor.getByLabel('일정 상태',{exact:true}).selectOption('PLANNED');
  await editor.getByLabel('일정 날짜',{exact:true}).fill('2020-02-29'); await save();
  await section.getByLabel('시작 날짜',{exact:true}).fill('2020-02-29');
  await section.getByLabel('종료 날짜',{exact:true}).fill('2020-02-29');
  await section.getByRole('button',{name:'조회',exact:true}).click();
  await open(marker);
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  page.once('dialog', d => d.dismiss()); await editor.getByRole('button',{name:'영구 삭제',exact:true}).click();
  assert.equal(await editor.count(),1);
  // 삭제 실패는 상세를 유지합니다.
  await page.route('**/api/schedules/*', async route => {
   if(route.request().method() === 'DELETE') await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'삭제 실패 검증',fieldErrors:[]})}); else await route.continue();
  });
  page.once('dialog', d => d.accept()); await editor.getByRole('button',{name:'영구 삭제',exact:true}).click();
  await editor.getByText('삭제 실패 검증').waitFor();
  await page.unroute('**/api/schedules/*');
  page.once('dialog', d => d.accept());
  const deleted = page.waitForResponse(r => r.request().method() === 'DELETE');
  await editor.getByRole('button',{name:'영구 삭제',exact:true}).click();
  assert.equal((await deleted).status(),204); await editor.waitFor({state:'detached'});
  for(const id of ids) assert.equal((await page.request.get('http://localhost:5173/api/schedules/' + id)).status(),404);
  assert.deepEqual(errors,[]);
  console.log('PASS: 일정 시간 미정 생성·실패 입력 보존·조회 실패 분리·새로고침·시간/상태/날짜 수정·과거 일정 관리·삭제 취소/실패/성공·390px');
 } finally {
  for(const id of ids) await page.request.delete('http://localhost:5173/api/schedules/' + id);
  await pause(50); await browser.close();
 }
})().catch(e => {console.error(e);process.exitCode=1});
