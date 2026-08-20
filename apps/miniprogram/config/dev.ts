import type { UserConfigExport } from '@tarojs/cli'

const config: UserConfigExport = {
  env: {
    NODE_ENV: '"development"'
  },
  defineConstants: {
    // LAN address so 真机调试/预览 on a phone can reach the API running on this
    // Mac. `127.0.0.1` only works inside the simulator. Update this whenever
    // the machine changes network (check with `ipconfig getifaddr en0`).
    API_BASE_URL: '"http://172.18.13.236:8080"'
  },
  mini: {}
}

export default config
