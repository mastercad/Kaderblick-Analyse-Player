import { useCallback, useEffect, useRef, useState } from 'react'
import { findLoadedVideoForSegment, getBaseName, parseTimeInput, serializeSegmentsToCsv } from '../../../../common/segmentUtils'
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
  const [videoSettings, setVideoSettings] = useState(() => videos.map((video) => ({
    path: video.path,
    matchGroupInput: video.matchGroupId ?? '',
    half: video.matchHalf ?? 1,
    kickoffInput: formatClockTime(video.kickoffVideoSeconds ?? 0),
    matchDurationInput: formatClockTime(video.matchDurationSeconds ?? 45 * 60)
  })))
  const containerRef = useRef<HTMLDivElement>(null)

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
  const updateVideoSetting = (path: string, changes: Partial<(typeof videoSettings)[number]>) => {
    let nextSettings = videoSettings.map((setting) => setting.path === path ? { ...setting, ...changes } : setting)
    const changedSetting = nextSettings.find((setting) => setting.path === path)
    const changedGroupId = changedSetting?.matchGroupInput.trim() ?? ''

    // A game's half duration is shared by all of its videos. When a video is
    // assigned to an existing game, adopt that game's duration. Editing the
    // duration afterwards updates both halves together while kickoff positions
    // remain independent per video.
    if (changedSetting && 'matchGroupInput' in changes && changedGroupId) {
      const existingGroupSetting = videoSettings.find((setting) =>
        setting.path !== path && setting.matchGroupInput.trim() === changedGroupId
      )
      if (existingGroupSetting) {
        nextSettings = nextSettings.map((setting) => setting.path === path
          ? { ...setting, matchDurationInput: existingGroupSetting.matchDurationInput }
          : setting)
      }
    }
    if (changedSetting && 'matchDurationInput' in changes && changedGroupId) {
      nextSettings = nextSettings.map((setting) => setting.matchGroupInput.trim() === changedGroupId
        ? { ...setting, matchDurationInput: changedSetting.matchDurationInput }
        : setting)
    }
    setVideoSettings(nextSettings)
    if (nextSettings.some((setting) => {
      const kickoff = parseTimeInput(setting.kickoffInput)
      const duration = parseTimeInput(setting.matchDurationInput)
      return kickoff === null || duration === null || duration <= 0
    })) {
      return
    }
    onVideoSettingsChange?.(videos.map((video) => {
      const setting = nextSettings.find((candidate) => candidate.path === video.path)
      return setting ? {
        ...video,
        matchGroupId: setting.matchGroupInput.trim() || undefined,
        matchHalf: setting.half as 1 | 2,
        kickoffVideoSeconds: parseTimeInput(setting.kickoffInput)!,
        matchDurationSeconds: parseTimeInput(setting.matchDurationInput)!
      } : video
    }))
    setErrorMessage(null)
  }

  return (
    <div className="segment-editor-overlay" role="dialog" aria-modal="true" aria-label="Segment-Editor">
      <div className="segment-editor" ref={containerRef}>
        <div className="segment-editor__header">
          <h2 className="segment-editor__title">Segment-Editor</h2>
          <button className="button button--subtle segment-editor__close" onClick={handleClose} aria-label="Schließen">
            ✕
          </button>
        </div>

        <div className="segment-editor__body">
          <section className="segment-editor__match-settings" aria-labelledby="match-settings-title">
            <div>
              <h3 id="match-settings-title">Video-Zeitzuordnung</h3>
              <p>Ordne zusammengehörige Halbzeiten einem Spiel zu und lege deren Zeitachsen fest.</p>
            </div>
            {videoSettings.map((setting) => {
              const video = videos.find((candidate) => candidate.path === setting.path)
              return (
                <div className="segment-editor__match-row" key={setting.path}>
                  <strong title={setting.path}>{video?.fileName ?? setting.path}</strong>
                  <label>
                    Spiel
                    <input
                      aria-label={`Spiel für ${video?.fileName ?? setting.path}`}
                      value={setting.matchGroupInput}
                      placeholder="z. B. Spiel 1"
                      onChange={(event) => updateVideoSetting(setting.path, { matchGroupInput: event.target.value })}
                    />
                  </label>
                  <label>
                    Halbzeit
                    <select aria-label={`Halbzeit für ${video?.fileName ?? setting.path}`} value={setting.half} onChange={(event) => updateVideoSetting(setting.path, { half: Number(event.target.value) as 1 | 2 })}>
                      <option value={1}>1. Halbzeit</option>
                      <option value={2}>2. Halbzeit</option>
                    </select>
                  </label>
                  <label>
                    Spielstart
                    <input aria-label={`Spielstart für ${video?.fileName ?? setting.path}`} value={setting.kickoffInput} placeholder="z. B. 02:41" onChange={(event) => updateVideoSetting(setting.path, { kickoffInput: event.target.value })} />
                  </label>
                  <label>
                    Länge
                    <input aria-label={`Länge für ${video?.fileName ?? setting.path}`} value={setting.matchDurationInput} placeholder="45:00" onChange={(event) => updateVideoSetting(setting.path, { matchDurationInput: event.target.value })} />
                  </label>
                  <button className="button button--subtle" type="button" disabled={activeVideoPath !== undefined && activeVideoPath !== setting.path} title={activeVideoPath !== undefined && activeVideoPath !== setting.path ? 'Dafür zuerst dieses Video im Player auswählen' : 'Aktuelle Position des Players übernehmen'} onClick={() => updateVideoSetting(setting.path, { kickoffInput: formatClockTime(getCurrentTime()) })}>Aktuelle Position</button>
                </div>
              )
            })}
            <span className="segment-editor__autosave-hint">Gültige Änderungen werden sofort übernommen.</span>
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
