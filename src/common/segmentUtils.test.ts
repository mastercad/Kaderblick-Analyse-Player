import {
  findActiveSegmentIndex,
  getBaseName,
  getNextSegmentIndex,
  getPreviousSegmentIndex,
  interpolateSegmentTitles,
  matchSegmentsToVideo,
  parseSegmentsCsv,
  parseTimeInput,
  resolveSegmentSequenceStartIndex
} from './segmentUtils'

const csv = `videoname,start_minute,length_seconds,title,sub_title,audio
/tmp/videos/Testspiel.mp4,1.5,10,Tor,Erste Halbzeit,1
C:\\videos\\Testspiel.mp4,2,12,Chance,Zweite Szene,1
/tmp/videos/Anderes.mp4,3,8,Foul,,1`

describe('segmentUtils', () => {
  it('extracts basenames from windows and linux paths', () => {
    expect(getBaseName('/tmp/videos/Testspiel.mp4')).toBe('Testspiel.mp4')
    expect(getBaseName('C:\\videos\\Testspiel.mp4')).toBe('Testspiel.mp4')
  })

  it('parses CSV segments preserving row order', () => {
    const segments = parseSegmentsCsv(csv)

    expect(segments).toHaveLength(3)
    expect(segments[0].startSeconds).toBe(90)
    expect(segments[1].startSeconds).toBe(120)
    expect(segments[2].startSeconds).toBe(180)
  })

  it('preserves CSV row order even when segments are not in ascending time order', () => {
    const unsortedCsv = `videoname,start_minute,length_seconds,title,sub_title,audio
/tmp/videos/Video.mp4,3,10,Dritte,Szene 3,1
/tmp/videos/Video.mp4,1,10,Erste,Szene 1,1
/tmp/videos/Video.mp4,2,10,Zweite,Szene 2,1`

    const segments = parseSegmentsCsv(unsortedCsv)

    expect(segments[0].startSeconds).toBe(180)
    expect(segments[1].startSeconds).toBe(60)
    expect(segments[2].startSeconds).toBe(120)
  })

  it('matches all segments by video file name only', () => {
    const segments = parseSegmentsCsv(csv)
    const matching = matchSegmentsToVideo(segments, 'Testspiel.mp4')

    expect(matching).toHaveLength(2)
  })

  it('finds previous, next and active segments', () => {
    const segments = matchSegmentsToVideo(parseSegmentsCsv(csv), 'Testspiel.mp4')

    expect(findActiveSegmentIndex(segments, 95)).toBe(0)
    expect(getNextSegmentIndex(segments, 50)).toBe(0)
    expect(getPreviousSegmentIndex(segments, 130)).toBe(0)
    expect(resolveSegmentSequenceStartIndex(segments, 119)).toBe(1)
  })

  it('getPreviousSegmentIndex returns -1 when at first segment (triggers previous-video navigation)', () => {
    const segments = matchSegmentsToVideo(parseSegmentsCsv(csv), 'Testspiel.mp4')
    // Segment 0 starts at 90 s, ends at 100 s. currentTime=95 is inside segment 0.
    expect(getPreviousSegmentIndex(segments, 95)).toBe(-1)
  })

  it('getPreviousSegmentIndex returns -1 before any segment when no earlier segment exists', () => {
    const segments = matchSegmentsToVideo(parseSegmentsCsv(csv), 'Testspiel.mp4')
    // currentTime=50 is before segment 0 (start=90). No earlier segment → -1.
    expect(getPreviousSegmentIndex(segments, 50)).toBe(-1)
  })

  it('does NOT inherit title from previous row — empty title stays empty', () => {
    const inheritCsv = `videoname,start_minute,length_seconds,title,sub_title,audio
/tmp/videos/Video.mp4,1,10,Erstes Tor,Szene 1,1
/tmp/videos/Video.mp4,2,10,,Szene 2,1
/tmp/videos/Video.mp4,3,10,Zweites Tor,Szene 3,1
/tmp/videos/Video.mp4,4,10,,Szene 4,1`

    const segments = parseSegmentsCsv(inheritCsv)

    expect(segments[0].title).toBe('Erstes Tor')
    expect(segments[1].title).toBe('')
    expect(segments[2].title).toBe('Zweites Tor')
    expect(segments[3].title).toBe('')
  })

  it('does NOT auto-number subtitles — empty sub_title stays empty', () => {
    const numberCsv = `videoname,start_minute,length_seconds,title,sub_title,audio
/tmp/videos/VideoA.mp4,1,10,Titel,,1
/tmp/videos/VideoA.mp4,2,10,Titel,Explizit,1
/tmp/videos/VideoA.mp4,3,10,Titel,,1
/tmp/videos/VideoB.mp4,1,10,Titel,,1`

    const segments = parseSegmentsCsv(numberCsv)
    const videoA = segments.filter((s) => s.sourceVideoName === 'VideoA.mp4')
    const videoB = segments.filter((s) => s.sourceVideoName === 'VideoB.mp4')

    expect(videoA[0].subTitle).toBe('')
    expect(videoA[1].subTitle).toBe('Explizit')
    expect(videoA[2].subTitle).toBe('')
    expect(videoB[0].subTitle).toBe('')
  })

  describe('parseTimeInput', () => {
    it('parses MM:SS format', () => {
      expect(parseTimeInput('1:30')).toBe(90)
      expect(parseTimeInput('34:31')).toBe(2071)
      expect(parseTimeInput('0:00')).toBe(0)
    })

    it('parses H:MM:SS format', () => {
      expect(parseTimeInput('1:20:31')).toBe(4831)
      expect(parseTimeInput('0:01:30')).toBe(90)
    })

    it('parses zero-padded parts', () => {
      expect(parseTimeInput('01:30')).toBe(90)
      expect(parseTimeInput('01:20:31')).toBe(4831)
    })

    it('parses plain decimal number as seconds', () => {
      expect(parseTimeInput('90')).toBe(90)
      expect(parseTimeInput('90.5')).toBe(90.5)
      expect(parseTimeInput('0')).toBe(0)
    })

    it('accepts comma as decimal separator in seconds part', () => {
      expect(parseTimeInput('1:30,5')).toBe(90.5)
    })

    it('accepts comma as decimal separator in plain number', () => {
      expect(parseTimeInput('1,5')).toBe(1.5)
    })

    it('returns null for empty or whitespace input', () => {
      expect(parseTimeInput('')).toBeNull()
      expect(parseTimeInput('   ')).toBeNull()
    })

    it('returns null for invalid text', () => {
      expect(parseTimeInput('abc')).toBeNull()
      expect(parseTimeInput('1:2:3:4')).toBeNull()
    })

    it('returns null when seconds >= 60', () => {
      expect(parseTimeInput('1:60')).toBeNull()
      expect(parseTimeInput('1:20:60')).toBeNull()
    })

    it('returns null when minutes part is a decimal', () => {
      expect(parseTimeInput('1.5:30')).toBeNull()
    })

    it('returns null for negative values', () => {
      expect(parseTimeInput('-1')).toBeNull()
    })

    it('returns null when H:MM:SS has minutes >= 60', () => {
      expect(parseTimeInput('1:60:00')).toBeNull()
    })
  })
})

// ─── interpolateSegmentTitles ────────────────────────────────────────────────

const makeSegment = (id: string, title: string, subTitle = ''): ReturnType<typeof parseSegmentsCsv>[number] => ({
  id,
  sourceVideoName: 'test.mp4',
  sourceVideoPath: '/tmp/test.mp4',
  startSeconds: 0,
  endSeconds: 10,
  lengthSeconds: 10,
  title,
  subTitle,
  audioTrack: ''
})

describe('interpolateSegmentTitles', () => {
  it('returns segments unchanged when all titles are set', () => {
    const segments = [makeSegment('a', 'Szene 1'), makeSegment('b', 'Szene 2')]
    const result = interpolateSegmentTitles(segments)
    expect(result[0].title).toBe('Szene 1')
    expect(result[1].title).toBe('Szene 2')
  })

  it('fills empty title with the last non-empty title', () => {
    const segments = [
      makeSegment('a', 'Phase 1'),
      makeSegment('b', ''),
      makeSegment('c', ''),
      makeSegment('d', 'Phase 2'),
      makeSegment('e', '')
    ]
    const result = interpolateSegmentTitles(segments)
    expect(result[0].title).toBe('Phase 1')
    expect(result[1].title).toBe('Phase 1') // inherited
    expect(result[2].title).toBe('Phase 1') // inherited
    expect(result[3].title).toBe('Phase 2')
    expect(result[4].title).toBe('Phase 2') // inherited
  })

  it('assigns "Segment N" to leading empty titles when no previous title exists', () => {
    const segments = [makeSegment('a', ''), makeSegment('b', ''), makeSegment('c', 'Titel')]
    const result = interpolateSegmentTitles(segments)
    expect(result[0].title).toBe('Segment 1') // no predecessor → numbered
    expect(result[1].title).toBe('Segment 2') // no predecessor → numbered
    expect(result[2].title).toBe('Titel')
  })

  it('assigns "Segment N" (correct position) when only some segments lack a title', () => {
    const segments = [
      makeSegment('a', 'Angriff'),
      makeSegment('b', ''),
      makeSegment('c', 'Abwehr'),
      makeSegment('d', '')
    ]
    const result = interpolateSegmentTitles(segments)
    // b inherits 'Angriff', d inherits 'Abwehr' — no numbered fallback needed
    expect(result[1].title).toBe('Angriff')
    expect(result[3].title).toBe('Abwehr')
  })

  it('assigns "Segment N" with correct 1-based index when ALL titles are empty', () => {
    const segments = [makeSegment('a', ''), makeSegment('b', ''), makeSegment('c', '')]
    const result = interpolateSegmentTitles(segments)
    expect(result[0].title).toBe('Segment 1')
    expect(result[1].title).toBe('Segment 2')
    expect(result[2].title).toBe('Segment 3')
  })

  it('does not mutate the original segments', () => {
    const segments = [makeSegment('a', 'Original'), makeSegment('b', '')]
    interpolateSegmentTitles(segments)
    expect(segments[1].title).toBe('')
  })

  it('returns empty array for empty input', () => {
    expect(interpolateSegmentTitles([])).toEqual([])
  })

  it('assigns "Segment N" to empty subTitle — no inheritance', () => {
    const segments = [
      makeSegment('a', 'Angriff', 'Szene 1'),
      makeSegment('b', '', ''),
      makeSegment('c', '', ''),
    ]
    const result = interpolateSegmentTitles(segments)
    expect(result[0].subTitle).toBe('Szene 1') // explicit — kept
    expect(result[1].subTitle).toBe('Segment 2') // empty — numbered, NOT inherited
    expect(result[2].subTitle).toBe('Segment 3') // empty — numbered, NOT inherited
  })

  it('assigns "Segment N" to all subTitles when none are set', () => {
    const segments = [makeSegment('a', 'A'), makeSegment('b', 'B'), makeSegment('c', 'C')]
    const result = interpolateSegmentTitles(segments)
    expect(result[0].subTitle).toBe('Segment 1')
    expect(result[1].subTitle).toBe('Segment 2')
    expect(result[2].subTitle).toBe('Segment 3')
  })

  it('keeps explicit subTitle and numbers the rest independently', () => {
    const segments = [
      makeSegment('a', '', ''),
      makeSegment('b', '', 'Explizit'),
      makeSegment('c', '', ''),
    ]
    const result = interpolateSegmentTitles(segments)
    expect(result[0].subTitle).toBe('Segment 1')
    expect(result[1].subTitle).toBe('Explizit')
    expect(result[2].subTitle).toBe('Segment 3')
  })
})
