import { useRef, useState } from 'react'

/** Lock synchronously, before React renders, so rapid taps share one operation. */
export function useOperation() {
  const locked = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(operation: () => Promise<boolean | void>, failure = '提交失败，请检查网络后重试', keepLockedOnSuccess = false) {
    if (locked.current) return false
    locked.current = true
    setBusy(true)
    setError('')
    let completed = false
    try {
      const succeeded = await operation()
      if (succeeded === false) setError(failure)
      completed = succeeded !== false
      return completed
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : failure)
      return false
    } finally {
      if (!completed || !keepLockedOnSuccess) {
        locked.current = false
        setBusy(false)
      }
    }
  }
  return { busy, error, run }
}
