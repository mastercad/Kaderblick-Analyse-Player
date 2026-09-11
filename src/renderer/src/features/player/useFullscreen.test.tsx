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

  it('becomes true when fullscreenchange fires with a DESCENDANT of the panel as fullscreenElement', () => {
    // Simulates the YouTube iframe calling requestFullscreen() which makes
    // document.fullscreenElement point to the iframe (a child of the panel).
    const { hook, panelEl } = setup()
    const childEl = document.createElement('div')
    panelEl.appendChild(childEl)
    enterFullscreen(childEl)
    expect(hook.result.current.isFullscreen).toBe(true)
  })

  it('remains false when fullscreenchange fires for an unrelated element', () => {
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
// activeFullscreenFlyout – stable hover and click/pin
// ---------------------------------------------------------------------------

describe('useFullscreen – stable flyout state', () => {
  it('activeFullscreenFlyout is null initially', () => {
    const { hook } = setup()
    expect(hook.result.current.activeFullscreenFlyout).toBeNull()
  })

  it('opens on hover and waits briefly before closing', () => {
    vi.useFakeTimers()
    const { hook } = setup()
    act(() => { hook.result.current.handleFullscreenFlyoutMouseEnter('right') })
    expect(hook.result.current.activeFullscreenFlyout).toBe('right')

    act(() => { hook.result.current.handleFullscreenFlyoutMouseLeave('right') })
    expect(hook.result.current.activeFullscreenFlyout).toBe('right')
    act(() => { vi.advanceTimersByTime(240) })
    expect(hook.result.current.activeFullscreenFlyout).toBeNull()
    vi.useRealTimers()
  })

  it('cancels closing when the pointer reaches the flyout', () => {
    vi.useFakeTimers()
    const { hook } = setup()
    act(() => { hook.result.current.handleFullscreenFlyoutMouseEnter('right') })
    act(() => { hook.result.current.handleFullscreenFlyoutMouseLeave('right') })
    act(() => { hook.result.current.handleFullscreenFlyoutMouseEnter('right') })
    act(() => { vi.advanceTimersByTime(240) })
    expect(hook.result.current.activeFullscreenFlyout).toBe('right')
    vi.useRealTimers()
  })

  it('pins the flyout on first toggle', () => {
    const { hook } = setup()
    act(() => { hook.result.current.toggleFullscreenFlyout('right') })
    expect(hook.result.current.activeFullscreenFlyout).toBe('right')
  })

  it('unpins the flyout on the second toggle and closes after hover ends', () => {
    vi.useFakeTimers()
    const { hook } = setup()
    act(() => { hook.result.current.toggleFullscreenFlyout('right') })
    act(() => { hook.result.current.toggleFullscreenFlyout('right') })
    expect(hook.result.current.activeFullscreenFlyout).toBe('right')
    act(() => { hook.result.current.handleFullscreenFlyoutMouseLeave('right') })
    act(() => { vi.advanceTimersByTime(240) })
    expect(hook.result.current.activeFullscreenFlyout).toBeNull()
    vi.useRealTimers()
  })

  it('switches to a different flyout when a new flyout is toggled', () => {
    const { hook } = setup()
    act(() => { hook.result.current.toggleFullscreenFlyout('right') })
    act(() => { hook.result.current.toggleFullscreenFlyout('left') })
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
  it('clears pinned flyout when fullscreen is exited', () => {
    const { hook, panelEl } = setup()
    enterFullscreen(panelEl)
    act(() => { hook.result.current.toggleFullscreenFlyout('right') })
    exitFullscreen()
    expect(hook.result.current.activeFullscreenFlyout).toBeNull()
  })
})
