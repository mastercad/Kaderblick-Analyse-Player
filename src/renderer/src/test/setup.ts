import '@testing-library/jest-dom'

// Minimal desktopApi stub so VideoWorkspace tests work without Electron IPC
Object.defineProperty(window, 'desktopApi', {
  value: {
    getKeyframeTimes: (): Promise<number[]> => Promise.resolve([])
  },
  writable: true,
  configurable: true
})
