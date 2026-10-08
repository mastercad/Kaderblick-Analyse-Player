import { describe, expect, it } from 'vitest'
import { disabledLinuxChromiumFeatures, shouldDisableAcceleratedVideoDecode } from './linuxChromiumFeatures'

describe('Linux Chromium feature compatibility', () => {
  it('disables only the unsupported NVIDIA decoder and Wayland color manager on this combination', () => {
    expect(disabledLinuxChromiumFeatures('linux', 'wayland')).toEqual(['WaylandWpColorManagerV1'])
    expect(shouldDisableAcceleratedVideoDecode('linux', true)).toBe(true)
  })

  it('keeps accelerated decoding enabled on non-NVIDIA Linux systems', () => {
    expect(disabledLinuxChromiumFeatures('linux', 'x11')).toEqual([])
    expect(shouldDisableAcceleratedVideoDecode('linux', false)).toBe(false)
  })

  it('does not alter Chromium features on Windows or macOS', () => {
    expect(disabledLinuxChromiumFeatures('win32', undefined)).toEqual([])
    expect(disabledLinuxChromiumFeatures('darwin', undefined)).toEqual([])
    expect(shouldDisableAcceleratedVideoDecode('win32', true)).toBe(false)
  })
})
