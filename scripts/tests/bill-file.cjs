const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync('apps/miniprogram/src/utils/bill-file.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
function picker(chooseMessageFile){const exports={};vm.runInNewContext(source,{exports,process:{env:{TARO_ENV:'weapp'}},require:()=>({default:{chooseMessageFile}})});return exports.chooseBillFile}
test('native file picker distinguishes cancellation, unsupported environment and selection failure',async()=>{
 assert.equal(await picker(async()=>{throw {errMsg:'chooseMessageFile:fail cancel'}})(),null);
 await assert.rejects(picker(async()=>{throw {errMsg:'chooseMessageFile:fail not support'}})(),/不支持聊天文件选择/);
 await assert.rejects(picker(async()=>{throw {errMsg:'chooseMessageFile:fail'}})(),/文件选择失败/);
 assert.equal(await picker(async()=>({tempFiles:[{path:'wxfile://isolated.csv'}]}))(),'wxfile://isolated.csv');
});
