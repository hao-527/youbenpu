/**
 * Global state for managing the current invite code
 * Used by onShareAppMessage handler to include invite in share intent
 */

let currentInviteCode: string | null = null

export function setCurrentInviteCode(code: string | null): void {
  currentInviteCode = code
}

export function getCurrentInviteCode(): string | null {
  return currentInviteCode
}

export function clearCurrentInviteCode(): void {
  currentInviteCode = null
}
