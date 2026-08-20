import type { UserConfigExport } from '@tarojs/cli'

const config: UserConfigExport = {
  env: {
    NODE_ENV: '"production"'
  },
  defineConstants: {
    API_BASE_URL: '"https://apiyoubenpu.maptrace.top"'
  },
  mini: {}
}

export default config
