import { useEffect } from 'react'

/** Visual viewport changes independently of the layout viewport on mobile H5. */
export function useBrowserViewport() {
  useEffect(() => {
    if (process.env.TARO_ENV !== 'h5' || !window.visualViewport) return
    const viewport = window.visualViewport
    const update = () => {
      const editing = /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName || '')
      const inset = editing && viewport.scale === 1
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0
      document.documentElement.style.setProperty('--keyboard-inset', `${inset}px`)
      document.documentElement.style.setProperty('--visual-height', `${viewport.height}px`)
      document.documentElement.toggleAttribute('data-keyboard-open', editing && inset > 100)
    }
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    update()
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
    }
  }, [])
}
