// Reproducible LAN build. No credentials are read or included in the client.
const os = require('node:os');
const {spawn} = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const {createHash} = require('node:crypto');
const interfaces = os.networkInterfaces();
const addresses = [...(interfaces.en0 || []), ...Object.values(interfaces).flat()];
const local = addresses.find(a => a && a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address));
const base = process.env.TARO_APP_API_BASE || (local && `http://${local.address}:8080`);
if (!base) throw Error('未找到局域网IPv4，请显式设置 TARO_APP_API_BASE');
const url = new URL(base);
if (!['http:', 'https:'].includes(url.protocol) || ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw Error('真机API必须是手机可访问的HTTP(S)服务根地址，不能使用回环地址或携带凭据');
// A watch and a one-shot build must never overwrite the same webpack output.
const output = path.resolve(__dirname, '../apps/miniprogram', process.env.YBP_OUTPUT_ROOT || 'dist');
const lock = path.join(os.tmpdir(), `youbenpu-weapp-${createHash('sha256').update(output).digest('hex').slice(0, 20)}.lock`);
function acquireOutputLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lock, String(process.pid), {flag: 'wx', mode: 0o600});
      return;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number(fs.readFileSync(lock, 'utf8'));
      if (!Number.isSafeInteger(owner) || owner <= 0) throw Error('编译锁状态异常，请检查已有编译进程。');
      try { process.kill(owner, 0); }
      catch (probe) {
        if (probe.code === 'ESRCH') { fs.unlinkSync(lock); continue; }
        throw probe;
      }
      throw Error('该输出目录已有微信编译进程运行。请复用现有 watch，或设置独立 YBP_OUTPUT_ROOT 后构建，避免白屏。');
    }
  }
  throw Error('无法获取微信编译锁，请重试。');
}
acquireOutputLock();
process.on('exit', () => {
  try { if (fs.readFileSync(lock, 'utf8') === String(process.pid)) fs.unlinkSync(lock); } catch {}
});
console.log(`真机API：${url.origin}；仅正式微信登录，开发身份缓存独立保留。`);
const args = ['run', process.argv.includes('--build') ? 'build:weapp' : 'dev:weapp', '--workspace', '@youbenpu/miniprogram'];
const child = spawn('npm', args, {stdio: 'inherit', env: {...process.env, NODE_ENV: 'development', TARO_APP_API_BASE: url.origin, TARO_APP_REQUIRE_WECHAT_LOGIN: '1'}});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', e => {console.error(e.message); process.exitCode = 1});
child.on('exit', code => {process.exitCode = code ?? 1});
