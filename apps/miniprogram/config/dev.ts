import type { UserConfigExport } from '@tarojs/cli'

const config: UserConfigExport = {
  env: {
    NODE_ENV: '"development"'
  },
  defineConstants: {
    // Local backend for devtools simulator. The simulator can reach the API
    // via 127.0.0.1. For 真机预览 on a phone, swap this to the Mac's LAN IP
    // (check with `ipconfig getifaddr en0`, e.g. http://172.18.13.236:8080)
    // because 127.0.0.1 only works inside the simulator.
    API_BASE_URL: '"http://172.18.11.84:8080"'
  },
  mini: {}
}

export default config
