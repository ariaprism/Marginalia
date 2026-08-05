import { useCallback, useEffect, useRef, useState } from 'react'
import { readCallingCard, writeCallingCard, type CallingCard } from '../settings/localSettings'
import type { DrawerPage, SidebarPhase, SidebarSection } from './Drawer'

export function useDrawer() {
  const [phase, setPhase] = useState<SidebarPhase>(null)
  const closeTimerRef = useRef<number | null>(null)
  const [section, setSection] = useState<SidebarSection>('shelf')
  const [page, setPage] = useState<DrawerPage | null>(null)
  const [callingCard, setCallingCard] = useState<CallingCard>(readCallingCard)

  const userLabel = callingCard.userName.trim() || '我'
  const companionLabel = callingCard.companionName.trim() || '共读者'
  const companionSubject = callingCard.companionPronoun === 'name'
    ? companionLabel
    : callingCard.companionPronoun

  const open = useCallback(() => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
    setPhase('open')
  }, [])

  const close = useCallback(() => {
    if (phase !== 'open') return
    setPhase('closing')
    closeTimerRef.current = window.setTimeout(() => {
      setPhase(null)
      closeTimerRef.current = null
    }, 320)
  }, [phase])

  const select = useCallback((nextSection: SidebarSection) => {
    setSection(nextSection)
    setPage(nextSection === 'shelf' ? null : nextSection)
    close()
  }, [close])

  const updateCallingCard = useCallback((patch: Partial<CallingCard>) => {
    setCallingCard((current) => {
      const next = { ...current, ...patch }
      writeCallingCard(next)
      return next
    })
  }, [])

  useEffect(() => () => {
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
  }, [])

  useEffect(() => {
    if (phase === null) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [close, phase])

  return {
    phase,
    section,
    page,
    callingCard,
    userLabel,
    companionLabel,
    companionSubject,
    open,
    close,
    select,
    updateCallingCard,
  }
}
