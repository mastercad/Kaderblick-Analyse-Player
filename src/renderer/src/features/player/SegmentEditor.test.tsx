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
    it('shows Startzeit and Ende as segment column headers', () => {
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

  describe('video match settings', () => {
    it('shows compact time-range fields and keeps the explanation collapsed', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      expect(screen.getByRole('textbox', { name: 'Anstoß oder Wiederbeginn im Video für Spielabschnitt 1 von vid1.mp4' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Spieluhr startet bei für Spielabschnitt 1 von vid1.mp4' })).toBeInTheDocument()
      expect(screen.getByRole('textbox', { name: 'Dauer des Spielabschnitts 1 von vid1.mp4' })).toBeInTheDocument()
      expect(screen.getByText('Kurze Anleitung').closest('details')).not.toHaveAttribute('open')
      const openVideoSettings = screen.getByRole('textbox', { name: 'Anstoß oder Wiederbeginn im Video für Spielabschnitt 1 von vid1.mp4' }).closest('details')
      expect(openVideoSettings).toHaveAttribute('open')
      fireEvent.click(openVideoSettings!.querySelector('summary')!)
      expect(openVideoSettings).not.toHaveAttribute('open')
      expect(screen.getByText('↕ Kopfzeile ziehen, um das Fenster zu verschieben')).toBeInTheDocument()
    })

    it('saves a clip range and its corresponding video position without requiring a segment', () => {
      const onVideoSettingsChange = vi.fn()
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onVideoSettingsChange={onVideoSettingsChange}
          onClose={() => {}}
        />
      )

      fireEvent.change(screen.getByRole('textbox', { name: 'Spieluhr startet bei für Spielabschnitt 1 von vid1.mp4' }), { target: { value: '63:40' } })
      fireEvent.change(screen.getByRole('textbox', { name: 'Dauer des Spielabschnitts 1 von vid1.mp4' }), { target: { value: '04:40' } })
      fireEvent.change(screen.getByRole('textbox', { name: 'Anstoß oder Wiederbeginn im Video für Spielabschnitt 1 von vid1.mp4' }), { target: { value: '00:12' } })

      expect(onVideoSettingsChange).toHaveBeenLastCalledWith([
        expect.objectContaining({
          matchTimeStartSeconds: 63 * 60 + 40,
          matchTimeEndSeconds: 68 * 60 + 20,
          videoTimeStartSeconds: 12,
          kickoffVideoSeconds: 12,
          matchDurationSeconds: 4 * 60 + 40
        })
      ])
    })

    it('can take the current player position as the video start', () => {
      const onVideoSettingsChange = vi.fn()
      render(
        <SegmentEditor
          videos={oneVideo}
          activeVideoPath={oneVideo[0].path}
          initialSegments={[]}
          getCurrentTime={() => 37}
          onLoad={onLoad}
          onVideoSettingsChange={onVideoSettingsChange}
          onClose={() => {}}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Aktuelle Videoposition einsetzen für Spielabschnitt 1 von vid1.mp4' }))

      expect(screen.getByRole('textbox', { name: 'Anstoß oder Wiederbeginn im Video für Spielabschnitt 1 von vid1.mp4' })).toHaveValue('00:37')
      expect(onVideoSettingsChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ videoTimeStartSeconds: 37 })
      ])
    })

    it('shows the computed result for a normal 45-minute half', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          activeVideoPath={oneVideo[0].path}
          initialSegments={[]}
          getCurrentTime={() => 3 * 60 + 10}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Aktuelle Videoposition einsetzen für Spielabschnitt 1 von vid1.mp4' }))

      expect(screen.getByText('Ergebnis: Im Video 03:10–48:10 läuft die Spieluhr von 00:00 bis 45:00.')).toBeInTheDocument()
    })

    it('fills the game-clock start for the second-half template', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: '2. Halbzeit' }))

      expect(screen.getByRole('textbox', { name: 'Spieluhr startet bei für Spielabschnitt 1 von vid1.mp4' })).toHaveValue('45:00')
      expect(screen.getByText('Ergebnis: Im Video 00:00–45:00 läuft die Spieluhr von 45:00 bis 90:00.')).toBeInTheDocument()
    })

    it('stores separate ranges before and after a video pause', () => {
      const onVideoSettingsChange = vi.fn()
      render(
        <SegmentEditor
          videos={oneVideo}
          activeVideoPath={oneVideo[0].path}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onVideoSettingsChange={onVideoSettingsChange}
          onClose={() => {}}
        />
      )

      fireEvent.change(screen.getByRole('textbox', { name: 'Anstoß oder Wiederbeginn im Video für Spielabschnitt 1 von vid1.mp4' }), { target: { value: '02:10' } })
      fireEvent.click(screen.getByRole('button', { name: 'Weiteren Spielabschnitt hinzufügen' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Anstoß oder Wiederbeginn im Video für Spielabschnitt 2 von vid1.mp4' }), { target: { value: '58:30' } })

      expect(onVideoSettingsChange).toHaveBeenLastCalledWith([
        expect.objectContaining({
          matchTimeRanges: [
            expect.objectContaining({ videoStartSeconds: 2 * 60 + 10, videoEndSeconds: 47 * 60 + 10, matchStartSeconds: 0, matchEndSeconds: 45 * 60 }),
            expect.objectContaining({ videoStartSeconds: 58 * 60 + 30, videoEndSeconds: 103 * 60 + 30, matchStartSeconds: 45 * 60, matchEndSeconds: 90 * 60 })
          ]
        })
      ])
    })

    it('keeps time ranges independent while grouping clips from different matches', () => {
      const onVideoSettingsChange = vi.fn()
      const videos = [
        makeVideo('spiel1-hz1.mp4'),
        makeVideo('spiel1-hz2.mp4'),
        makeVideo('spiel2-hz1.mp4')
      ]
      render(
        <SegmentEditor
          videos={videos}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onVideoSettingsChange={onVideoSettingsChange}
          onClose={() => {}}
        />
      )

      const firstVideoSettings = screen.getByRole('textbox', { name: 'Anstoß oder Wiederbeginn im Video für Spielabschnitt 1 von spiel1-hz1.mp4' }).closest('details')!
      fireEvent.click(within(firstVideoSettings).getByRole('button', { name: '1. Halbzeit' }))
      fireEvent.change(screen.getByRole('textbox', { name: 'Spiel für spiel1-hz1.mp4' }), { target: { value: 'Spiel 1' } })
      fireEvent.change(screen.getByRole('textbox', { name: 'Spiel für spiel1-hz2.mp4' }), { target: { value: 'Spiel 1' } })
      fireEvent.change(screen.getByRole('textbox', { name: 'Spieluhr startet bei für Spielabschnitt 1 von spiel1-hz2.mp4' }), { target: { value: '45:00' } })
      fireEvent.change(screen.getByRole('textbox', { name: 'Spiel für spiel2-hz1.mp4' }), { target: { value: 'Spiel 2' } })
      fireEvent.change(screen.getByRole('textbox', { name: 'Spieluhr startet bei für Spielabschnitt 1 von spiel2-hz1.mp4' }), { target: { value: '12:00' } })
      fireEvent.change(screen.getByRole('textbox', { name: 'Dauer des Spielabschnitts 1 von spiel2-hz1.mp4' }), { target: { value: '06:00' } })

      expect(onVideoSettingsChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ matchGroupId: 'Spiel 1', matchTimeStartSeconds: 0, matchTimeEndSeconds: 45 * 60 }),
        expect.objectContaining({ matchGroupId: 'Spiel 1', matchTimeStartSeconds: 45 * 60, matchTimeEndSeconds: 90 * 60 }),
        expect.objectContaining({ matchGroupId: 'Spiel 2', matchTimeStartSeconds: 12 * 60, matchTimeEndSeconds: 18 * 60 })
      ])
    })

    it('does not assign a default first half to untouched videos', () => {
      const onVideoSettingsChange = vi.fn()
      render(
        <SegmentEditor
          videos={twoVideos}
          activeVideoPath={vid1.path}
          initialSegments={[]}
          getCurrentTime={() => 4 * 60 + 14}
          onLoad={onLoad}
          onVideoSettingsChange={onVideoSettingsChange}
          onClose={() => {}}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Aktuelle Videoposition einsetzen für Spielabschnitt 1 von vid1.mp4' }))

      const updatedVideos = onVideoSettingsChange.mock.lastCall![0] as VideoFileDescriptor[]
      expect(updatedVideos[0]).toEqual(expect.objectContaining({
        matchTimeStartSeconds: 0,
        matchTimeEndSeconds: 45 * 60,
        videoTimeStartSeconds: 4 * 60 + 14
      }))
      expect(updatedVideos[1]).toEqual(vid2)
      expect(updatedVideos[1]).not.toHaveProperty('matchTimeRanges')
    })

    it('saves a valid video even while another video has an invalid unfinished value', () => {
      const onVideoSettingsChange = vi.fn()
      const configuredVideos = twoVideos.map((video) => ({
        ...video,
        matchTimeRanges: [{
          id: video.path,
          matchStartSeconds: 0,
          matchEndSeconds: 45 * 60,
          videoStartSeconds: 60,
          videoEndSeconds: 46 * 60
        }]
      }))
      render(
        <SegmentEditor
          videos={configuredVideos}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onVideoSettingsChange={onVideoSettingsChange}
          onClose={() => {}}
        />
      )

      fireEvent.change(screen.getByRole('textbox', { name: 'Dauer des Spielabschnitts 1 von vid1.mp4' }), { target: { value: '' } })
      fireEvent.click(screen.getAllByRole('button', { name: '2. Halbzeit' })[1])

      const updatedVideos = onVideoSettingsChange.mock.lastCall![0] as VideoFileDescriptor[]
      expect(updatedVideos[0].matchTimeRanges).toEqual(configuredVideos[0].matchTimeRanges)
      expect(updatedVideos[1].matchTimeRanges).toEqual([
        expect.objectContaining({ matchStartSeconds: 45 * 60, matchEndSeconds: 90 * 60 })
      ])
    })

    it('can remove an incorrectly assigned time mapping completely', () => {
      const onVideoSettingsChange = vi.fn()
      const configuredVideo: VideoFileDescriptor = {
        ...vid1,
        matchHalf: 1,
        kickoffVideoSeconds: 0,
        matchDurationSeconds: 45 * 60,
        matchTimeStartSeconds: 0,
        matchTimeEndSeconds: 45 * 60,
        videoTimeStartSeconds: 0,
        matchTimeRanges: [{ id: 'first', matchStartSeconds: 0, matchEndSeconds: 45 * 60, videoStartSeconds: 0, videoEndSeconds: 45 * 60 }]
      }
      render(
        <SegmentEditor
          videos={[configuredVideo]}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onVideoSettingsChange={onVideoSettingsChange}
          onClose={() => {}}
        />
      )

      fireEvent.click(screen.getByRole('button', { name: 'Spielzeit-Zuordnung entfernen' }))

      const updatedVideo = (onVideoSettingsChange.mock.lastCall![0] as VideoFileDescriptor[])[0]
      expect(updatedVideo).not.toHaveProperty('matchTimeRanges')
      expect(updatedVideo).not.toHaveProperty('matchTimeStartSeconds')
      expect(updatedVideo).not.toHaveProperty('matchHalf')
      expect(screen.getByText('Noch nicht eingerichtet')).toBeInTheDocument()
    })
  })

  describe('window movement', () => {
    it('moves the editor by dragging its header', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      const dialog = screen.getByRole('dialog').querySelector('.segment-editor') as HTMLDivElement
      const header = dialog.querySelector('.segment-editor__header') as HTMLDivElement
      header.setPointerCapture = vi.fn()
      header.releasePointerCapture = vi.fn()

      fireEvent.pointerDown(header, { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
      fireEvent.pointerMove(header, { pointerId: 1, clientX: 160, clientY: 50 })
      fireEvent.pointerUp(header, { pointerId: 1, clientX: 160, clientY: 50 })

      expect(dialog).toHaveStyle({ transform: 'translate(60px, -50px)' })
    })
  })

  describe('loading segments', () => {
    it('displays segment start and end times in minute format', () => {
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

    it('keeps absolute minutes above 60 unchanged instead of converting them to hours', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[makeSegment({ startSeconds: 63 * 60 + 30, endSeconds: 64 * 60 + 45, lengthSeconds: 75 })]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      expect(screen.getByDisplayValue('63:30')).toBeInTheDocument()
      expect(screen.getByDisplayValue('64:45')).toBeInTheDocument()
      expect(screen.queryByDisplayValue('01:03:30')).not.toBeInTheDocument()
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

  describe('draft persistence', () => {
    it('recovers a hot-reloaded draft from the briefly used length field without crashing', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          initialDrafts={[{
            draftId: 'hot-reload-draft', videoPath: vid1.path, startTimeInput: '10:00', lengthTimeInput: '01:00',
            title: '', subTitle: '', audioEnabled: true
          } as unknown as SegmentEditorDraft]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      expect(screen.getByDisplayValue('10:00')).toBeInTheDocument()
      expect(screen.getByDisplayValue('11:00')).toBeInTheDocument()
    })

    it('reports the latest row values when the editor is closed', async () => {
      const onDraftsChange = vi.fn()
      const onClose = vi.fn()
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onDraftsChange={onDraftsChange}
          onClose={onClose}
        />
      )

      const [row] = getDataRows()
      const inputs = getTextInputs(row)
      fireEvent.change(inputs[0], { target: { value: '12:34' } })
      fireEvent.click(screen.getByText('Schließen'))

      expect(onClose).toHaveBeenCalledOnce()
      expect(onDraftsChange).toHaveBeenLastCalledWith([
        expect.objectContaining({ startTimeInput: '12:34' })
      ])
    })

    it('restores a previously saved incomplete row draft', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          initialDrafts={[{
            draftId: 'saved-draft',
            videoPath: vid1.path,
            startTimeInput: '12:34',
            endTimeInput: '',
            title: 'Noch nicht fertig',
            subTitle: '',
            audioEnabled: true
          }]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      expect(screen.getByDisplayValue('12:34')).toBeInTheDocument()
      expect(screen.getByDisplayValue('Noch nicht fertig')).toBeInTheDocument()
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
      const select = screen.getByRole('combobox', { name: 'Video für Segment 1' })
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

  describe('duration summary', () => {
    it('shows segment durations per video and as a total', () => {
      render(
        <SegmentEditor
          videos={twoVideos}
          initialSegments={[
            makeSegment({ id: 'a', sourceVideoName: vid1.fileName, sourceVideoPath: vid1.path, startSeconds: 60, endSeconds: 90, lengthSeconds: 30 }),
            makeSegment({ id: 'b', sourceVideoName: vid1.fileName, sourceVideoPath: vid1.path, startSeconds: 120, endSeconds: 165, lengthSeconds: 45 }),
            makeSegment({ id: 'c', sourceVideoName: vid2.fileName, sourceVideoPath: vid2.path, startSeconds: 10, endSeconds: 30, lengthSeconds: 20 })
          ]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      const summary = screen.getByRole('region', { name: 'Summierte Segmentdauer' })
      expect(within(summary).getByText('vid1.mp4')).toBeInTheDocument()
      expect(within(summary).getByText('01:15')).toBeInTheDocument()
      expect(within(summary).getByText('vid2.mp4')).toBeInTheDocument()
      expect(within(summary).getByText('00:20')).toBeInTheDocument()
      expect(within(summary).getByLabelText('Gesamtdauer 01:35')).toBeInTheDocument()
    })

    it('does not include incomplete rows in the duration summary', () => {
      render(
        <SegmentEditor
          videos={oneVideo}
          initialSegments={[]}
          initialDrafts={[
            {
              draftId: 'valid', videoPath: vid1.path, startTimeInput: '01:00', endTimeInput: '01:30',
              title: '', subTitle: '', audioEnabled: true
            },
            {
              draftId: 'incomplete', videoPath: vid1.path, startTimeInput: '02:00', endTimeInput: '',
              title: '', subTitle: '', audioEnabled: true
            }
          ]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      expect(screen.getByLabelText('Gesamtdauer 00:30')).toBeInTheDocument()
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

    it('keeps entered times unchanged for a segment assigned to the second video', () => {
      const firstHalf = {
        ...makeVideo('first.mp4'),
        durationSeconds: 55 * 60,
        matchGroupId: 'Spiel 1',
        matchHalf: 1 as const,
        kickoffVideoSeconds: 2 * 60,
        matchDurationSeconds: 45 * 60
      }
      const secondHalf = {
        ...makeVideo('second.mp4'),
        durationSeconds: 50 * 60,
        matchGroupId: 'Spiel 1',
        matchHalf: 2 as const,
        kickoffVideoSeconds: 3 * 60,
        matchDurationSeconds: 45 * 60
      }
      render(
        <SegmentEditor
          videos={[firstHalf, secondHalf]}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      const [row] = getDataRows()
      fireEvent.change(within(row).getByRole('combobox', { name: 'Video für Segment 1' }), { target: { value: secondHalf.path } })
      const inputs = getTextInputs(row)
      fireEvent.change(inputs[0], { target: { value: '54:45' } })
      fireEvent.change(inputs[1], { target: { value: '55:45' } })
      fireEvent.click(screen.getByText('Laden'))

      expect(onLoad).toHaveBeenCalledWith([
        expect.objectContaining({
          sourceVideoPath: secondHalf.path,
          startSeconds: 54 * 60 + 45,
          endSeconds: 55 * 60 + 45,
          lengthSeconds: 60
        })
      ])
    })

    it('stores minute 65 unchanged on the selected second video', () => {
      const firstHalf = {
        ...makeVideo('first.mp4'), durationSeconds: 55 * 60, matchGroupId: 'Spiel 1',
        matchHalf: 1 as const, kickoffVideoSeconds: 2 * 60, matchDurationSeconds: 45 * 60
      }
      const secondHalf = {
        ...makeVideo('second.mp4'), durationSeconds: 50 * 60, matchGroupId: 'Spiel 1',
        matchHalf: 2 as const, kickoffVideoSeconds: 3 * 60, matchDurationSeconds: 45 * 60
      }
      render(
        <SegmentEditor
          videos={[firstHalf, secondHalf]}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      const [row] = getDataRows()
      fireEvent.change(within(row).getByRole('combobox', { name: 'Video für Segment 1' }), { target: { value: secondHalf.path } })
      const inputs = getTextInputs(row)
      fireEvent.change(inputs[0], { target: { value: '65:00' } })
      fireEvent.change(inputs[1], { target: { value: '66:00' } })
      fireEvent.click(screen.getByText('Laden'))

      expect(onLoad).toHaveBeenCalledWith([
        expect.objectContaining({ sourceVideoPath: secondHalf.path, startSeconds: 65 * 60, endSeconds: 66 * 60 })
      ])
    })

    it('does not validate fixed segment times against another video or its duration', () => {
      const firstVideo = { ...makeVideo('first.mp4'), durationSeconds: 55 * 60 }
      const secondVideo = { ...makeVideo('second.mp4'), durationSeconds: 50 * 60 }
      render(
        <SegmentEditor
          videos={[firstVideo, secondVideo]}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      const [row] = getDataRows()
      fireEvent.change(within(row).getByRole('combobox', { name: 'Video für Segment 1' }), { target: { value: secondVideo.path } })
      const inputs = getTextInputs(row)
      fireEvent.change(inputs[0], { target: { value: '20:00' } })
      fireEvent.change(inputs[1], { target: { value: '21:00' } })

      expect(row.className).not.toContain('invalid')
      fireEvent.click(screen.getByText('Laden'))
      expect(onLoad).toHaveBeenCalledWith([
        expect.objectContaining({ sourceVideoPath: secondVideo.path, startSeconds: 20 * 60, endSeconds: 21 * 60 })
      ])
    })

    it('does not subtract durations of preceding videos', () => {
      const firstVideo = { ...makeVideo('first.mp4'), durationSeconds: 55 * 60 }
      const secondVideo = { ...makeVideo('second.mp4'), durationSeconds: 50 * 60 }
      render(
        <SegmentEditor
          videos={[firstVideo, secondVideo]}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      const [row] = getDataRows()
      fireEvent.change(within(row).getByRole('combobox', { name: 'Video für Segment 1' }), { target: { value: secondVideo.path } })
      const inputs = getTextInputs(row)
      fireEvent.change(inputs[0], { target: { value: '60:00' } })
      fireEvent.change(inputs[1], { target: { value: '61:00' } })
      fireEvent.click(screen.getByText('Laden'))

      expect(onLoad).toHaveBeenCalledWith([
        expect.objectContaining({
          sourceVideoPath: secondVideo.path,
          startSeconds: 60 * 60,
          endSeconds: 61 * 60,
          lengthSeconds: 60
        })
      ])
    })

    it('has no time conversion control and displays stored segment times unchanged', () => {
      const secondHalf = {
        ...makeVideo('second.mp4'),
        durationSeconds: 50 * 60,
        matchGroupId: 'Spiel 1',
        matchHalf: 2 as const,
        kickoffVideoSeconds: 3 * 60,
        matchDurationSeconds: 45 * 60
      }
      render(
        <SegmentEditor
          videos={[secondHalf]}
          initialSegments={[makeSegment({
            sourceVideoName: secondHalf.fileName,
            sourceVideoPath: secondHalf.path,
            startSeconds: 12 * 60 + 45,
            endSeconds: 13 * 60 + 45,
            lengthSeconds: 60
          })]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      expect(screen.queryByRole('combobox', { name: 'Zeitformat der Segment-Eingaben' })).not.toBeInTheDocument()
      expect(screen.getByDisplayValue('12:45')).toBeInTheDocument()
      expect(screen.getByDisplayValue('13:45')).toBeInTheDocument()
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

    it('exports fixed times unchanged with the selected video', async () => {
      const firstHalf = {
        ...makeVideo('first.mp4'), durationSeconds: 55 * 60, matchGroupId: 'Spiel 1',
        matchHalf: 1 as const, kickoffVideoSeconds: 2 * 60, matchDurationSeconds: 45 * 60
      }
      const secondHalf = {
        ...makeVideo('second.mp4'), durationSeconds: 50 * 60, matchGroupId: 'Spiel 1',
        matchHalf: 2 as const, kickoffVideoSeconds: 3 * 60, matchDurationSeconds: 45 * 60
      }
      render(
        <SegmentEditor
          videos={[firstHalf, secondHalf]}
          initialSegments={[]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      const [row] = getDataRows()
      fireEvent.change(within(row).getByRole('combobox', { name: 'Video für Segment 1' }), { target: { value: secondHalf.path } })
      const inputs = getTextInputs(row)
      fireEvent.change(inputs[0], { target: { value: '65:00' } })
      fireEvent.change(inputs[1], { target: { value: '66:00' } })
      fireEvent.click(screen.getByText('CSV exportieren'))

      await waitFor(() => expect(saveCsvFile).toHaveBeenCalled())
      const csv: string = saveCsvFile.mock.calls[0][0]
      expect(csv).toContain('/v/second.mp4')
      expect(csv).toContain(',65,60,')
      expect(csv).not.toContain('/v/first.mp4')
    })

    it('does not rewrite segment input fields when the video time mapping changes', () => {
      render(
        <SegmentEditor
          videos={[{ ...vid1, matchHalf: 1, kickoffVideoSeconds: 60, matchDurationSeconds: 45 * 60 }]}
          initialSegments={[]}
          initialDrafts={[{
            draftId: 'segment', videoPath: vid1.path, startTimeInput: '10:00', endTimeInput: '11:00',
            title: '', subTitle: '', audioEnabled: true
          }]}
          getCurrentTime={() => 0}
          onLoad={onLoad}
          onClose={() => {}}
        />
      )

      fireEvent.change(screen.getByRole('textbox', { name: 'Anstoß oder Wiederbeginn im Video für Spielabschnitt 1 von vid1.mp4' }), { target: { value: '02:00' } })

      expect(screen.getByDisplayValue('10:00')).toBeInTheDocument()
      expect(screen.getByDisplayValue('11:00')).toBeInTheDocument()
      fireEvent.click(screen.getByText('Laden'))
      expect(onLoad).toHaveBeenCalledWith([
        expect.objectContaining({ sourceVideoPath: vid1.path, startSeconds: 10 * 60, endSeconds: 11 * 60 })
      ])
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
