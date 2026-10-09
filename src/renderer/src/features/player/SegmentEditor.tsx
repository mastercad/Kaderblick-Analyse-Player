import { useCallback, useEffect, useRef, useState } from 'react'
import { findLoadedVideoForSegment, getBaseName, parseTimeInput, serializeSegmentsToCsv } from '../../../../common/segmentUtils'
import { getMatchVideoTimeRanges } from '../../../../common/matchTimeUtils'
import { formatClockTime, formatSegmentTime } from '../../../../common/timeUtils'
import type { Segment, SegmentEditorDraft, VideoFileDescriptor } from '../../../../common/types'

interface SegmentEditorProps {
  videos: VideoFileDescriptor[]
  activeVideoPath?: string
  initialSegments: Segment[]
  initialDrafts?: SegmentEditorDraft[]
  getCurrentTime: () => number
  onLoad: (segments: Segment[]) => void
  onDraftsChange?: (drafts: SegmentEditorDraft[]) => void
  onVideoSettingsChange?: (videos: VideoFileDescriptor[]) => void
  onClose: () => void
}

const newDraftId = (() => {
  let counter = 0
  return () => `draft-${Date.now()}-${++counter}`
})()

const newTimeRangeId = (() => {
  let counter = 0
  return () => `time-range-${Date.now()}-${++counter}`
})()

interface VideoTimeRangeSetting {
  id: string
  matchStartInput: string
  videoStartInput: string
  durationInput: string
}

interface VideoSetting {
  path: string
  matchGroupInput: string
  configured: boolean
  ranges: VideoTimeRangeSetting[]
}

const clearVideoMatchTimeMapping = (video: VideoFileDescriptor, matchGroupInput: string): VideoFileDescriptor => {
  const nextVideo: VideoFileDescriptor = {
    ...video,
    matchGroupId: matchGroupInput.trim() || undefined
  }
  delete nextVideo.matchHalf
  delete nextVideo.kickoffVideoSeconds
  delete nextVideo.matchDurationSeconds
  delete nextVideo.matchTimeStartSeconds
  delete nextVideo.matchTimeEndSeconds
  delete nextVideo.videoTimeStartSeconds
  delete nextVideo.matchTimeRanges
  return nextVideo
}

const segmentToDraft = (segment: Segment, videos: VideoFileDescriptor[]): SegmentEditorDraft => {
  const matchedVideo = findLoadedVideoForSegment(segment, videos)
  return {
    draftId: newDraftId(),
    videoPath: matchedVideo?.path ?? segment.sourceVideoPath,
    startTimeInput: formatSegmentTime(segment.startSeconds),
    endTimeInput: formatSegmentTime(segment.endSeconds),
    title: segment.title,
    subTitle: segment.subTitle,
    audioEnabled: segment.audioTrack === '1'
  }
}

const makeDraft = (videoPath: string): SegmentEditorDraft => ({
  draftId: newDraftId(),
  videoPath,
  startTimeInput: '',
  endTimeInput: '',
  title: '',
  subTitle: '',
  audioEnabled: true
})

const normalizeDraft = (draft: SegmentEditorDraft): SegmentEditorDraft => {
  const storedEndTime = (draft as SegmentEditorDraft & { endTimeInput?: unknown }).endTimeInput
  if (typeof storedEndTime === 'string') return draft

  // Dev hot reload may preserve a draft created while the second field was
  // briefly (and incorrectly) treated as a segment length. Convert that
  // transient shape back to the editor's start/end representation.
  const storedLengthTime = (draft as SegmentEditorDraft & { lengthTimeInput?: unknown }).lengthTimeInput
  const startSeconds = parseTimeInput(draft.startTimeInput)
  const lengthSeconds = typeof storedLengthTime === 'string' ? parseTimeInput(storedLengthTime) : null
  const endTimeInput = startSeconds !== null && lengthSeconds !== null
    ? formatSegmentTime(startSeconds + lengthSeconds)
    : ''
  const { lengthTimeInput: _discardedLength, ...currentDraft } = draft as SegmentEditorDraft & { lengthTimeInput?: unknown }
  return { ...currentDraft, endTimeInput }
}

const resolveDraftTimes = (draft: SegmentEditorDraft, videos: VideoFileDescriptor[]) => {
  const selectedVideo = videos.find((video) => video.path === draft.videoPath)
  const startSeconds = parseTimeInput(draft.startTimeInput)
  const endSeconds = parseTimeInput(typeof draft.endTimeInput === 'string' ? draft.endTimeInput : '')
  if (!selectedVideo || startSeconds === null || endSeconds === null) return null
  if (endSeconds <= startSeconds) return null
  return { video: selectedVideo, startSeconds, endSeconds }
}

const isDraftValid = (draft: SegmentEditorDraft, videos: VideoFileDescriptor[]): boolean => resolveDraftTimes(draft, videos) !== null

const draftsToSegments = (drafts: SegmentEditorDraft[], videos: VideoFileDescriptor[]): Segment[] => {
  return drafts.flatMap((draft, index) => {
    const resolved = resolveDraftTimes(draft, videos)
    if (!resolved) return []
    const { video, startSeconds, endSeconds } = resolved
    const lengthSeconds = endSeconds - startSeconds
    return [{
      id: `editor-${index}-${startSeconds.toFixed(2)}`,
      sourceVideoName: video.fileName || getBaseName(video.path),
      sourceVideoPath: video.path,
      startSeconds,
      endSeconds,
      lengthSeconds,
      title: draft.title,
      subTitle: draft.subTitle,
      audioTrack: draft.audioEnabled ? '1' : '0'
    } satisfies Segment]
  })
}

export function SegmentEditor({ videos, activeVideoPath, initialSegments, initialDrafts, getCurrentTime, onLoad, onDraftsChange, onVideoSettingsChange, onClose }: SegmentEditorProps) {
  const [drafts, setDrafts] = useState<SegmentEditorDraft[]>(() => {
    if (initialDrafts && initialDrafts.length > 0) {
      return initialDrafts.map(normalizeDraft)
    }
    if (initialSegments.length > 0) {
      return initialSegments.map((s) => segmentToDraft(s, videos))
    }
    return [makeDraft(videos[0]?.path ?? '')]
  })
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [videoSettings, setVideoSettings] = useState<VideoSetting[]>(() => videos.map((video) => {
    const ranges = getMatchVideoTimeRanges(videos, video)
    return {
      path: video.path,
      matchGroupInput: video.matchGroupId ?? '',
      configured: ranges.length > 0,
      ranges: (ranges.length > 0 ? ranges : [{
        matchStartSeconds: 0,
        matchEndSeconds: 45 * 60,
        videoStartSeconds: 0,
        videoEndSeconds: 45 * 60
      }]).map((range) => ({
        id: range.id ?? newTimeRangeId(),
        matchStartInput: formatSegmentTime(range.matchStartSeconds),
        videoStartInput: formatSegmentTime(range.videoStartSeconds),
        durationInput: formatSegmentTime(range.matchEndSeconds - range.matchStartSeconds)
      }))
    }
  }))
  const containerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [editorOffset, setEditorOffset] = useState({ x: 0, y: 0 })
  const [openVideoSettings, setOpenVideoSettings] = useState<Set<string>>(() => new Set(
    videos
      .filter((video) => video.path === activeVideoPath || videos.length === 1)
      .map((video) => video.path)
  ))

  useEffect(() => {
    onDraftsChange?.(drafts)
  }, [drafts, onDraftsChange])

  const handleClose = useCallback(() => {
    // Also notify synchronously so a close directly after editing cannot lose the last value.
    onDraftsChange?.(drafts)
    onClose()
  }, [drafts, onClose, onDraftsChange])

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  const updateDraft = useCallback((draftId: string, changes: Partial<SegmentEditorDraft>) => {
    setDrafts((prev) => prev.map((d) => d.draftId === draftId ? { ...d, ...changes } : d))
  }, [])

  const addRow = () => {
    const lastDraft = drafts.at(-1)
    setDrafts((prev) => [...prev, makeDraft(lastDraft?.videoPath ?? videos[0]?.path ?? '')])
  }

  const removeRow = (draftId: string) => {
    setDrafts((prev) => {
      const next = prev.filter((d) => d.draftId !== draftId)
      return next.length === 0 ? [makeDraft(videos[0]?.path ?? '')] : next
    })
  }

  const moveRow = (draftId: string, direction: -1 | 1) => {
    setDrafts((prev) => {
      const idx = prev.findIndex((d) => d.draftId === draftId)
      if (idx < 0) return prev
      const next = [...prev]
      const swapIdx = idx + direction
      if (swapIdx < 0 || swapIdx >= next.length) return prev
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next
    })
  }

  const setCurrentTimeAsStart = (draftId: string) => {
    updateDraft(draftId, { startTimeInput: formatSegmentTime(getCurrentTime()) })
  }

  const exportCsv = async (andLoad: boolean) => {
    const segments = draftsToSegments(drafts, videos)
    if (segments.length === 0) {
      setErrorMessage('Keine gültigen Segmente zum Exportieren.')
      return
    }
    const csv = serializeSegmentsToCsv(segments)
    setSaving(true)
    setErrorMessage(null)
    const saved = await window.desktopApi.saveCsvFile(csv)
    setSaving(false)
    if (saved && andLoad) {
      onLoad(segments)
    }
  }

  const loadOnly = () => {
    const segments = draftsToSegments(drafts, videos)
    if (segments.length === 0) {
      setErrorMessage('Keine gültigen Segmente zum Laden.')
      return
    }
    onLoad(segments)
  }

  const hasInvalidRows = drafts.some((draft) => !isDraftValid(draft, videos))
  const validCount = drafts.filter((draft) => isDraftValid(draft, videos)).length
  const previewSegments = draftsToSegments(drafts, videos)
  const durationByVideo = videos.map((video) => {
    const videoSegments = previewSegments.filter((segment) => segment.sourceVideoPath === video.path)
    return {
      video,
      segmentCount: videoSegments.length,
      durationSeconds: videoSegments.reduce((total, segment) => total + segment.lengthSeconds, 0)
    }
  })
  const totalSegmentDurationSeconds = durationByVideo.reduce((total, summary) => total + summary.durationSeconds, 0)
  const getRangeValues = (range: VideoTimeRangeSetting) => {
    const matchStartSeconds = parseTimeInput(range.matchStartInput)
    const videoStartSeconds = parseTimeInput(range.videoStartInput)
    const durationSeconds = parseTimeInput(range.durationInput)
    if (matchStartSeconds === null || videoStartSeconds === null || durationSeconds === null || durationSeconds <= 0) return null
    return { matchStartSeconds, videoStartSeconds, durationSeconds }
  }

  const commitVideoSettings = (nextSettings: VideoSetting[]): void => {
    setVideoSettings(nextSettings)
    const parsedSettings = nextSettings.map((setting) => ({
      ...setting,
      parsedRanges: setting.ranges.map((range) => ({ id: range.id, values: getRangeValues(range) }))
    }))
    onVideoSettingsChange?.(videos.map((video) => {
      const setting = parsedSettings.find((candidate) => candidate.path === video.path)
      if (!setting) return video
      if (!setting.configured) return clearVideoMatchTimeMapping(video, setting.matchGroupInput)
      if (setting.parsedRanges.some((range) => range.values === null)) {
        return { ...video, matchGroupId: setting.matchGroupInput.trim() || undefined }
      }
      const matchTimeRanges = setting.parsedRanges.map(({ id, values }) => ({
        id,
        matchStartSeconds: values!.matchStartSeconds,
        matchEndSeconds: values!.matchStartSeconds + values!.durationSeconds,
        videoStartSeconds: values!.videoStartSeconds,
        videoEndSeconds: values!.videoStartSeconds + values!.durationSeconds
      }))
      const firstRange = matchTimeRanges[0]
      return {
        ...video,
        matchGroupId: setting.matchGroupInput.trim() || undefined,
        matchTimeRanges,
        matchTimeStartSeconds: firstRange.matchStartSeconds,
        matchTimeEndSeconds: firstRange.matchEndSeconds,
        videoTimeStartSeconds: firstRange.videoStartSeconds,
        // Keep the established fields populated so restored sessions and older
        // exports remain compatible with the generalized time mapping.
        kickoffVideoSeconds: firstRange.videoStartSeconds,
        matchDurationSeconds: firstRange.matchEndSeconds - firstRange.matchStartSeconds
      }
    }))
    setErrorMessage(null)
  }

  const updateVideoGroup = (path: string, matchGroupInput: string): void => {
    commitVideoSettings(videoSettings.map((setting) => setting.path === path ? { ...setting, matchGroupInput } : setting))
  }

  const updateTimeRange = (path: string, rangeId: string, changes: Partial<VideoTimeRangeSetting>): void => {
    commitVideoSettings(videoSettings.map((setting) => setting.path === path ? {
      ...setting,
      configured: true,
      ranges: setting.ranges.map((range) => range.id === rangeId ? { ...range, ...changes } : range)
    } : setting))
  }

  const addTimeRange = (path: string): void => {
    const setting = videoSettings.find((candidate) => candidate.path === path)
    const previous = setting?.ranges.at(-1)
    const previousValues = previous ? getRangeValues(previous) : null
    const nextMatchStart = previousValues
      ? formatSegmentTime(previousValues.matchStartSeconds + previousValues.durationSeconds)
      : '00:00'
    const nextVideoStart = previousValues
      ? formatSegmentTime(previousValues.videoStartSeconds + previousValues.durationSeconds)
      : '00:00'
    commitVideoSettings(videoSettings.map((candidate) => candidate.path === path ? {
      ...candidate,
      configured: true,
      ranges: [...candidate.ranges, {
        id: newTimeRangeId(),
        matchStartInput: nextMatchStart,
        videoStartInput: nextVideoStart,
        durationInput: '45:00'
      }]
    } : candidate))
  }

  const removeTimeRange = (path: string, rangeId: string): void => {
    const setting = videoSettings.find((candidate) => candidate.path === path)
    if (!setting || setting.ranges.length <= 1) return
    commitVideoSettings(videoSettings.map((candidate) => candidate.path === path
      ? { ...candidate, ranges: candidate.ranges.filter((range) => range.id !== rangeId) }
      : candidate))
  }

  const removeVideoTimeMapping = (path: string): void => {
    commitVideoSettings(videoSettings.map((setting) => setting.path === path
      ? { ...setting, configured: false }
      : setting))
  }

  const handleEditorDragStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button')) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: editorOffset.x,
      originY: editorOffset.y
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleEditorDragMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    setEditorOffset({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY
    })
  }

  const handleEditorDragEnd = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <div className="segment-editor-overlay" role="dialog" aria-modal="true" aria-label="Segment-Editor">
      <div className="segment-editor" ref={containerRef} style={{ transform: `translate(${editorOffset.x}px, ${editorOffset.y}px)` }}>
        <div className="segment-editor__header" onPointerDown={handleEditorDragStart} onPointerMove={handleEditorDragMove} onPointerUp={handleEditorDragEnd} onPointerCancel={handleEditorDragEnd}>
          <h2 className="segment-editor__title">Segment-Editor</h2>
          <span className="segment-editor__drag-hint" aria-hidden="true">↕ Kopfzeile ziehen, um das Fenster zu verschieben</span>
          <button className="button button--subtle segment-editor__close" onClick={handleClose} aria-label="Schließen">
            ✕
          </button>
        </div>

        <div className="segment-editor__body">
          <section className="segment-editor__match-settings" aria-labelledby="match-settings-title">
            <div>
              <h3 id="match-settings-title">Spielzeit im Video festlegen</h3>
              <details className="segment-editor__time-help">
                <summary>Kurze Anleitung</summary>
                <p>Spule das Video bis zum Anstoß und klicke auf <strong>Aktuelle Videoposition einsetzen</strong>. Für eine normale erste Halbzeit bleiben Spieluhr und Dauer auf 00:00 und 45:00.</p>
                <p>Enthält dasselbe Video noch eine zweite Halbzeit oder wurde die Aufnahme unterbrochen, füge dafür einen weiteren Spielabschnitt hinzu.</p>
              </details>
            </div>
            {videoSettings.map((setting) => {
              const video = videos.find((candidate) => candidate.path === setting.path)
              return (
                <details
                  className="segment-editor__match-row"
                  key={setting.path}
                  open={openVideoSettings.has(setting.path)}
                  onToggle={(event) => {
                    const isOpen = event.currentTarget.open
                    setOpenVideoSettings((current) => {
                      if (current.has(setting.path) === isOpen) return current
                      const next = new Set(current)
                      if (isOpen) next.add(setting.path)
                      else next.delete(setting.path)
                      return next
                    })
                  }}
                >
                  <summary>
                    <strong title={setting.path}>{video?.fileName ?? setting.path}</strong>
                    <span>{setting.configured ? `${setting.ranges.length} ${setting.ranges.length === 1 ? 'Spielabschnitt' : 'Spielabschnitte'}` : 'Noch nicht eingerichtet'}</span>
                    <span>{setting.matchGroupInput.trim() || 'Kein Spielname'}</span>
                  </summary>
                  <div className="segment-editor__match-row-body">
                    <label className="segment-editor__match-name">
                      Spielname für zusammengehörige Aufnahmen (optional)
                      <input
                        aria-label={`Spiel für ${video?.fileName ?? setting.path}`}
                        value={setting.matchGroupInput}
                        placeholder="z. B. Heimspiel gegen Musterstadt"
                        onChange={(event) => updateVideoGroup(setting.path, event.target.value)}
                      />
                    </label>
                    {setting.ranges.map((range, rangeIndex) => {
                      const values = getRangeValues(range)
                      const name = video?.fileName ?? setting.path
                      return (
                        <div className="segment-editor__time-range" key={range.id}>
                          <div className="segment-editor__time-range-heading">
                            <strong>Spielabschnitt {rangeIndex + 1}</strong>
                            <div className="segment-editor__time-presets" aria-label={`Vorlagen für Spielabschnitt ${rangeIndex + 1}`}>
                              <span>Vorlage:</span>
                              <button type="button" onClick={() => updateTimeRange(setting.path, range.id, { matchStartInput: '00:00', durationInput: '45:00' })}>1. Halbzeit</button>
                              <button type="button" onClick={() => updateTimeRange(setting.path, range.id, { matchStartInput: '45:00', durationInput: '45:00' })}>2. Halbzeit</button>
                            </div>
                          </div>
                          <div className="segment-editor__time-range-fields">
                            <label>
                              Anstoß/Wiederbeginn im Video
                              <div className="segment-editor__video-position-field">
                                <input aria-label={`Anstoß oder Wiederbeginn im Video für Spielabschnitt ${rangeIndex + 1} von ${name}`} value={range.videoStartInput} onChange={(event) => updateTimeRange(setting.path, range.id, { videoStartInput: event.target.value })} />
                                <button className="button button--subtle" type="button" aria-label={`Aktuelle Videoposition einsetzen für Spielabschnitt ${rangeIndex + 1} von ${name}`} disabled={activeVideoPath !== undefined && activeVideoPath !== setting.path} title={activeVideoPath !== undefined && activeVideoPath !== setting.path ? 'Dafür zuerst dieses Video im Player auswählen' : undefined} onClick={() => updateTimeRange(setting.path, range.id, { videoStartInput: formatSegmentTime(getCurrentTime()) })}>Aktuelle Videoposition einsetzen</button>
                              </div>
                            </label>
                            <label>Spieluhr startet bei<input aria-label={`Spieluhr startet bei für Spielabschnitt ${rangeIndex + 1} von ${name}`} value={range.matchStartInput} onChange={(event) => updateTimeRange(setting.path, range.id, { matchStartInput: event.target.value })} /></label>
                            <label>Dauer des Spielabschnitts<input aria-label={`Dauer des Spielabschnitts ${rangeIndex + 1} von ${name}`} value={range.durationInput} onChange={(event) => updateTimeRange(setting.path, range.id, { durationInput: event.target.value })} /></label>
                          </div>
                          <div className="segment-editor__time-range-result">
                            {!setting.configured
                              ? 'Noch nicht zugeordnet. Ändere eine Zeit oder wähle eine Halbzeit-Vorlage.'
                              : values
                              ? `Ergebnis: Im Video ${formatSegmentTime(values.videoStartSeconds)}–${formatSegmentTime(values.videoStartSeconds + values.durationSeconds)} läuft die Spieluhr von ${formatSegmentTime(values.matchStartSeconds)} bis ${formatSegmentTime(values.matchStartSeconds + values.durationSeconds)}.`
                              : 'Bitte drei gültige Zeiten eingeben.'}
                          </div>
                          <button className="button button--subtle segment-editor__remove-time-range" type="button" disabled={setting.ranges.length <= 1} onClick={() => removeTimeRange(setting.path, range.id)}>Spielabschnitt entfernen</button>
                        </div>
                      )
                    })}
                    <button className="button button--subtle segment-editor__add-time-range" type="button" onClick={() => addTimeRange(setting.path)}>Weiteren Spielabschnitt hinzufügen</button>
                    {setting.configured ? (
                      <button className="button button--subtle segment-editor__clear-time-mapping" type="button" onClick={() => removeVideoTimeMapping(setting.path)}>Spielzeit-Zuordnung entfernen</button>
                    ) : null}
                  </div>
                </details>
              )
            })}
            <span className="segment-editor__autosave-hint">Jedes Video wird unabhängig gespeichert, sobald seine drei Zeiten gültig sind. Unberührte Videos erhalten keine automatische Zuordnung.</span>
          </section>

          <section className="segment-editor__duration-summary" aria-labelledby="segment-duration-summary-title">
            <div className="segment-editor__duration-summary-heading">
              <div>
                <h3 id="segment-duration-summary-title">Summierte Segmentdauer</h3>
                <p>Berücksichtigt werden alle aktuell gültigen Zeilen.</p>
              </div>
              <strong aria-label={`Gesamtdauer ${formatClockTime(totalSegmentDurationSeconds)}`}>
                Gesamt: {formatClockTime(totalSegmentDurationSeconds)}
              </strong>
            </div>
            <div className="segment-editor__duration-summary-grid">
              {durationByVideo.map(({ video, segmentCount, durationSeconds }) => (
                <div key={video.path} title={video.path}>
                  <span>{video.fileName}</span>
                  <strong>{formatClockTime(durationSeconds)}</strong>
                  <small>{segmentCount} {segmentCount === 1 ? 'Segment' : 'Segmente'}</small>
                </div>
              ))}
            </div>
          </section>

          <table className="segment-editor__table">
            <thead>
              <tr>
                <th className="segment-editor__col-nr">#</th>
                {videos.length > 1 && <th className="segment-editor__col-video">Video</th>}
                <th className="segment-editor__col-start">Startzeit</th>
                <th className="segment-editor__col-length">Ende</th>
                <th className="segment-editor__col-title">Titel</th>
                <th className="segment-editor__col-subtitle">Untertitel</th>
                <th className="segment-editor__col-audio">Audio</th>
                <th className="segment-editor__col-actions">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft, index) => {
                const valid = isDraftValid(draft, videos)
                return (
                  <tr key={draft.draftId} className={valid ? '' : 'segment-editor__row--invalid'}>
                    <td className="segment-editor__col-nr">{index + 1}</td>
                    {videos.length > 1 && (
                      <td className="segment-editor__col-video">
                        <select
                          className="segment-editor__select"
                          aria-label={`Video für Segment ${index + 1}`}
                          value={draft.videoPath}
                          onChange={(e) => updateDraft(draft.draftId, { videoPath: e.target.value })}
                        >
                          {draft.videoPath && !videos.some((v) => v.path === draft.videoPath) && (
                            <option value={draft.videoPath}>{getBaseName(draft.videoPath)}</option>
                          )}
                          {videos.map((v) => (
                            <option key={v.path} value={v.path}>{v.fileName}</option>
                          ))}
                        </select>
                      </td>
                    )}
                    <td className="segment-editor__col-start">
                      <div className="segment-editor__start-cell">
                        <input
                          className="segment-editor__input"
                          type="text"
                          value={draft.startTimeInput}
                          onChange={(e) => updateDraft(draft.draftId, { startTimeInput: e.target.value })}
                          placeholder="z.B. 1:30"
                        />
                        <button
                          className="button button--subtle segment-editor__now-btn"
                          title="Aktuelle Videoposition als Startzeit übernehmen"
                          disabled={activeVideoPath !== undefined && activeVideoPath !== draft.videoPath}
                          onClick={() => setCurrentTimeAsStart(draft.draftId)}
                        >
                          ⏱
                        </button>
                      </div>
                    </td>
                    <td className="segment-editor__col-length">
                      <input
                        className="segment-editor__input"
                        type="text"
                        value={draft.endTimeInput}
                        onChange={(e) => updateDraft(draft.draftId, { endTimeInput: e.target.value })}
                        placeholder="z.B. 2:00"
                      />
                    </td>
                    <td className="segment-editor__col-title">
                      <input
                        className="segment-editor__input"
                        type="text"
                        value={draft.title}
                        onChange={(e) => updateDraft(draft.draftId, { title: e.target.value })}
                        placeholder="(optional)"
                      />
                    </td>
                    <td className="segment-editor__col-subtitle">
                      <input
                        className="segment-editor__input"
                        type="text"
                        value={draft.subTitle}
                        onChange={(e) => updateDraft(draft.draftId, { subTitle: e.target.value })}
                        placeholder="(optional)"
                      />
                    </td>
                    <td className="segment-editor__col-audio">
                      <input
                        type="checkbox"
                        checked={draft.audioEnabled}
                        onChange={(e) => updateDraft(draft.draftId, { audioEnabled: e.target.checked })}
                        title="Audio aktiviert"
                      />
                    </td>
                    <td className="segment-editor__col-actions">
                      <div className="segment-editor__row-actions">
                        <button
                          className="button button--subtle"
                          disabled={index === 0}
                          onClick={() => moveRow(draft.draftId, -1)}
                          title="Nach oben"
                        >
                          ↑
                        </button>
                        <button
                          className="button button--subtle"
                          disabled={index === drafts.length - 1}
                          onClick={() => moveRow(draft.draftId, 1)}
                          title="Nach unten"
                        >
                          ↓
                        </button>
                        <button
                          className="button button--subtle"
                          onClick={() => removeRow(draft.draftId)}
                          title="Zeile löschen"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="segment-editor__add-row">
            <button className="button button--subtle" onClick={addRow}>
              + Zeile hinzufügen
            </button>
          </div>

          {hasInvalidRows && (
            <p className="segment-editor__warning">
              Zeilen mit rotem Hintergrund haben ungültige Werte und werden nicht exportiert oder geladen.
              ({validCount} von {drafts.length} gültig)
            </p>
          )}

          {errorMessage && (
            <p className="segment-editor__error">{errorMessage}</p>
          )}
        </div>

        <div className="segment-editor__footer">
          <div>
            <button className="button button--subtle" onClick={handleClose}>
              Schließen
            </button>
            <span className="segment-editor__autosave-hint"> Zeilenentwürfe werden automatisch gespeichert.</span>
          </div>
          <div className="segment-editor__footer-actions">
            <button className="button" disabled={validCount === 0} onClick={loadOnly}>
              Laden
            </button>
            <button className="button" disabled={validCount === 0 || saving} onClick={() => void exportCsv(false)}>
              {saving ? 'Speichern…' : 'CSV exportieren'}
            </button>
            <button className="button button--primary" disabled={validCount === 0 || saving} onClick={() => void exportCsv(true)}>
              {saving ? 'Speichern…' : 'Exportieren & Laden'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
