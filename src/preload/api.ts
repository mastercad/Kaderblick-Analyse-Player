import type { AppInfo, AppSettingsExport, CsvFileDescriptor, FilterPreset, VideoFileDescriptor } from '../common/types'

export interface DesktopApi {
  pickVideoFile: () => Promise<VideoFileDescriptor | undefined>
  pickCsvFile: () => Promise<CsvFileDescriptor | undefined>
  loadStoredPresets: () => Promise<FilterPreset[]>
  saveStoredPresets: (presets: FilterPreset[]) => Promise<void>
  exportPresets: (presets: FilterPreset[]) => Promise<boolean>
  importPresets: () => Promise<FilterPreset[]>
  getAppInfo: () => Promise<AppInfo>
  exportAppSettings: (settings: AppSettingsExport) => Promise<boolean>
}

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}
