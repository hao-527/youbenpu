import type { UserConfigExport } from '@tarojs/cli'

const config: UserConfigExport = {
  env: {
    NODE_ENV: '"development"'
  },
  defineConstants: {
    // Simulator/H5 use loopback. Real-phone development can explicitly set
    // TARO_APP_API_BASE to this Mac's reachable LAN URL; no stale IP fallback.
    API_BASE_URL: JSON.stringify(process.env.TARO_APP_API_BASE || 'http://127.0.0.1:8080'),
    REQUIRE_WECHAT_LOGIN: JSON.stringify(process.env.TARO_APP_REQUIRE_WECHAT_LOGIN === '1')
  },
  mini: {}
}

export default config
