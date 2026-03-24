import type { AppInfo, AppSettingsExport, CsvFileDescriptor, FilterPreset, FilterSettings, VideoFileDescriptor } from './types'

interface BuildAppSettingsExportInput {
  appInfo: AppInfo
  selectedVideo?: VideoFileDescriptor
  selectedCsv?: CsvFileDescriptor
  matchedSegmentCount: number
  selectedPresetId: string
  selectedPresetName: string
  filterOverlayVisible: boolean
  repeatSingleSegment: boolean
  filterSettings: FilterSettings
  customPresets: FilterPreset[]
}

export const buildAppSettingsExport = ({
  appInfo,
  selectedVideo,
  selectedCsv,
  matchedSegmentCount,
  selectedPresetId,
  selectedPresetName,
  filterOverlayVisible,
  repeatSingleSegment,
  filterSettings,
  customPresets
}: BuildAppSettingsExportInput): AppSettingsExport => {
  return {
    appName: appInfo.name,
    appVersion: appInfo.version,
    exportedAt: new Date().toISOString(),
    selectedVideoPath: selectedVideo?.path,
    selectedVideoName: selectedVideo?.fileName,
    selectedCsvPath: selectedCsv?.path,
    selectedCsvName: selectedCsv?.fileName,
    matchedSegmentCount,
    selectedPresetId,
    selectedPresetName,
    filterOverlayVisible,
    repeatSingleSegment,
    filterSettings: { ...filterSettings },
    customPresets: customPresets.map((preset) => ({
      ...preset,
      settings: { ...preset.settings }
    }))
  }
}
