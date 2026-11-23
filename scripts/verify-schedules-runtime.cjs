// 실제 SQL Server/백엔드 재시작 및 AI 중단 검증. 테스트 일정만 삭제하고 AI의 기존 실행 상태를 복구합니다.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const base = 'http://localhost:5173/api/schedules';
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const docker = args => execFileSync('docker',['compose',...args],{stdio:['ignore','pipe','pipe']}).toString();
const inspect = (name,format) => execFileSync('docker',['inspect',name,'--format',format],{encoding:'utf8'}).trim();
// 재시작 직후 일시적인 연결 실패를 허용하며 최대 90회까지 준비 상태를 확인합니다.
async function wait(check) { for(let n=0;n<90;n++){try{if(await check())return;}catch{} await sleep(1000)} throw Error('서비스 준비 시간 초과'); }
(async()=>{
 const ids=[]; const marker='stage4-runtime-'+Date.now(); let aiStopped=false;
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const p=name=>parts.find(v=>v.type===name).value;
 const today=p('year')+'-'+p('month')+'-'+p('day');
 const date=offset=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10)};
 async function request(method,path='',body) {return fetch(base+path,{method,headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
 async function create(name,offset,time) {
  const response=await request('POST','',{title:marker+name,scheduleDate:date(offset),scheduleTime:time});
  assert.equal(response.status,201); const result=await response.json();ids.push(result.id);return result;
 }
 try {
  await wait(async()=> (await request('GET')).status===200);
  if(inspect('dev-ai','{{.State.Running}}')==='true'){docker(['stop','ai']);aiStopped=true;}
  const before=await create('-before',-1,null);
  const unknown=await create('-unknown',0,null);
  const late=await create('-late',0,'23:59');
  const early=await create('-early',0,'00:00');
  const end=await create('-end',6,null);
  const after=await create('-after',7,null);
  const completed=await create('-completed',0,null);
  const update=await request('PUT','/'+completed.id,{title:completed.title,scheduleDate:completed.scheduleDate,status:'COMPLETED'});
  assert.equal(update.status,200);
  const listed=await (await request('GET','?size=100')).json();
  assert.deepEqual(listed.items.filter(v=>v.title.startsWith(marker)).map(v=>v.id),[early.id,late.id,unknown.id,end.id]);
  assert.equal((await (await request('GET','/'+late.id)).json()).scheduleTime,'23:59');
  for(const query of ['?keyword=x','?from='+today,'?start='+today,'?end='+today,'?status=PLANNED']) assert.equal((await request('GET',query)).status,400);
  console.log('PASS: 실제 SQL Server 7일 경계·시간 미정 정렬·00:00/23:59·상태 제외·AI 중단 중 저장/조회');
  docker(['restart','sqlserver']);
  await wait(()=>inspect('dev-sqlserver','{{.State.Health.Status}}')==='healthy');
  docker(['restart','backend']);
  await wait(async()=> (await request('GET')).status===200);
  for(const original of [before,unknown,late,early,end,after]) {
   const response=await request('GET','/'+original.id);assert.equal(response.status,200);
   assert.deepEqual(await response.json(),original);
  }
  console.log('PASS: SQL Server/백엔드 재시작 후 일정 원문·시간·UTC 시각 유지');
 } finally {
  let cleanupError;
  try {for(const id of ids){const response=await request('DELETE','/'+id);assert.ok([204,404].includes(response.status));}}
  catch(error){cleanupError=error;}
  finally {if(aiStopped)docker(['start','ai']);}
  if(cleanupError)throw cleanupError;
 }
})().catch(error=>{console.error(error);process.exitCode=1});
