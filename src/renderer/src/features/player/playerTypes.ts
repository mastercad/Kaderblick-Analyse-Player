export type FullscreenFlyout = 'top' | 'left' | 'right' | 'bottom'
export type Point = { x: number; y: number }
export type Size = { width: number; height: number }
export type VideoRect = { left: number; top: number; width: number; height: number }

export const MIN_ZOOM_LEVEL = 1
export const MAX_ZOOM_LEVEL = 4
export const ZOOM_STEP = 0.25
export const FRAME_STEP_SECONDS = 1 / 25
export const SEEK_STEP_SECONDS = 5
export const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]
