import { View } from '@tarojs/components'
import { createContext, useCallback, useContext, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'

import { ConfirmDialog, type ConfirmData, type ConfirmOptions } from './confirm-dialog'
import { Toast, type ToastData, type ToastKind } from './toast'

import './index.scss'

interface FeedbackApi {
  toast: (text: string, kind?: ToastKind, duration?: number) => void
  confirm: (options: ConfirmOptions) => Promise<{ confirmed: boolean; value?: string }>
}

const FeedbackContext = createContext<FeedbackApi | null>(null)

export function FeedbackProvider({ children }: PropsWithChildren) {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [dialog, setDialog] = useState<ConfirmData | null>(null)
  const seq = useRef(0)

  const toast = useCallback((text: string, kind: ToastKind = 'none', duration = 1600) => {
    const id = ++seq.current
    setToasts((prev) => [...prev, { id, text, kind, duration }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<{ confirmed: boolean; value?: string }>((resolve) => {
      const id = ++seq.current
      setDialog({
        ...options,
        id,
        resolve: (result) => {
          setDialog(null)
          resolve(result)
        }
      })
    })
  }, [])

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      {(toasts.length > 0 || dialog) && (
        <View className='feedback-layer'>
          {toasts.length > 0 && (
            <View className='feedback-toasts'>
              {toasts.map((t) => <Toast key={t.id} data={t} onDone={removeToast} />)}
            </View>
          )}
          {dialog && <ConfirmDialog key={dialog.id} data={dialog} />}
        </View>
      )}
    </FeedbackContext.Provider>
  )
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
