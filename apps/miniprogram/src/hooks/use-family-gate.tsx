import { useDidShow } from '@tarojs/taro'
import { useCallback, useState } from 'react'

import { hasFamily } from '../api/token'
import { FamilySetupSheet } from '../components/family-setup'

interface FamilyGate {
  /** Whether the current user already belongs to a family. */
  joined: boolean
  /**
   * Call before running anything that needs a family. Returns `true` when the
   * user is good to go; otherwise opens the setup sheet and returns `false`.
   */
  requireFamily: (reason?: string) => boolean
  /** Opens the setup sheet unconditionally. */
  openFamilySetup: (reason?: string) => void
  /** Render this once in the page tree. */
  familyGate: React.ReactNode
}

/**
 * Shared "you need a family first" gate.
 *
 * Instead of blocking new users behind a full-screen onboarding page, pages
 * render `familyGate` and call `requireFamily()` at the moment a family is
 * actually needed (记账 / 物品 / 点餐 / 邀请成员…). The 我的 page lets new users choose creation, joining, or a read-only tour.
 */
export function useFamilyGate(): FamilyGate {
  const [, setJoined] = useState(() => hasFamily())
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState<string | undefined>(undefined)

  // Membership can change on other pages (e.g. 退出家庭), so re-read on show.
  useDidShow(() => setJoined(hasFamily()))

  const openFamilySetup = useCallback((why?: string) => {
    setReason(why)
    setOpen(true)
  }, [])

  const requireFamily = useCallback((why?: string) => {
    if (hasFamily()) return true
    openFamilySetup(why)
    return false
  }, [openFamilySetup])

  const familyGate = (
    <FamilySetupSheet
      open={open}
      reason={reason}
      onClose={() => setOpen(false)}
      onDone={() => setJoined(true)}
    />
  )

  return { joined: hasFamily(), requireFamily, openFamilySetup, familyGate }
}
