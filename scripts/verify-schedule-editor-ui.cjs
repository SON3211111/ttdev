// 모의 API로 저장/삭제 지연 중 부모 편집 전환 잠금을 검사합니다. 실제 DB 쓰기는 없습니다.
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async () => {
 const browser = await chromium.launch({headless:true,channel:'msedge'});
 const page = await browser.newPage(); const errors=[]; page.on('pageerror',error=>errors.push(error.message));
 let held; let updated=false;
 const first={id:'101',title:'검증 일정 A',scheduleDate:'2026-11-17',scheduleTime:null,location:null,description:null,status:'PLANNED'};
 const second={...first,id:'102',title:'검증 일정 B'};
 await page.route('**/api/schedules{,/**,?**}',async route => {
  const req=route.request();
  if(['PUT','DELETE'].includes(req.method())) {held=route;return;}
  const id=new URL(req.url()).pathname.split('/').pop();
  const body=id==='101'?{...first,title:updated?'수정한 일정':first.title}:id==='102'?second:{items:[{...first,title:updated?'수정한 일정':first.title},second],page:0,size:20,totalElements:2,totalPages:1};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
 });
 try {
  await page.goto('http://localhost:5173/#home');
  const section=page.locator('#schedules'); const editor=section.locator('.schedule-editor');
  const add=section.getByRole('button',{name:'새로운 일정 추가',exact:false});
  await section.locator('button.event').filter({hasText:first.title}).click();
  await editor.getByLabel('일정명',{exact:true}).fill('수정한 일정');
  await editor.getByRole('button',{name:'일정 저장',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.schedule-editor')?.getAttribute('aria-busy')==='true');
  assert.equal(await add.isDisabled(),true);
  for(const event of await section.locator('button.event').all()) assert.equal(await event.isDisabled(),true);
  assert.equal(await section.getByRole('button',{name:'새로고침',exact:true}).isDisabled(),true);
  // disabled 속성 외에 이벤트 함수도 잠금 상태를 검사하는지 확인합니다.
  await add.dispatchEvent('click'); assert.equal(await editor.getByLabel('일정명',{exact:true}).inputValue(),'수정한 일정');
  assert.ok(held); await held.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'지연 저장 실패',fieldErrors:[]})});
  await editor.getByText('지연 저장 실패').waitFor(); assert.equal(await add.isEnabled(),true);
  assert.equal(await editor.getByLabel('일정명',{exact:true}).inputValue(),'수정한 일정');
  held=null; await editor.getByRole('button',{name:'일정 저장',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.schedule-editor')?.getAttribute('aria-busy')==='true');
  assert.equal(await add.isDisabled(),true); assert.ok(held); updated=true;
  await held.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...first,title:'수정한 일정'})});
  await editor.waitFor({state:'detached'});
  assert.equal(await section.getByText('일정을 저장했습니다.',{exact:false}).count(),0);
  assert.equal(await section.locator('.schedule-notice').count(),0);
  await add.click(); await editor.getByLabel('일정명',{exact:true}).fill('보존할 새 초안');
  assert.equal(await editor.getByLabel('일정명',{exact:true}).inputValue(),'보존할 새 초안');
  await editor.getByRole('button',{name:'닫기',exact:true}).click();
  await section.locator('button.event').filter({hasText:'수정한 일정'}).click();
  page.once('dialog',dialog=>dialog.accept()); held=null;
  await editor.getByRole('button',{name:'영구 삭제',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.schedule-editor')?.getAttribute('aria-busy')==='true');
  assert.equal(await add.isDisabled(),true); assert.ok(held);
  await held.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'지연 삭제 실패',fieldErrors:[]})});
  await editor.getByText('지연 삭제 실패').waitFor(); assert.equal(await add.isEnabled(),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: 저장/삭제 중 새 편집 차단·실패 후 입력 유지/잠금 해제·성공 후 새 초안·저장 안내/날짜 제거 (DB 쓰기 없음)');
 } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
