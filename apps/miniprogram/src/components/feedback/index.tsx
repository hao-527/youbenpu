import { View } from '@tarojs/components'
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import { useNativeOverlay } from '../../hooks/use-native-overlay'

import { ConfirmDialog, type ConfirmData, type ConfirmOptions } from './confirm-dialog'
import { Toast, type ToastData, type ToastKind } from './toast'


interface FeedbackApi {
  toast: (text: string, kind?: ToastKind, duration?: number) => void
  confirm: (options: ConfirmOptions) => Promise<{ confirmed: boolean; value?: string }>
}

interface FeedbackState extends FeedbackApi {
  toasts: ToastData[]
  dialog: ConfirmData | null
  removeToast: (id: number) => void
}

const FeedbackContext = createContext<FeedbackState | null>(null)

export function FeedbackProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [dialog, setDialog] = useState<ConfirmData | null>(null)
  useNativeOverlay(Boolean(dialog))
  const seq = useRef(0)
  const dialogPending = useRef(false)

  const toast = useCallback((text: string, kind: ToastKind = 'none', duration = 1600) => {
    const id = ++seq.current
    setToasts((prev) => [...prev, { id, text, kind, duration }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    if (dialogPending.current) return Promise.resolve({ confirmed: false })
    dialogPending.current = true
    return new Promise<{ confirmed: boolean; value?: string }>((resolve) => {
      const id = ++seq.current
      setDialog({
        ...options,
        id,
        resolve: (result) => {
          dialogPending.current = false
          setDialog(null)
          resolve(result)
        }
      })
    })
  }, [])

  return (
    <FeedbackContext.Provider value={{ toast, confirm, toasts, dialog, removeToast }}>
      {children}
      {process.env.TARO_ENV === 'h5' && <FeedbackLayer />}
    </FeedbackContext.Provider>
  )
}

/** WeChat needs actual nodes inside the page root, rather than App children. */
export function FeedbackLayer() {
  const state = useContext(FeedbackContext)
  if (!state || (!state.toasts.length && !state.dialog)) return null
  return <View className='feedback-layer'>
    {state.toasts.length > 0 && <View className='feedback-toasts'>
      {state.toasts.map(t => <Toast key={t.id} data={t} onDone={state.removeToast} />)}
    </View>}
    {state.dialog && <ConfirmDialog key={state.dialog.id} data={state.dialog} />}
  </View>
}

/** Hook for components. Throws if used outside FeedbackProvider. */
export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider')
  return ctx
}

export function useToast() {
  return useFeedback().toast
}

export function useConfirm() {
  return useFeedback().confirm
}
