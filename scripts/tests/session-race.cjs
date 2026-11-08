const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),test=require('node:test');
function load(file,imports){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,process:{env:{TARO_ENV:'weapp'}},require:id=>{assert(id in imports,id);return imports[id]}});return exports}
const root='apps/miniprogram/src/api/';
test('a delayed 401 cannot log out a newer session; current-session 401 clears it',async()=>{
 const store=new Map(),taro={getStorageSync:k=>store.get(k),setStorageSync:(k,v)=>store.set(k,v),removeStorageSync:k=>store.delete(k)};
 const token=load(root+'token.ts',{'@tarojs/taro':{default:taro},'../utils/invite-state':{clearCurrentInviteCode(){}},'./config':{API:{BASE:'isolated'},requireWechatLogin:false}});
 let resolve; taro.request=()=>new Promise(r=>resolve=r);
 const http=load(root+'http.ts',{'@tarojs/taro':{default:taro},'./token':token});
 token.setToken('old-session');const pending=http.get('/isolated');token.setToken('new-session');resolve({statusCode:401,data:{}});await assert.rejects(pending,e=>e.status===401);assert.equal(token.getToken(),'new-session');
 const current=http.get('/isolated');resolve({statusCode:401,data:{}});await assert.rejects(current);assert.equal(token.getToken(),'');
 token.setToken('still-valid');const login=http.post('/login',{}, {noAuth:true});resolve({statusCode:401,data:{}});await assert.rejects(login);assert.equal(token.getToken(),'still-valid');
});

test('native bill upload 401 also preserves a replacement session',async()=>{
 let active='old',resolve;
 const api=load(root+'ledger-import.ts',{'@tarojs/taro':{default:{uploadFile:()=>new Promise(r=>resolve=r)}},'./config':{API:{LEDGER_IMPORT:'/isolated'}},'./http':{post(){}},'./token':{getToken:()=>active,clearSessionIfCurrent:token=>{if(active===token)active=''}}});
 const pending=api.importBill('isolated.csv');active='new';resolve({statusCode:401,data:'{"error":{"message":"expired"}}'});await assert.rejects(pending);assert.equal(active,'new');
});
