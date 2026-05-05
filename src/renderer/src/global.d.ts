/// <reference types="vite/client" />

import type { AppInfo, AppSettingsExport, CsvFileDescriptor, FilterPreset, VideoFileDescriptor, VideoPreparationProgress } from '../../common/types'

// ─── YouTube IFrame Player API ────────────────────────────────────────────────
interface YTPlayerOptions {
  height?: string | number
  width?: string | number
  videoId?: string
  playerVars?: {
    autoplay?: 0 | 1
    controls?: 0 | 1 | 2
    disablekb?: 0 | 1
    fs?: 0 | 1
    modestbranding?: 0 | 1
    playsinline?: 0 | 1
    rel?: 0 | 1
    start?: number
  }
  events?: {
    onReady?: (event: { target: YTPlayer }) => void
    onStateChange?: (event: { target: YTPlayer; data: number }) => void
    onError?: (event: { target: YTPlayer; data: number }) => void
  }
}

interface YTPlayer {
  playVideo(): void
  pauseVideo(): void
  seekTo(seconds: number, allowSeekAhead: boolean): void
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  setVolume(volume: number): void
  mute(): void
  unMute(): void
  destroy(): void
}

interface YTPlayerConstructor {
  new (elementOrId: HTMLElement | string, options: YTPlayerOptions): YTPlayer
}

// ─── Vimeo Player SDK ─────────────────────────────────────────────────────────
interface VimeoPlayer {
  play(): Promise<void>
  pause(): Promise<void>
  setCurrentTime(seconds: number): Promise<number>
  getCurrentTime(): Promise<number>
  getDuration(): Promise<number>
  setVolume(volume: number): Promise<void>
  on(event: 'timeupdate', callback: (data: { seconds: number; duration: number }) => void): void
  on(event: 'play' | 'pause' | 'ended', callback: () => void): void
  on(event: 'error', callback: (data: { message: string }) => void): void
  off(event: string): void
  destroy(): Promise<void>
}

interface VimeoPlayerConstructor {
  new (elementOrId: HTMLElement | string | number, options?: { id?: number; url?: string }): VimeoPlayer
}

interface DesktopApi {
  pickVideoFile: () => Promise<VideoFileDescriptor | undefined>
  pickVideoFiles: () => Promise<VideoFileDescriptor[] | null>
  preparePlaybackFallback: (sourcePath: string) => Promise<VideoFileDescriptor>
  prepareStreamingPlayback: (sourcePath: string) => Promise<VideoFileDescriptor>
  getKeyframeTimes: (sourcePath: string) => Promise<number[]>
  pickCsvFile: () => Promise<CsvFileDescriptor | undefined>
  saveCsvFile: (content: string) => Promise<boolean>
  loadStoredPresets: () => Promise<FilterPreset[]>
  saveStoredPresets: (presets: FilterPreset[]) => Promise<void>
  exportPresets: (presets: FilterPreset[]) => Promise<boolean>
  importPresets: () => Promise<FilterPreset[]>
  getAppInfo: () => Promise<AppInfo>
  exportAppSettings: (settings: AppSettingsExport) => Promise<boolean>
  importAppSettings: () => Promise<AppSettingsExport | null>
  onVideoPreparationProgress: (listener: (progress: VideoPreparationProgress) => void) => () => void
  fileExists: (filePath: string) => Promise<boolean>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
    YT?: { Player: YTPlayerConstructor; PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number } }
    onYouTubeIframeAPIReady?: () => void
    Vimeo?: { Player: VimeoPlayerConstructor }
  }
}

export {}
