import { createContext, useContext, useEffect, useReducer, useRef } from 'react'
import type { Dispatch, PropsWithChildren } from 'react'

import { initialState } from './initial-state'
import { appReducer, type AppAction, type AppState } from './reducer'
import { loadState, saveState } from './storage'

const StateContext = createContext<AppState>(initialState)
const DispatchContext = createContext<Dispatch<AppAction>>(() => {})

export function StoreProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(appReducer, initialState, (seed) => loadState(seed))
  const hydrated = useRef(false)

  useEffect(() => {
    // The first run would write back the state we just read, and setStorageSync
    // blocks the JS thread at the worst possible moment — app launch.
    if (!hydrated.current) {
      hydrated.current = true
      return
    }
    saveState(state)
  }, [state])

  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  )
}

export function useStore(): AppState {
  return useContext(StateContext)
}

export function useDispatch(): Dispatch<AppAction> {
  return useContext(DispatchContext)
}
