import { createContext, useContext, useEffect, useReducer } from 'react'
import type { Dispatch, PropsWithChildren } from 'react'

import { initialState } from './initial-state'
import { appReducer, type AppAction, type AppState } from './reducer'
import { loadState, saveState } from './storage'

const StateContext = createContext<AppState>(initialState)
const DispatchContext = createContext<Dispatch<AppAction>>(() => {})

export function StoreProvider({ children }: PropsWithChildren) {
  const [state, dispatch] = useReducer(appReducer, initialState, (seed) => loadState(seed))

  useEffect(() => {
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
