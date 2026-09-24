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

export interface SegmentEditorDraft {
  draftId: string
  videoPath: string
  startTimeInput: string
  endTimeInput: string
  title: string
  subTitle: string
  audioEnabled: boolean
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
  playbackMode: 'direct' | 'proxy' | 'stream' | 'online'
  sourceCodec?: string
  durationSeconds?: number
  playbackPath?: string
  playbackLabel?: string
  playbackHint?: string
  onlinePlatform?: 'youtube' | 'vimeo'
  onlineVideoId?: string
  matchGroupId?: string
  matchHalf?: 1 | 2
  kickoffVideoSeconds?: number
  matchDurationSeconds?: number
}

export type PlayerJumpTimeMode =
  | 'video-per-file'
  | 'video-cumulative'
  | 'match-per-part'
  | 'match-cumulative'

export interface VideoPreparationProgress {
  phase: 'idle' | 'analyzing' | 'transcoding' | 'ready' | 'error'
  message: string
  percent?: number
}

export interface TimelinePreviewFileInfo {
  size: number
  mtimeMs: number
  extension: string
}

export interface TimelinePreviewFrame {
  imageUrl: string
  column: number
  row: number
  columns: number
  rows: number
}

export interface TimelinePreviewCacheState {
  coarseComplete: boolean
  fineComplete: boolean
  cachedTargets: number[]
}

export interface TimelinePreviewSheet {
  phase: 'coarse' | 'fine'
  targets: number[]
  columns: number
  rows: number
  imageBytes: Uint8Array
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

export interface SessionSnapshot {
  savedAt: string
  videoLibrary: VideoFileDescriptor[]
  activeVideoIndex: number
  csvFileName?: string
  csvPath?: string
  csvContent?: string
  allSegments?: Segment[]
  segmentEditorDrafts?: SegmentEditorDraft[]
  filterSettings: FilterSettings
  filterOverlayVisible: boolean
  repeatSingleSegment: boolean
  selectedPresetId: string
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
