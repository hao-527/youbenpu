#!/bin/zsh
# Load credentials only into the API process; never print their values.
set -eu
set +x
script_root=${0:A:h:h}
cd "$script_root/services/api"
if [[ ! -f .env ]]; then
  print -u2 '缺少 services/api/.env；请先准备本地测试配置。'
  exit 1
fi
set -a
source .env
set +a
case "${DB_HOST:-127.0.0.1}" in
  127.0.0.1|localhost|::1) ;;
  *) print -u2 '真机本地启动脚本仅允许本机测试数据库，拒绝连接其他数据库。'; exit 1 ;;
esac
if [[ -z "${WX_APPID:-}" || -z "${WX_APP_SECRET:-}" || "${WX_APPID:-}" == your_wechat_app_id || "${WX_APP_SECRET:-}" == your_wechat_app_secret ]]; then
  print -u2 '缺少可用的微信测试凭据；未启动新服务，请在私有.env配置匹配的WX_APPID/WX_APP_SECRET。'
  exit 1
fi
node -e 'const p=require("../../apps/miniprogram/project.config.json"); if(process.env.WX_APPID!==p.appid){console.error("微信测试AppID与当前小程序项目不匹配；未输出配置值。");process.exit(1)}'
if [[ "${1:-}" == --check ]]; then
  print '微信测试配置可加载；仅报告就绪，不输出凭据。'
  exit 0
fi
# Explicit local test mode disables forged development identities.
export APP_ENV=test ENABLE_DEV_LOGIN=false
# An occupied default port must not require terminating an unrelated service.
export HTTP_ADDRESS="${YBP_HTTP_ADDRESS:-:8080}"
exec go run ./cmd/api
