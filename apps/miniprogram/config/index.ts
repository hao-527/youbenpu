import { defineConfig, type UserConfigExport } from '@tarojs/cli'

import devConfig from './dev'
import prodConfig from './prod'

export default defineConfig(async (merge, { command }) => {
  const isWatch = process.argv.includes('--watch')
  const baseConfig: UserConfigExport = {
    projectName: 'youbenpu-miniprogram',
    date: '2026-08-03',
    designWidth: 750,
    deviceRatio: {
      375: 2,
      640: 1.17,
      750: 1,
      828: 0.905
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    framework: 'react',
    compiler: 'webpack5',
    cache: {
      enable: false
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {}
        },
        url: {
          enable: true,
          config: {
            limit: 1024
          }
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]'
          }
        }
      }
    },
    copy: {
      patterns: [
        { from: 'src/assets/tabbar/', to: 'dist/assets/tabbar/', ignore: ['.*'] }
      ],
      options: {}
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      // Render mini-program element tags to real HTML tags on H5 so the
      // page markup is standard DOM (needed for clean rendering/capture).
      esnextModules: ['@tarojs'],
      postcss: {
        autoprefixer: {
          enable: true
        }
      },
      devServer: {
        port: 10086,
        host: '127.0.0.1',
        // The app is browsable without a WeChat login; login failures on H5
        // are expected and handled. Disable the dev-server error overlay so
        // those benign rejections don't paint a red mask over the UI (needed
        // for clean design-capture screenshots).
        client: {
          overlay: false
        }
      }
    }
  }

  const finalConfig = merge({}, baseConfig, command === 'build' && !isWatch ? prodConfig : devConfig)
  // eslint-disable-next-line no-console
  console.log('[DEBUG config] h5.devServer.client =', JSON.stringify(finalConfig.h5?.devServer?.client))
  return finalConfig
})
