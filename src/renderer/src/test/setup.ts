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
    getKeyframeTimes: (): Promise<number[]> => new Promise(() => {}),
    // Preview generation is tested separately. Keeping discovery pending here
    // prevents background preview state updates from leaking into unrelated UI tests.
    getTimelinePreviewFileInfo: (): Promise<{ size: number; mtimeMs: number; extension: string }> => new Promise(() => {}),
    readTimelinePreviewRange: (): Promise<Uint8Array> => Promise.resolve(new Uint8Array()),
    getTimelinePreviewCacheState: (): Promise<{ coarseComplete: boolean; fineComplete: boolean; cachedTargets: number[] }> => Promise.resolve({ coarseComplete: false, fineComplete: true, cachedTargets: [] }),
    storeTimelinePreviewSheet: (): Promise<void> => Promise.resolve(),
    markTimelinePreviewPhaseComplete: (): Promise<void> => Promise.resolve(),
    getTimelinePreviewFrame: (): Promise<null> => Promise.resolve(null)
  },
  writable: true,
  configurable: true
})
