const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function load(file) {
  const source = fs.readFileSync(file,'utf8');
  const module = { exports:{} };
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,Date});
  return module.exports;
}
const {summarizeLedger} = load('apps/miniprogram/src/utils/ledger-summary.ts');
const {getInventoryExpiry,formatSubmittedAt} = load('apps/miniprogram/src/utils/date.ts');
const row=(type,amountCents,countsTowardTotal)=>({type,amountCents,countsTowardTotal});
test('same cent-based accounting: manual legacy income/expense count; neutral imports do not',()=>{
 assert.deepEqual(JSON.parse(JSON.stringify(summarizeLedger([row('income',860000),row('expense',531950,true),row('expense',50000,false),row('income',10000,false)]))),{incomeCents:860000,expenseCents:531950,balanceCents:328050});
});
test('empty month and negative balance are real zero/negative amounts',()=>{
 assert.equal(summarizeLedger([]).balanceCents,0); assert.equal(summarizeLedger([row('expense',1)]).balanceCents,-1);
});
test('expiry boundary uses the whole formatter label, including no date and past date',()=>{
 const now=new Date(2026,9,8);
 for(const [date,status,label]of [['','normal','无需提醒'],['2026-10-06','expired','已过期 2 天'],['2026-10-08','expiring','今天到期'],['2026-10-09','expiring','明天到期'],['2026-10-10','expiring','还有 2 天'],['2026-10-15','expiring','还有 7 天'],['2026-10-16','normal','还有 8 天']]){
  const result=getInventoryExpiry(date,now);assert.equal(result.status,status);assert.equal(result.label,label);
 }
});

test('submission labels preserve API time across today/yesterday/month boundary and missing values',()=>{
 const now=new Date(2026,9,1,10,0);
 assert.equal(formatSubmittedAt(new Date(2026,9,1,9,5).toISOString(),now),'今天 09:05');
 assert.equal(formatSubmittedAt(new Date(2026,8,30,18,42).toISOString(),now),'昨天 18:42');
 assert.equal(formatSubmittedAt(new Date(2026,8,29,8,0).toISOString(),now),'9月29日 08:00');
 assert.equal(formatSubmittedAt('',now),'时间未提供');
 assert.equal(formatSubmittedAt('旧记录时间',now),'旧记录时间');
});

const {getLoginCode}=load('apps/miniprogram/src/api/login-code.ts');
test('browser development login cannot enter production or replace native WeChat login',async()=>{
 let calls=0;const native=async()=>{calls++;return {code:'one-time-wechat-code'}};
 assert.equal(await getLoginCode(true,true,native),'local-development');assert.equal(calls,0);
 await assert.rejects(()=>getLoginCode(false,true,native),/微信小程序/);assert.equal(calls,0);
 assert.equal(await getLoginCode(false,false,native),'one-time-wechat-code');assert.equal(calls,1);
 await assert.rejects(()=>getLoginCode(true,false,async()=>({code:''})),/未完成/);
});
