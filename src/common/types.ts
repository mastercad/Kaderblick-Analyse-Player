export interface SegmentCsvRow {
  videoname: string
  start_minute: string | number
  length_seconds: string | number
  title?: string
  sub_title?: string
  audio?: string | number
}

export interface Segment {
  id: string
  sourceVideoName: string
  sourceVideoPath: string
  startSeconds: number
  endSeconds: number
  lengthSeconds: number
  title: string
  subTitle: string
  audioTrack: string
}

export interface FilterSettings {
  blur: number
  brightness: number
  contrast: number
  grayscale: number
  hueRotate: number
  invert: number
  saturate: number
  sepia: number
}

export interface FilterPreset {
  id: string
  name: string
  settings: FilterSettings
  builtIn: boolean
}

export interface VideoFileDescriptor {
  path: string
  fileName: string
  fileUrl: string
}

export interface CsvFileDescriptor {
  path: string
  fileName: string
  content: string
}

export interface AppStateSnapshot {
  selectedVideo?: VideoFileDescriptor
  selectedCsv?: CsvFileDescriptor
}

export interface SegmentPlaybackOptions {
  repeatSingleSegment: boolean
}

export interface AppInfo {
  name: string
  version: string
  description: string
  homepage: string
  authorName: string
  authorEmail: string
}

export interface AppSettingsExport {
  appName: string
  appVersion: string
  exportedAt: string
  selectedVideoPath?: string
  selectedVideoName?: string
  selectedCsvPath?: string
  selectedCsvName?: string
  matchedSegmentCount: number
  selectedPresetId: string
  selectedPresetName: string
  filterOverlayVisible: boolean
  repeatSingleSegment: boolean
  filterSettings: FilterSettings
  customPresets: FilterPreset[]
}
