import { defineConfig, type UserConfigExport } from '@tarojs/cli'
import path from 'node:path'

import devConfig from './dev'
import prodConfig from './prod'

export default defineConfig(async (merge, { command }) => {
  const isWatch = process.argv.includes('--watch')
  const isDevelopmentBuild = isWatch || process.env.NODE_ENV === 'development'
  const outputRoot = process.env.YBP_OUTPUT_ROOT || (process.env.TARO_ENV === 'h5' ? 'dist-h5' : 'dist')
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
    outputRoot,
    framework: 'react',
    alias: { 'lucide$': path.resolve(__dirname, '../src/icons/lucide.js') },
    compiler: {
      type: 'webpack5',
      // Taro's development prebundle rewrites Lucide's Infinity icon export
      // as the global constant. Let webpack process the original ESM instead.
      prebundle: { exclude: ['lucide'] }
    },
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
        { from: 'src/assets/tabbar/', to: `${outputRoot}/assets/tabbar/`, ignore: ['.*'] }
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

  const finalConfig = merge({}, baseConfig, command === 'build' && !isDevelopmentBuild ? prodConfig : devConfig)
  return finalConfig
})
