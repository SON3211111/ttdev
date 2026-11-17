// Playwright는 코드로 브라우저를 조작하는 도구입니다. 실행 중인 localhost:5173을 실제 Edge에서 검사합니다.
// PLAYWRIGHT_MODULE_PATH에 설치한 Playwright 경로를 지정한 뒤 node scripts/verify-records-ui.cjs로 실행합니다.
// 이 검사는 DB에 테스트 메모를 쓰고 고칩니다. 만든 ID를 ids에 모아 finally에서 해당 기록만 지웁니다.
// 목록 첫 페이지에서 테스트 메모를 찾으므로 다른 최신 기록이 많다면 테스트 환경의 목록 조건 확인이 필요합니다.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.MEMORIA_BASE_URL || 'http://localhost:5173';
const ids = new Set();
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  // 서버 응답과 화면 갱신은 시간이 걸립니다. 0.1초 간격으로 조건을 확인하고 약 8초가 지나면 실패합니다.
  for(let i=0;i<80;i++) { if(await check()) return; await pause(100); }
  throw new Error('Timed out: '+label);
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1080 }, timezoneId: 'America/Los_Angeles' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const marker = 'UI검증-' + Date.now();
  try {
    await page.goto(base);
    await until(async()=>!(await page.getByText('기록을 불러오는 중입니다…').isVisible()), 'initial load');
    const input = page.locator('#memo');
    const date = page.locator('.memo input[type=date]');
    const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    assert.equal(await date.inputValue(), today);
    assert.equal(await page.getByRole('button',{name:'＋ 메모 남기기'}).isDisabled(),true);
    await input.fill('   ');
    assert.equal(await page.getByRole('button',{name:'＋ 메모 남기기'}).isDisabled(),true);
    await date.fill('2020-01-02');
    await input.fill(marker+' 첫 줄\n둘째 줄 😀');
    let postCount=0;
    await page.route('**/api/records',async route=>{if(route.request().method()==='POST'){postCount++;await pause(300);}await route.continue();});
    const responsePromise=page.waitForResponse(response=>response.url().endsWith('/api/records')&&response.request().method()==='POST');
    await page.getByRole('button',{name:'＋ 메모 남기기'}).click();
    const response=await responsePromise;
    assert.equal(response.status(),201);
    const saved=await response.json();ids.add(saved.id);
    await until(async()=>await input.inputValue()==='', 'input cleared');
    assert.equal(postCount,1);
    assert.equal(await date.inputValue(),'2020-01-02');
    await page.unroute('**/api/records');
    await page.reload();
    const row=page.locator('.record-select').filter({hasText:marker});
    await row.waitFor();
    await row.click();
    await page.locator('.detail-body').waitFor();
    assert.equal(await page.locator('.detail-body').textContent(),marker+' 첫 줄\n둘째 줄 😀');
    await page.getByRole('button',{name:'수정',exact:true}).click();
    await page.locator('#edit-content').fill(marker+' 취소할 수정');
    await page.getByRole('button',{name:'취소',exact:true}).click();
    assert.equal(await page.locator('.detail-body').textContent(),marker+' 첫 줄\n둘째 줄 😀');
    await page.getByRole('button',{name:'수정',exact:true}).click();
    await page.locator('#edit-content').fill(marker+' 수정 완료');
    await page.locator('#edit-date').fill('2020-01-01');
    await page.getByRole('button',{name:'수정 저장',exact:true}).click();
    await until(async()=>await page.locator('.detail-body').textContent().catch(()=>null)===marker+' 수정 완료','update');
    const detail=await (await context.request.get(base+'/api/records/'+saved.id)).json();
    assert.equal(detail.contentVersion,2);assert.equal(detail.recordDate,'2020-01-01');

    // page.route는 요청을 가로채 가짜 응답을 줍니다. 실제 서버를 끄지 않고 저장 실패 화면을 검사합니다.
    // 503으로 실패해도 사용자가 쓴 내용과 날짜가 남아야 합니다.
    await page.route('**/api/records',async route=>{
      if(route.request().method()==='POST')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'저장 실패 검증',fieldErrors:[]})});
      return route.continue();
    });
    await date.fill('2020-01-02');
    await input.fill(marker+' 실패시 유지');
    await page.getByRole('button',{name:'＋ 메모 남기기'}).click();
    await page.getByText('저장 실패 검증',{exact:true}).waitFor();
    assert.equal(await input.inputValue(),marker+' 실패시 유지');
    assert.equal(await date.inputValue(),'2020-01-02');
    await page.unroute('**/api/records');

    // 저장 POST는 실제로 성공시키고 목록 GET만 실패시킵니다. 입력은 비워지고 조회만 재시도할 수 있어야 합니다.
    await page.route('**/api/records?**',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'목록 조회 실패 검증',fieldErrors:[]})}));
    await input.fill(marker+' 목록실패 저장성공');
    const secondResponse=page.waitForResponse(response=>response.url().endsWith('/api/records')&&response.request().method()==='POST');
    await page.getByRole('button',{name:'＋ 메모 남기기'}).click();
    const second=await (await secondResponse).json();ids.add(second.id);
    await page.getByText('목록 조회 실패 검증',{exact:true}).waitFor();
    assert.equal(await input.inputValue(),'');
    await page.unroute('**/api/records?**');
    await page.getByRole('button',{name:'다시 조회',exact:true}).click();
    await page.locator('.record-select').filter({hasText:marker+' 목록실패 저장성공'}).waitFor();

    // 수정/삭제 응답을 실패시키거나 확인 창을 취소해도 기존 원문이 남는지 검사합니다.
    // dialog.accept는 확인, dialog.dismiss는 취소 버튼을 누르는 동작입니다.
    await page.route('**/api/records/'+saved.id,route=>{
      if(['PUT','DELETE'].includes(route.request().method()))return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'변경 실패 검증',fieldErrors:[]})});
      return route.continue();
    });
    await page.getByRole('button',{name:'수정',exact:true}).click();
    await page.locator('#edit-content').fill(marker+' 수정실패 유지');
    await page.getByRole('button',{name:'수정 저장',exact:true}).click();
    await page.getByText('변경 실패 검증',{exact:true}).waitFor();
    assert.equal(await page.locator('#edit-content').inputValue(),marker+' 수정실패 유지');
    await page.getByRole('button',{name:'취소',exact:true}).click();
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'영구 삭제',exact:true}).click();
    await page.getByText('변경 실패 검증',{exact:true}).waitFor();
    assert.equal(await page.locator('.detail-body').textContent(),marker+' 수정 완료');
    await page.unroute('**/api/records/'+saved.id);
    page.once('dialog',dialog=>dialog.dismiss());
    await page.getByRole('button',{name:'영구 삭제',exact:true}).click();
    assert.equal((await context.request.get(base+'/api/records/'+saved.id)).status(),200);
    page.once('dialog',dialog=>dialog.accept());
    await page.getByRole('button',{name:'영구 삭제',exact:true}).click();
    await until(async()=>!await page.locator('.record-detail').isVisible(),'deleted detail closed');
    assert.equal((await context.request.get(base+'/api/records/'+saved.id)).status(),404);ids.delete(saved.id);
    await context.request.delete(base+'/api/records/'+second.id);ids.delete(second.id);
    await input.fill('');
    await page.reload();
    await until(async()=>!await page.getByText('기록을 불러오는 중입니다…').isVisible(),'reload');
    const folder=process.env.MEMORIA_SCREENSHOT_DIR;
    if(folder){fs.mkdirSync(folder,{recursive:true});await page.screenshot({path:path.join(folder,'home-desktop.png'),fullPage:true});}
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    if(folder)await page.screenshot({path:path.join(folder,'home-mobile.png'),fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: browser create/reload/detail/edit/cancel/delete, save/list/edit/delete failures, Seoul date, mobile overflow, no page errors');
  } finally {
    // 검사가 실패했어도 생성한 기록을 정리하고 브라우저를 닫습니다. 기존 사용자 기록은 삭제 대상이 아닙니다.
    for(const id of ids)await context.request.delete(base+'/api/records/'+id).catch(()=>{});
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
