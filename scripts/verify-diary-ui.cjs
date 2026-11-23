// 일기 작성 UI의 반응형·메모 초안 보존·저장 실패/대기/성공을 모의 API로 검사합니다.
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 const page=await browser.newPage({viewport:{width:1280,height:1000}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 let fail=true,held,request;
 await page.route('**/api/records{,/**,?**}',async route=>{
  if(route.request().method()==='POST') {
   request=route.request().postDataJSON();
   if(fail) await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'저장 실패 확인',fieldErrors:[]})});
   else held=route;
   return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({items:[],page:0,size:5,totalElements:0,totalPages:0})});
 });
 try {
  await page.goto('http://localhost:5173/#home');
  await page.locator('#memo').fill('보존할 메모 초안');
  await page.locator('.journal-composer').getByRole('button',{name:'일기 쓰기',exact:true}).click();
  const composer=page.locator('.diary-composer');
  await composer.waitFor();assert.equal(await page.locator('#memo').isVisible(),false);
  await composer.getByRole('button',{name:'취소',exact:true}).click();
  assert.equal(await page.locator('#memo').inputValue(),'보존할 메모 초안');
  await page.locator('.journal-composer').getByRole('button',{name:'일기 쓰기',exact:true}).click();
  assert.equal(await composer.getByRole('button',{name:'일기 저장',exact:true}).isDisabled(),true);
  for(const width of [1280,768,390]) {
   await page.setViewportSize({width,height:1000});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   const title=await composer.locator('#diary-title').boundingBox();
   const body=await composer.locator('#diary-content').boundingBox();
   assert.ok(title.width>200 && body.height>=250);
   if(process.env.DIARY_SCREENSHOT_DIR) await composer.screenshot({path:path.join(process.env.DIARY_SCREENSHOT_DIR,'my-day-diary-'+width+'.png')});
  }
  await composer.getByLabel('제목 (선택)',{exact:true}).fill('기억하고 싶은 하루');
  await composer.getByLabel('일기 본문',{exact:true}).fill('오늘의 기억을 남깁니다.');
  await composer.getByRole('button',{name:'일기 저장',exact:true}).click();
  await composer.getByText('저장 실패 확인',{exact:true}).waitFor();
  assert.equal(await composer.getByLabel('일기 본문',{exact:true}).inputValue(),'오늘의 기억을 남깁니다.');
  fail=false;
  await composer.getByRole('button',{name:'일기 저장',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.diary-composer')?.getAttribute('aria-busy')==='true');
  assert.equal(await composer.getByRole('button',{name:'취소',exact:true}).isDisabled(),true);
  assert.equal(await composer.getByRole('button',{name:'일기 작성 닫기',exact:true}).isDisabled(),true);
  assert.ok(held);assert.equal(request.recordType,'DIARY');
  await held.fulfill({status:201,contentType:'application/json',body:JSON.stringify({id:'mock-diary',...request})});
  await composer.waitFor({state:'detached'});
  assert.equal(await page.locator('#memo').inputValue(),'보존할 메모 초안');
  assert.deepEqual(errors,[]);
  console.log('PASS: 일기 1280/768/390px·넓은 입력창·메모 초안 유지·빈 본문 거부·저장 실패/대기/성공 (DB 쓰기 없음)');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
