import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Segment, VideoFileDescriptor } from '../../../../common/types'
import { SegmentEditor } from './SegmentEditor'

const makeVideo = (name: string, dir = '/v'): VideoFileDescriptor => ({
  path: `${dir}/${name}`,
  fileName: name,
  fileUrl: `file://${dir}/${name}`,
  playbackMode: 'direct'
})

const makeSegment = (overrides: Partial<Segment> = {}): Segment => ({
  id: 'test-seg',
  sourceVideoName: 'vid1.mp4',
  sourceVideoPath: '/v/vid1.mp4',
  startSeconds: 90,
  endSeconds: 120,
  lengthSeconds: 30,
  title: 'Test',
  subTitle: 'Sub',
  audioTrack: '1',
  ...overrides
})

const vid1 = makeVideo('vid1.mp4')
const vid2 = makeVideo('vid2.mp4')
const twoVideos = [vid1, vid2]
const oneVideo = [vid1]

function getDataRows() {
  const rows = screen.getAllByRole('row')
  return rows.slice(1) // skip header row
}

function getTextInputs(row: HTMLElement) {
  return within(row).getAllByRole('textbox')
  // order per row: [startTimeInput, endTimeInput, title, subTitle]
}

describe('SegmentEditor', () => {
  let onLoad: ReturnType<typeof vi.fn>
  let saveCsvFile: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onLoad = vi.fn()
    saveCsvFile = vi.fn().mockResolvedValue(true)
    window.desktopApi = {
      ...window.desktopApi,
      saveCsvFile
    } as typeof window.desktopApi
  })

  describe('column headers', () => {
    it('shows Startzeit and Ende as column headers', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      expect(screen.getByText('Startzeit')).toBeInTheDocument()
      expect(screen.getByText('Ende')).toBeInTheDocument()
    })
  })

  describe('loading segments', () => {
    it('displays segment times in H:MM:SS format', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[makeSegment({ startSeconds: 90, lengthSeconds: 30 })]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      // startSeconds=90 → "01:30", endSeconds=120 → "02:00"
      expect(screen.getByDisplayValue('01:30')).toBeInTheDocument()
      expect(screen.getByDisplayValue('02:00')).toBeInTheDocument()
    })

    it('displays segments in loaded order, not sorted by time', () => {
      const segments = [
        makeSegment({ id: 'a', startSeconds: 300, endSeconds: 360, lengthSeconds: 60 }),
        makeSegment({ id: 'b', startSeconds: 90, endSeconds: 120, lengthSeconds: 30 })
      ]
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={segments}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      const [firstRow, secondRow] = getDataRows()
      // First segment (startSeconds=300) should be first
      expect(within(firstRow).getByDisplayValue('05:00')).toBeInTheDocument()
      expect(within(secondRow).getByDisplayValue('01:30')).toBeInTheDocument()
    })

    it('does not inherit title from previous row — empty title stays empty', () => {
      const segments = [
        makeSegment({ id: 'a', title: 'Tor' }),
        makeSegment({ id: 'b', title: '' })
      ]
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={segments}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      const [, secondRow] = getDataRows()
      const inputs = getTextInputs(secondRow)
      expect(inputs[2]).toHaveValue('') // title input is empty, NOT 'Tor'
    })

    it('does not auto-number empty subTitle — empty sub_title stays empty', () => {
      const segments = [makeSegment({ subTitle: '' })]
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={segments}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      const [row] = getDataRows()
      const inputs = getTextInputs(row)
      expect(inputs[3]).toHaveValue('') // subTitle input is empty, NOT 'Segment 1'
    })
  })

  describe('video dropdown', () => {
    it('no extra option when segment path matches loaded video by filename', () => {
      const segWithOldPath = makeSegment({
        sourceVideoPath: '/old/path/vid1.mp4',
        sourceVideoName: 'vid1.mp4'
      })
      render(
        <SegmentEditor
          videos={twoVideos}
          initialSegments={[segWithOldPath]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      const select = screen.getByRole('combobox')
      const options = within(select).getAllByRole('option')
      // Should only show the 2 loaded videos, no extra option for the old path
      expect(options).toHaveLength(2)
      expect(select).toHaveValue('/v/vid1.mp4') // matched by filename to current video path
    })
  })

  describe('setCurrentTimeAsStart', () => {
    it('sets startTimeInput to formatted clock time of current position', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[makeSegment()]}
          getCurrentTime={() => 90}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      fireEvent.click(screen.getByTitle('Aktuelle Videoposition als Startzeit übernehmen'))
      expect(screen.getByDisplayValue('01:30')).toBeInTheDocument()
    })
  })

  describe('validation', () => {
    it('marks row as invalid when end time is not after start time', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      const [row] = getDataRows()
      const inputs = getTextInputs(row)
      fireEvent.change(inputs[0], { target: { value: '02:00' } })
      fireEvent.change(inputs[1], { target: { value: '01:30' } }) // end < start
      expect(row.className).toContain('invalid')
    })

    it('row is valid when end time is after start time', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      const [row] = getDataRows()
      const inputs = getTextInputs(row)
      fireEvent.change(inputs[0], { target: { value: '01:30' } })
      fireEvent.change(inputs[1], { target: { value: '02:00' } })
      expect(row.className).not.toContain('invalid')
    })

    it('accepts H:MM:SS format', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      const [row] = getDataRows()
      const inputs = getTextInputs(row)
      fireEvent.change(inputs[0], { target: { value: '1:20:31' } }) // 4831s
      fireEvent.change(inputs[1], { target: { value: '1:21:01' } }) // 4861s
      expect(row.className).not.toContain('invalid')
    })
  })

  describe('load segments', () => {
    it('calls onLoad with correct startSeconds and lengthSeconds', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      const [row] = getDataRows()
      const inputs = getTextInputs(row)
      fireEvent.change(inputs[0], { target: { value: '01:30' } }) // 90s
      fireEvent.change(inputs[1], { target: { value: '02:00' } }) // 120s
      fireEvent.click(screen.getByText('Laden'))
      expect(onLoad).toHaveBeenCalledWith([
        expect.objectContaining({ startSeconds: 90, endSeconds: 120, lengthSeconds: 30 })
      ])
    })

    it('loads segments in the order they appear in the editor, not sorted by time', () => {
      const segments = [
        makeSegment({ id: 'a', startSeconds: 300, endSeconds: 360, lengthSeconds: 60, title: 'Später' }),
        makeSegment({ id: 'b', startSeconds: 90, endSeconds: 120, lengthSeconds: 30, title: 'Früher' })
      ]
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={segments}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      fireEvent.click(screen.getByText('Laden'))
      expect(onLoad).toHaveBeenCalledWith([
        expect.objectContaining({ startSeconds: 300 }), // first in list
        expect.objectContaining({ startSeconds: 90 })   // second in list
      ])
    })
  })

  describe('CSV export', () => {
    it('exports with decimal start_minute, not H:MM:SS format', async () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      const [row] = getDataRows()
      const inputs = getTextInputs(row)
      fireEvent.change(inputs[0], { target: { value: '01:30' } }) // 90s → 1.5 min
      fireEvent.change(inputs[1], { target: { value: '02:00' } }) // 120s → 2.0 min
      fireEvent.click(screen.getByText('CSV exportieren'))
      await waitFor(() => expect(saveCsvFile).toHaveBeenCalled())
      const csv: string = saveCsvFile.mock.calls[0][0]
      expect(csv).toContain('1.5') // start_minute is decimal
      expect(csv).toContain('30')  // length_seconds = 120-90 = 30
      expect(csv).not.toMatch(/01:30/) // no time format in export
    })
  })

  describe('row management', () => {
    it('adds a new row when clicking "+ Zeile hinzufügen"', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={() => {}}
          onClose={() => {}}
        />
      )
      expect(getDataRows()).toHaveLength(1)
      fireEvent.click(screen.getByText('+ Zeile hinzufügen'))
      expect(getDataRows()).toHaveLength(2)
    })

    it('removes a row when clicking the delete button', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[makeSegment({ id: 'a' }), makeSegment({ id: 'b' })]}
          getCurrentTime={() => 0}
          onLoad={() => {}}
          onClose={() => {}}
        />
      )
      expect(getDataRows()).toHaveLength(2)
      fireEvent.click(screen.getAllByTitle('Zeile löschen')[0])
      expect(getDataRows()).toHaveLength(1)
    })

    it('moves a row up when clicking the up button', () => {
      const segments = [
        makeSegment({ id: 'a', title: 'Erster' }),
        makeSegment({ id: 'b', title: 'Zweiter' })
      ]
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={segments}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )
      fireEvent.click(screen.getAllByTitle('Nach oben')[1]) // move second row up
      const rows = getDataRows()
      expect(within(rows[0]).getByDisplayValue('Zweiter')).toBeInTheDocument()
      expect(within(rows[1]).getByDisplayValue('Erster')).toBeInTheDocument()
    })
  })
})
