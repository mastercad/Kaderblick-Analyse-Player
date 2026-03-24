import {
  findActiveSegmentIndex,
  getBaseName,
  getNextSegmentIndex,
  getPreviousSegmentIndex,
  matchSegmentsToVideo,
  parseSegmentsCsv,
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

  it('parses and sorts segments from CSV', () => {
    const segments = parseSegmentsCsv(csv)

    expect(segments).toHaveLength(3)
    expect(segments[0].startSeconds).toBe(90)
    expect(segments[1].startSeconds).toBe(120)
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
})
