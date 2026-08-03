import type { PropsWithChildren } from 'react'

import './app.scss'
import { StoreProvider } from './store'

function App({ children }: PropsWithChildren) {
  return StoreProvider({ children })
}

export default App
