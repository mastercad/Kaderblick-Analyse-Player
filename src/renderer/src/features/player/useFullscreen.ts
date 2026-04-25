import { useEffect, useState } from 'react'
import type { RefObject } from 'react'
import type { FullscreenFlyout } from './playerTypes'

interface UseFullscreenOptions {
  playerPanelRef: RefObject<HTMLElement | null>
}

export function useFullscreen({ playerPanelRef }: UseFullscreenOptions) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hoveredFullscreenFlyout, setHoveredFullscreenFlyout] = useState<FullscreenFlyout | null>(null)
  const [pinnedFullscreenFlyout, setPinnedFullscreenFlyout] = useState<FullscreenFlyout | null>(null)

  const activeFullscreenFlyout = pinnedFullscreenFlyout ?? hoveredFullscreenFlyout

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      setIsFullscreen(document.fullscreenElement === playerPanelRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    if (!isFullscreen) {
      setHoveredFullscreenFlyout(null)
      setPinnedFullscreenFlyout(null)
    }
  }, [isFullscreen])

  const toggleFullscreen = async (): Promise<void> => {
    if (!playerPanelRef.current) return
    if (document.fullscreenElement === playerPanelRef.current) {
      await document.exitFullscreen()
      return
    }
    await playerPanelRef.current.requestFullscreen()
  }

  const toggleFullscreenFlyout = (flyout: FullscreenFlyout): void => {
    setHoveredFullscreenFlyout(flyout)
    setPinnedFullscreenFlyout((current) => (current === flyout ? null : flyout))
  }

  const handleFullscreenFlyoutMouseEnter = (flyout: FullscreenFlyout): void => {
    setHoveredFullscreenFlyout(flyout)
  }

  const handleFullscreenFlyoutMouseLeave = (flyout: FullscreenFlyout): void => {
    setHoveredFullscreenFlyout((current) => (current === flyout ? null : current))
  }

  return {
    isFullscreen,
    activeFullscreenFlyout,
    setPinnedFullscreenFlyout,
    toggleFullscreen,
    toggleFullscreenFlyout,
    handleFullscreenFlyoutMouseEnter,
    handleFullscreenFlyoutMouseLeave
  }
}
