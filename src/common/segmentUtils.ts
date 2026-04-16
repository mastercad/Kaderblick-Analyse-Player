import Papa from 'papaparse'
import type { Segment, SegmentCsvRow } from './types'

const sanitizeText = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : ''
}

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim()
    const parsed = Number.parseFloat(normalized)

    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return NaN
}

export const getBaseName = (fullPath: string): string => {
  const normalizedPath = fullPath.replace(/\\/g, '/')
  const parts = normalizedPath.split('/')
  return parts.at(-1)?.trim() ?? ''
}

export const parseSegmentsCsv = (csvText: string): Segment[] => {
  const parsed = Papa.parse<SegmentCsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false
  })

  return parsed.data
    .map((row, index) => {
      const sourceVideoPath = sanitizeText(row.videoname)
      const sourceVideoName = getBaseName(sourceVideoPath)
      const startMinutes = toNumber(row.start_minute)
      const lengthSeconds = toNumber(row.length_seconds)

      if (!sourceVideoName || !Number.isFinite(startMinutes) || !Number.isFinite(lengthSeconds) || lengthSeconds <= 0) {
        return undefined
      }

      const startSeconds = startMinutes * 60
      const endSeconds = startSeconds + lengthSeconds

      return {
        id: `${sourceVideoName}-${index}-${startSeconds.toFixed(2)}`,
        sourceVideoName,
        sourceVideoPath,
        startSeconds,
        endSeconds,
        lengthSeconds,
        title: sanitizeText(row.title),
        subTitle: sanitizeText(row.sub_title),
        audioTrack: sanitizeText(row.audio)
      } satisfies Segment
    })
    .filter((segment): segment is Segment => Boolean(segment))
    .sort((left, right) => left.startSeconds - right.startSeconds)
}

export const matchSegmentsToVideo = (segments: Segment[], videoFileName: string): Segment[] => {
  const target = videoFileName.trim().toLowerCase()
  return segments.filter((segment) => segment.sourceVideoName.toLowerCase() === target)
}

export const matchSegmentsToVideos = (segments: Segment[], videoFileNames: string[]): Segment[] => {
  const targets = new Set(videoFileNames.map((n) => n.trim().toLowerCase()))
  return segments.filter((segment) => targets.has(segment.sourceVideoName.toLowerCase()))
}

export const findActiveSegmentIndex = (segments: Segment[], currentTimeSeconds: number): number => {
  return segments.findIndex(
    (segment) => currentTimeSeconds >= segment.startSeconds && currentTimeSeconds < segment.endSeconds
  )
}

export const getNextSegmentIndex = (segments: Segment[], currentTimeSeconds: number): number => {
  const activeIndex = findActiveSegmentIndex(segments, currentTimeSeconds)

  if (activeIndex >= 0) {
    return activeIndex
  }

  return segments.findIndex((segment) => segment.startSeconds > currentTimeSeconds)
}

export const getPreviousSegmentIndex = (segments: Segment[], currentTimeSeconds: number): number => {
  const activeIndex = findActiveSegmentIndex(segments, currentTimeSeconds)

  if (activeIndex > 0) {
    return activeIndex - 1
  }

  if (activeIndex === 0) {
    return 0
  }

  const earlierSegments = segments.filter((segment) => segment.startSeconds < currentTimeSeconds)
  return earlierSegments.length > 0 ? segments.indexOf(earlierSegments.at(-1)!) : -1
}

export const resolveSegmentSequenceStartIndex = (segments: Segment[], currentTimeSeconds: number): number => {
  if (segments.length === 0) {
    return -1
  }

  const activeIndex = findActiveSegmentIndex(segments, currentTimeSeconds)
  if (activeIndex >= 0) {
    return activeIndex
  }

  const nextIndex = segments.findIndex((segment) => segment.endSeconds > currentTimeSeconds)
  return nextIndex >= 0 ? nextIndex : 0
}
