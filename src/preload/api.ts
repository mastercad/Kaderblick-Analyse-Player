import type { AppInfo, AppSettingsExport, CsvFileDescriptor, FilterPreset, TimelinePreviewCacheState, TimelinePreviewFileInfo, TimelinePreviewFrame, TimelinePreviewSheet, VideoFileDescriptor, VideoPreparationProgress } from '../common/types'

export interface DesktopApi {
  pickVideoFile: () => Promise<VideoFileDescriptor | undefined>
  pickVideoFiles: () => Promise<VideoFileDescriptor[] | null>
  preparePlaybackFallback: (sourcePath: string) => Promise<VideoFileDescriptor>
  prepareStreamingPlayback: (sourcePath: string) => Promise<VideoFileDescriptor>
  getKeyframeTimes: (sourcePath: string) => Promise<number[]>
  getTimelinePreviewFileInfo: (sourcePath: string) => Promise<TimelinePreviewFileInfo>
  readTimelinePreviewRange: (sourcePath: string, offset: number, length: number) => Promise<Uint8Array>
  getTimelinePreviewCacheState: (sourcePath: string) => Promise<TimelinePreviewCacheState>
  storeTimelinePreviewSheet: (sourcePath: string, sheet: TimelinePreviewSheet) => Promise<void>
  markTimelinePreviewPhaseComplete: (sourcePath: string, phase: 'coarse' | 'fine') => Promise<void>
  getTimelinePreviewFrame: (sourcePath: string, seconds: number) => Promise<TimelinePreviewFrame | null>
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
  }
}
