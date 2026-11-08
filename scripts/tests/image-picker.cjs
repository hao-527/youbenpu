const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
test('image selection failure is visible while cancellation stays quiet',async()=>{
 const source=ts.transpileModule(fs.readFileSync('apps/miniprogram/src/utils/media.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 for(const [message,want] of [['chooseImage:fail cancel',0],['chooseImage:fail not support',1]]){
  const toasts=[],exports={};const imports={'@tarojs/taro':{default:{chooseImage:async()=>{throw {errMsg:message}},showToast:v=>toasts.push(v)}},'../api/config':{API:{}},'../api/token':{getToken(){},clearSessionIfCurrent(){}}};
  vm.runInNewContext(source,{exports,require:id=>imports[id]});assert.equal(await exports.choosePersistentImage(),null);assert.equal(toasts.length,want);
 }
});
