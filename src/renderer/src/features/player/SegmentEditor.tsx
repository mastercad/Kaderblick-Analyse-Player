import { useCallback, useEffect, useRef, useState } from 'react'
import { getBaseName, parseTimeInput, serializeSegmentsToCsv } from '../../../../common/segmentUtils'
import { resolvePlayerJumpTarget, videoTimeToPlayerInput } from '../../../../common/matchTimeUtils'
import { formatClockTime } from '../../../../common/timeUtils'
import type { PlayerJumpTimeMode, Segment, SegmentEditorDraft, VideoFileDescriptor } from '../../../../common/types'

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

const timeInputModes: Array<{ value: PlayerJumpTimeMode; label: string }> = [
  { value: 'video-per-file', label: 'Videozeit – je Video' },
  { value: 'video-cumulative', label: 'Videozeit – fortlaufend' },
  { value: 'match-per-part', label: 'Spielzeit – je Halbzeit/Teil' },
  { value: 'match-cumulative', label: 'Spielzeit – fortlaufend' }
]

const segmentToDraft = (segment: Segment, videos: VideoFileDescriptor[]): SegmentEditorDraft => {
  const matchedVideo =
    videos.find((v) => v.path === segment.sourceVideoPath) ??
    videos.find((v) => v.fileName === segment.sourceVideoName)
  return {
    draftId: newDraftId(),
    videoPath: matchedVideo?.path ?? segment.sourceVideoPath,
    startTimeInput: formatClockTime(segment.startSeconds),
    endTimeInput: formatClockTime(segment.startSeconds + segment.lengthSeconds),
    timeInputMode: 'video-per-file',
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
  timeInputMode: 'video-per-file',
  title: '',
  subTitle: '',
  audioEnabled: true
})

const resolveDraftTimes = (draft: SegmentEditorDraft, videos: VideoFileDescriptor[]) => {
  const selectedVideo = videos.find((video) => video.path === draft.videoPath)
  const startInputSeconds = parseTimeInput(draft.startTimeInput)
  const endInputSeconds = parseTimeInput(draft.endTimeInput)
  if (!selectedVideo || startInputSeconds === null || endInputSeconds === null) return null

  const mode = draft.timeInputMode ?? 'video-per-file'
  const start = resolvePlayerJumpTarget(mode, videos, selectedVideo, startInputSeconds)
  const end = resolvePlayerJumpTarget(mode, videos, selectedVideo, endInputSeconds)
  if (!start || !end || start.video.path !== end.video.path || start.videoSeconds < 0 || end.videoSeconds <= start.videoSeconds) return null
  if ((start.video.durationSeconds ?? 0) > 0 && end.videoSeconds > start.video.durationSeconds!) return null
  return { video: start.video, startSeconds: start.videoSeconds, endSeconds: end.videoSeconds }
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
      return initialDrafts
    }
    if (initialSegments.length > 0) {
      return initialSegments.map((s) => segmentToDraft(s, videos))
    }
    return [makeDraft(videos[0]?.path ?? '')]
  })
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [timeInputMode, setTimeInputMode] = useState<PlayerJumpTimeMode>(() => initialDrafts?.[0]?.timeInputMode ?? 'video-per-file')
  const [videoSettings, setVideoSettings] = useState(() => videos.map((video) => ({
    path: video.path,
    matchGroupInput: video.matchGroupId ?? '',
    half: video.matchHalf ?? 1,
    kickoffInput: formatClockTime(video.kickoffVideoSeconds ?? 0),
    matchDurationInput: formatClockTime(video.matchDurationSeconds ?? 45 * 60)
  })))
  const containerRef = useRef<HTMLDivElement>(null)

  const effectiveVideos = videos.map((video) => {
    const setting = videoSettings.find((candidate) => candidate.path === video.path)
    const kickoff = setting ? parseTimeInput(setting.kickoffInput) : null
    const duration = setting ? parseTimeInput(setting.matchDurationInput) : null
    return setting && kickoff !== null && duration !== null && duration > 0 ? {
      ...video,
      matchGroupId: setting.matchGroupInput.trim() || undefined,
      matchHalf: setting.half as 1 | 2,
      kickoffVideoSeconds: kickoff,
      matchDurationSeconds: duration
    } : video
  })

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
    const draft = drafts.find((candidate) => candidate.draftId === draftId)
    const video = effectiveVideos.find((candidate) => candidate.path === draft?.videoPath)
    if (!draft || !video) return
    const inputSeconds = videoTimeToPlayerInput(timeInputMode, effectiveVideos, video, getCurrentTime())
    if (inputSeconds === null || inputSeconds < 0) return
    updateDraft(draftId, { startTimeInput: formatClockTime(inputSeconds), timeInputMode })
  }

  const changeTimeInputMode = (nextMode: PlayerJumpTimeMode) => {
    setDrafts((previous) => previous.map((draft) => {
      const selectedVideo = effectiveVideos.find((video) => video.path === draft.videoPath)
      if (!selectedVideo) return { ...draft, timeInputMode: nextMode }
      const oldMode = draft.timeInputMode ?? 'video-per-file'
      let nextVideo = selectedVideo
      const convert = (value: string): string => {
        const seconds = parseTimeInput(value)
        if (seconds === null) return value
        const target = resolvePlayerJumpTarget(oldMode, effectiveVideos, selectedVideo, seconds)
        if (!target) return value
        nextVideo = target.video
        const converted = videoTimeToPlayerInput(nextMode, effectiveVideos, target.video, target.videoSeconds)
        return converted === null || converted < 0 ? value : formatClockTime(converted)
      }
      const startTimeInput = convert(draft.startTimeInput)
      const startVideo = nextVideo
      const endTimeInput = convert(draft.endTimeInput)
      const videoPath = startVideo.path === nextVideo.path ? nextVideo.path : draft.videoPath
      return { ...draft, videoPath, startTimeInput, endTimeInput, timeInputMode: nextMode }
    }))
    setTimeInputMode(nextMode)
  }

  const exportCsv = async (andLoad: boolean) => {
    const segments = draftsToSegments(drafts, effectiveVideos)
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
    const segments = draftsToSegments(drafts, effectiveVideos)
    if (segments.length === 0) {
      setErrorMessage('Keine gültigen Segmente zum Laden.')
      return
    }
    onLoad(segments)
  }

  const hasInvalidRows = drafts.some((draft) => !isDraftValid(draft, effectiveVideos))
  const validCount = drafts.filter((draft) => isDraftValid(draft, effectiveVideos)).length
  const previewSegments = draftsToSegments(drafts, effectiveVideos)
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
                    Anstoß im Video
                    <input aria-label={`Anstoß im Video für ${video?.fileName ?? setting.path}`} value={setting.kickoffInput} placeholder="z. B. 02:41" onChange={(event) => updateVideoSetting(setting.path, { kickoffInput: event.target.value })} />
                  </label>
                  <label>
                    Dauer je Halbzeit
                    <input aria-label={`Dauer je Halbzeit für ${video?.fileName ?? setting.path}`} value={setting.matchDurationInput} placeholder="45:00" onChange={(event) => updateVideoSetting(setting.path, { matchDurationInput: event.target.value })} />
                  </label>
                  <button className="button button--subtle" type="button" disabled={activeVideoPath !== undefined && activeVideoPath !== setting.path} title={activeVideoPath !== undefined && activeVideoPath !== setting.path ? 'Dafür zuerst dieses Video im Player auswählen' : 'Aktuelle Position des Players übernehmen'} onClick={() => updateVideoSetting(setting.path, { kickoffInput: formatClockTime(getCurrentTime()) })}>Aktuelle Position</button>
                </div>
              )
            })}
            <span className="segment-editor__autosave-hint">Gültige Änderungen werden sofort übernommen.</span>
          </section>

          <section className="segment-editor__time-mode" aria-labelledby="segment-time-mode-title">
            <div>
              <h3 id="segment-time-mode-title">Zeitformat der Segment-Eingaben</h3>
              <p>Die Eingaben werden beim Laden und Exportieren automatisch in absolute Zeiten des passenden Videos umgerechnet.</p>
            </div>
            <label>
              Zeitformat
              <select aria-label="Zeitformat der Segment-Eingaben" value={timeInputMode} onChange={(event) => changeTimeInputMode(event.target.value as PlayerJumpTimeMode)}>
                {timeInputModes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
              </select>
            </label>
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
                const valid = isDraftValid(draft, effectiveVideos)
                return (
                  <tr key={draft.draftId} className={valid ? '' : 'segment-editor__row--invalid'}>
                    <td className="segment-editor__col-nr">{index + 1}</td>
                    {videos.length > 1 && (
                      <td className="segment-editor__col-video">
                        <select
                          className="segment-editor__select"
                          aria-label={`Video für Segment ${index + 1}`}
                          value={draft.videoPath}
                          onChange={(e) => updateDraft(draft.draftId, { videoPath: e.target.value, timeInputMode })}
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
                          onChange={(e) => updateDraft(draft.draftId, { startTimeInput: e.target.value, timeInputMode })}
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
                        onChange={(e) => updateDraft(draft.draftId, { endTimeInput: e.target.value, timeInputMode })}
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
