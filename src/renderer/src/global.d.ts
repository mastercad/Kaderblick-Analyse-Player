/// <reference types="vite/client" />

import type { AppInfo, AppSettingsExport, CsvFileDescriptor, FilterPreset, VideoFileDescriptor, VideoPreparationProgress } from '../../common/types'

interface DesktopApi {
  pickVideoFile: () => Promise<VideoFileDescriptor | undefined>
  preparePlaybackFallback: (sourcePath: string) => Promise<VideoFileDescriptor>
  prepareStreamingPlayback: (sourcePath: string) => Promise<VideoFileDescriptor>
  getKeyframeTimes: (sourcePath: string) => Promise<number[]>
  pickCsvFile: () => Promise<CsvFileDescriptor | undefined>
  loadStoredPresets: () => Promise<FilterPreset[]>
  saveStoredPresets: (presets: FilterPreset[]) => Promise<void>
  exportPresets: (presets: FilterPreset[]) => Promise<boolean>
  importPresets: () => Promise<FilterPreset[]>
  getAppInfo: () => Promise<AppInfo>
  exportAppSettings: (settings: AppSettingsExport) => Promise<boolean>
  onVideoPreparationProgress: (listener: (progress: VideoPreparationProgress) => void) => () => void
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
