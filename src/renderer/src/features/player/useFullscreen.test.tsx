import { act, renderHook } from '@testing-library/react'
import { useFullscreen } from './useFullscreen'

// Helper: creates a hook instance with a dedicated panel element
const setup = () => {
  const panelEl = document.createElement('section')
  const playerPanelRef = { current: panelEl }
  const hook = renderHook(() => useFullscreen({ playerPanelRef }))
  return { hook, panelEl }
}

// Simulate the browser dispatching fullscreenchange with a given element as fullscreenElement
const enterFullscreen = (el: HTMLElement): void => {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => el
  })
  act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
}

const exitFullscreen = (): void => {
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => null
  })
  act(() => { document.dispatchEvent(new Event('fullscreenchange')) })
}

afterEach(() => {
  // Always leave fullscreenElement as null between tests to avoid cross-test contamination
  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => null
  })
})

// ---------------------------------------------------------------------------
// isFullscreen tracking
// ---------------------------------------------------------------------------

describe('useFullscreen – isFullscreen', () => {
  it('is false by default', () => {
    const { hook } = setup()
    expect(hook.result.current.isFullscreen).toBe(false)
  })

  it('becomes true when fullscreenchange fires with the panel as fullscreenElement', () => {
    const { hook, panelEl } = setup()
    enterFullscreen(panelEl)
    expect(hook.result.current.isFullscreen).toBe(true)
  })

  it('remains false when fullscreenchange fires for a different element', () => {
    const { hook } = setup()
    const otherEl = document.createElement('div')
    enterFullscreen(otherEl)
    expect(hook.result.current.isFullscreen).toBe(false)
  })

  it('returns to false when fullscreenchange fires with null fullscreenElement', () => {
    const { hook, panelEl } = setup()
    enterFullscreen(panelEl)
    exitFullscreen()
    expect(hook.result.current.isFullscreen).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// activeFullscreenFlyout – hover
// ---------------------------------------------------------------------------

describe('useFullscreen – hover state', () => {
  it('activeFullscreenFlyout is null initially', () => {
    const { hook } = setup()
    expect(hook.result.current.activeFullscreenFlyout).toBeNull()
  })

  it('handleFullscreenFlyoutMouseEnter sets the active flyout', () => {
    const { hook } = setup()
    act(() => { hook.result.current.handleFullscreenFlyoutMouseEnter('top') })
    expect(hook.result.current.activeFullscreenFlyout).toBe('top')
  })

  it('handleFullscreenFlyoutMouseLeave clears the active flyout when the matching flyout leaves', () => {
    const { hook } = setup()
    act(() => { hook.result.current.handleFullscreenFlyoutMouseEnter('top') })
    act(() => { hook.result.current.handleFullscreenFlyoutMouseLeave('top') })
    expect(hook.result.current.activeFullscreenFlyout).toBeNull()
  })

  it('handleFullscreenFlyoutMouseLeave does NOT clear when a different flyout name is passed', () => {
    const { hook } = setup()
    act(() => { hook.result.current.handleFullscreenFlyoutMouseEnter('top') })
    act(() => { hook.result.current.handleFullscreenFlyoutMouseLeave('left') })
    // 'top' is still hovered – 'left' never was, so nothing should change
    expect(hook.result.current.activeFullscreenFlyout).toBe('top')
  })
})

// ---------------------------------------------------------------------------
// activeFullscreenFlyout – pin (toggleFullscreenFlyout)
// ---------------------------------------------------------------------------

describe('useFullscreen – pin state (toggleFullscreenFlyout)', () => {
  it('pins the flyout on first toggle', () => {
    const { hook } = setup()
    act(() => { hook.result.current.toggleFullscreenFlyout('right') })
    expect(hook.result.current.activeFullscreenFlyout).toBe('right')
  })

  it('pinned flyout stays visible even after mouse leaves', () => {
    // Pinning keeps the flyout open regardless of hover state
    const { hook } = setup()
    act(() => { hook.result.current.toggleFullscreenFlyout('right') })
    act(() => { hook.result.current.handleFullscreenFlyoutMouseLeave('right') })
    expect(hook.result.current.activeFullscreenFlyout).toBe('right')
  })

  it('flyout disappears on mouse leave after being unpinned (second toggle)', () => {
    // After unpin, hovered state is still set; leaving finally clears it
    const { hook } = setup()
    act(() => { hook.result.current.toggleFullscreenFlyout('right') }) // pin
    act(() => { hook.result.current.toggleFullscreenFlyout('right') }) // unpin (hovered='right', pinned=null)
    act(() => { hook.result.current.handleFullscreenFlyoutMouseLeave('right') }) // clear hover
    expect(hook.result.current.activeFullscreenFlyout).toBeNull()
  })

  it('switches to a different flyout when a new flyout is toggled', () => {
    const { hook } = setup()
    act(() => { hook.result.current.toggleFullscreenFlyout('right') })
    act(() => { hook.result.current.toggleFullscreenFlyout('left') })
    expect(hook.result.current.activeFullscreenFlyout).toBe('left')
  })

  it('pinned flyout takes priority over hovered flyout', () => {
    const { hook } = setup()
    act(() => { hook.result.current.handleFullscreenFlyoutMouseEnter('bottom') })
    act(() => { hook.result.current.toggleFullscreenFlyout('left') })
    // pinned='left' wins over hovered='bottom'
    expect(hook.result.current.activeFullscreenFlyout).toBe('left')
  })

  it('setPinnedFullscreenFlyout directly pins a flyout', () => {
    const { hook } = setup()
    act(() => { hook.result.current.setPinnedFullscreenFlyout('right') })
    expect(hook.result.current.activeFullscreenFlyout).toBe('right')
  })

  it('setPinnedFullscreenFlyout(null) unpins without going through toggle', () => {
    const { hook } = setup()
    act(() => { hook.result.current.setPinnedFullscreenFlyout('right') })
    act(() => { hook.result.current.setPinnedFullscreenFlyout(null) })
    expect(hook.result.current.activeFullscreenFlyout).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Flyout reset when exiting fullscreen
// ---------------------------------------------------------------------------

describe('useFullscreen – reset on fullscreen exit', () => {
  it('clears hovered flyout when fullscreen is exited', () => {
    const { hook, panelEl } = setup()
    enterFullscreen(panelEl)
    act(() => { hook.result.current.handleFullscreenFlyoutMouseEnter('top') })
    exitFullscreen()
    expect(hook.result.current.activeFullscreenFlyout).toBeNull()
  })

  it('clears pinned flyout when fullscreen is exited', () => {
    const { hook, panelEl } = setup()
    enterFullscreen(panelEl)
    act(() => { hook.result.current.toggleFullscreenFlyout('right') })
    exitFullscreen()
    expect(hook.result.current.activeFullscreenFlyout).toBeNull()
  })
})
