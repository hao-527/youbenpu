const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto'),{spawnSync}=require('node:child_process');
test('phone builds reject active output writers and recover a stale lock',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ybp-lock-test-')),output=path.join(dir,'output');
 const lock=path.join(os.tmpdir(),`youbenpu-weapp-${createHash('sha256').update(output).digest('hex').slice(0,20)}.lock`);
 try {
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);fs.writeFileSync(path.join(bin,'npm'),'#!/bin/sh\nexit 0\n',{mode:0o700});
  const env={...process.env,TARO_APP_API_BASE:'http://192.168.1.2:8080',YBP_OUTPUT_ROOT:output,PATH:bin+path.delimiter+process.env.PATH};
  fs.writeFileSync(lock,String(process.pid));let r=spawnSync(process.execPath,['scripts/dev-phone.cjs','--build'],{env,encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/已有微信编译进程/);assert.equal(fs.readFileSync(lock,'utf8'),String(process.pid));
  fs.writeFileSync(lock,'2147483647');r=spawnSync(process.execPath,['scripts/dev-phone.cjs','--build'],{env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert(!fs.existsSync(lock));
 } finally {fs.rmSync(lock,{force:true});fs.rmSync(dir,{recursive:true,force:true});}
});
