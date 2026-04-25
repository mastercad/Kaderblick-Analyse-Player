import '@testing-library/jest-dom'

// happy-dom does not implement MediaError — provide the W3C constants
if (typeof window.MediaError === 'undefined') {
  Object.defineProperty(window, 'MediaError', {
    value: {
      MEDIA_ERR_ABORTED: 1,
      MEDIA_ERR_NETWORK: 2,
      MEDIA_ERR_DECODE: 3,
      MEDIA_ERR_SRC_NOT_SUPPORTED: 4
    },
    writable: false,
    configurable: true
  })
}

// Minimal desktopApi stub so VideoWorkspace tests work without Electron IPC
// getKeyframeTimes returns a never-resolving promise to avoid triggering
// setKeyframeTimes() as a microtask outside of act(), which would produce
// "An update to VideoWorkspace inside a test was not wrapped in act" warnings.
Object.defineProperty(window, 'desktopApi', {
  value: {
    getKeyframeTimes: (): Promise<number[]> => new Promise(() => {})
  },
  writable: true,
  configurable: true
})
