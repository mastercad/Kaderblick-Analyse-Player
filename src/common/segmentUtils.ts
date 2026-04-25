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

export const parseTimeInput = (input: string): number | null => {
  const trimmed = input.trim()
  if (!trimmed) return null

  const parts = trimmed.split(':')

  if (parts.length === 2) {
    const mStr = parts[0].trim()
    const sStr = parts[1].trim()
    if (mStr.includes('.') || mStr.includes(',')) return null
    const minutes = parseInt(mStr, 10)
    const seconds = parseFloat(sStr.replace(',', '.'))
    if (Number.isFinite(minutes) && Number.isFinite(seconds) && minutes >= 0 && seconds >= 0 && seconds < 60) {
      return minutes * 60 + seconds
    }
    return null
  }

  if (parts.length === 3) {
    const hStr = parts[0].trim()
    const mStr = parts[1].trim()
    const sStr = parts[2].trim()
    if (hStr.includes('.') || hStr.includes(',') || mStr.includes('.') || mStr.includes(',')) return null
    const hours = parseInt(hStr, 10)
    const minutes = parseInt(mStr, 10)
    const seconds = parseFloat(sStr.replace(',', '.'))
    if (
      Number.isFinite(hours) && Number.isFinite(minutes) && Number.isFinite(seconds) &&
      hours >= 0 && minutes >= 0 && minutes < 60 && seconds >= 0 && seconds < 60
    ) {
      return hours * 3600 + minutes * 60 + seconds
    }
    return null
  }

  // Plain number treated as seconds (only when no colons)
  if (parts.length === 1) {
    const plain = parseFloat(trimmed.replace(',', '.'))
    if (Number.isFinite(plain) && plain >= 0) return plain
  }
  return null
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
    return activeIndex + 1 < segments.length ? activeIndex + 1 : -1
  }

  return segments.findIndex((segment) => segment.startSeconds > currentTimeSeconds)
}

export const getPreviousSegmentIndex = (segments: Segment[], currentTimeSeconds: number): number => {
  const activeIndex = findActiveSegmentIndex(segments, currentTimeSeconds)

  if (activeIndex > 0) {
    return activeIndex - 1
  }

  if (activeIndex === 0) {
    return -1
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

export const serializeSegmentsToCsv = (segments: Segment[]): string => {
  const rows = segments.map((s) => ({
    videoname: s.sourceVideoPath,
    start_minute: s.startSeconds / 60,
    length_seconds: s.lengthSeconds,
    title: s.title,
    sub_title: s.subTitle,
    audio: s.audioTrack
  }))
  return Papa.unparse(rows, {
    columns: ['videoname', 'start_minute', 'length_seconds', 'title', 'sub_title', 'audio']
  })
}

/**
 * Returns a new segment array prepared for interstitial display:
 * - Segments with an empty title inherit the last non-empty title from any preceding segment.
 * - Segments that still have no title after that step are labelled "Segment N", where N is
 *   the 1-based position of the segment within this video's segment list.
 * - When ALL segments of the list lack a title, every segment gets "Segment N".
 * Use for display purposes only (interstitials) — never pass the result to the editor.
 */
export const interpolateSegmentTitles = (segments: Segment[]): Segment[] => {
  // First pass: fill empty titles from the previous non-empty title (inheritance)
  let lastTitle = ''
  const afterInheritance = segments.map((segment) => {
    if (segment.title) {
      lastTitle = segment.title
      return segment
    }
    return lastTitle ? { ...segment, title: lastTitle } : segment
  })

  // Second pass: any segment still without a title gets "Segment N";
  // any segment without a subTitle also gets "Segment N" (no inheritance — always numbered)
  return afterInheritance.map((segment, index) => {
    const title = segment.title || `Segment ${index + 1}`
    const subTitle = segment.subTitle || `Segment ${index + 1}`
    return (title !== segment.title || subTitle !== segment.subTitle)
      ? { ...segment, title, subTitle }
      : segment
  })
}
