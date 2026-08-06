import Taro from '@tarojs/taro'
import type { PropsWithChildren } from 'react'
import { useEffect } from 'react'

import './app.scss'
import { hasFamily, isLoggedIn } from './api/token'
import { StoreProvider } from './store'

function App({ children }: PropsWithChildren) {
  useEffect(() => {
    // On app launch, check if user is logged in and has a family.
    // If not, redirect to auth page.
    // This runs on cold start. Tab pages load first, then this redirect kicks in.
    if (!isLoggedIn() || !hasFamily()) {
      const currentPath = Taro.getCurrentInstance().router?.path || ''
      // Don't redirect if already on auth page
      if (!currentPath.includes('auth')) {
        Taro.redirectTo({ url: '/pages/auth/index' })
      }
    }
  }, [])

  return StoreProvider({ children })
}

export default App
