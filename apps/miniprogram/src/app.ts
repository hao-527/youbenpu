import type { PropsWithChildren } from 'react'

import './app.scss'
import { StoreProvider } from './store'

function App({ children }: PropsWithChildren) {
  // Auth & family gate disabled for local development.
  // useEffect(() => {
  //   if (!isLoggedIn() || !hasFamily()) {
  //     const currentPath = Taro.getCurrentInstance().router?.path || ''
  //     if (!currentPath.includes('auth')) {
  //       Taro.redirectTo({ url: '/pages/auth/index' })
  //     }
  //   }
  // }, [])

  return StoreProvider({ children })
}

export default App
