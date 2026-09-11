import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { FullscreenFlyout } from './playerTypes'

interface UseFullscreenOptions {
  playerPanelRef: RefObject<HTMLElement | null>
}

export function useFullscreen({ playerPanelRef }: UseFullscreenOptions) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hoveredFullscreenFlyout, setHoveredFullscreenFlyout] = useState<FullscreenFlyout | null>(null)
  const [pinnedFullscreenFlyout, setPinnedFullscreenFlyout] = useState<FullscreenFlyout | null>(null)
  const hoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeFullscreenFlyout = pinnedFullscreenFlyout ?? hoveredFullscreenFlyout

  const cancelHoverClose = (): void => {
    if (hoverCloseTimerRef.current === null) return
    clearTimeout(hoverCloseTimerRef.current)
    hoverCloseTimerRef.current = null
  }

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      const el = document.fullscreenElement
      // Also treat a descendant going fullscreen (e.g. an embedded iframe requesting
      // its own fullscreen) as "we are still in fullscreen" so the panel keeps its
      // fullscreen layout and controls remain accessible.
      setIsFullscreen(
        el === playerPanelRef.current ||
        (el !== null && playerPanelRef.current?.contains(el) === true)
      )
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    if (!isFullscreen) {
      cancelHoverClose()
      setHoveredFullscreenFlyout(null)
      setPinnedFullscreenFlyout(null)
    }
  }, [isFullscreen])

  useEffect(() => () => cancelHoverClose(), [])

  const toggleFullscreen = async (): Promise<void> => {
    if (!playerPanelRef.current) return
    if (document.fullscreenElement === playerPanelRef.current) {
      await document.exitFullscreen()
      return
    }
    await playerPanelRef.current.requestFullscreen()
  }

  const toggleFullscreenFlyout = (flyout: FullscreenFlyout): void => {
    cancelHoverClose()
    setHoveredFullscreenFlyout(flyout)
    setPinnedFullscreenFlyout((current) => (current === flyout ? null : flyout))
  }

  const handleFullscreenFlyoutMouseEnter = (flyout: FullscreenFlyout): void => {
    cancelHoverClose()
    setHoveredFullscreenFlyout(flyout)
  }

  const handleFullscreenFlyoutMouseLeave = (flyout: FullscreenFlyout): void => {
    cancelHoverClose()
    hoverCloseTimerRef.current = setTimeout(() => {
      setHoveredFullscreenFlyout((current) => (current === flyout ? null : current))
      hoverCloseTimerRef.current = null
    }, 240)
  }

  const closeUnpinnedFullscreenFlyout = (flyout: FullscreenFlyout): void => {
    if (pinnedFullscreenFlyout === flyout) return
    cancelHoverClose()
    setHoveredFullscreenFlyout((current) => (current === flyout ? null : current))
  }

  return {
    isFullscreen,
    activeFullscreenFlyout,
    pinnedFullscreenFlyout,
    setPinnedFullscreenFlyout,
    toggleFullscreen,
    toggleFullscreenFlyout,
    closeUnpinnedFullscreenFlyout,
    handleFullscreenFlyoutMouseEnter,
    handleFullscreenFlyoutMouseLeave
  }
}
