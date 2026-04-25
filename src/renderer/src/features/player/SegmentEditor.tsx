import { useCallback, useEffect, useRef, useState } from 'react'
import { getBaseName, parseTimeInput, serializeSegmentsToCsv } from '../../../../common/segmentUtils'
import { formatClockTime } from '../../../../common/timeUtils'
import type { Segment, VideoFileDescriptor } from '../../../../common/types'

interface SegmentDraft {
  draftId: string
  videoPath: string
  startTimeInput: string
  endTimeInput: string
  title: string
  subTitle: string
  audioEnabled: boolean
}

interface SegmentEditorProps {
  videos: VideoFileDescriptor[]
  initialSegments: Segment[]
  getCurrentTime: () => number
  onLoad: (segments: Segment[]) => void
  onClose: () => void
}

const newDraftId = (() => {
  let counter = 0
  return () => `draft-${++counter}`
})()

const segmentToDraft = (segment: Segment, videos: VideoFileDescriptor[]): SegmentDraft => {
  const matchedVideo =
    videos.find((v) => v.path === segment.sourceVideoPath) ??
    videos.find((v) => v.fileName === segment.sourceVideoName)
  return {
    draftId: newDraftId(),
    videoPath: matchedVideo?.path ?? segment.sourceVideoPath,
    startTimeInput: formatClockTime(segment.startSeconds),
    endTimeInput: formatClockTime(segment.startSeconds + segment.lengthSeconds),
    title: segment.title,
    subTitle: segment.subTitle,
    audioEnabled: segment.audioTrack === '1'
  }
}

const makeDraft = (videoPath: string): SegmentDraft => ({
  draftId: newDraftId(),
  videoPath,
  startTimeInput: '',
  endTimeInput: '',
  title: '',
  subTitle: '',
  audioEnabled: true
})

const isDraftValid = (draft: SegmentDraft): boolean => {
  if (!draft.videoPath) return false
  const startSeconds = parseTimeInput(draft.startTimeInput)
  const endSeconds = parseTimeInput(draft.endTimeInput)
  return startSeconds !== null && endSeconds !== null && startSeconds >= 0 && endSeconds > startSeconds
}

const draftsToSegments = (drafts: SegmentDraft[]): Segment[] => {
  return drafts.filter(isDraftValid).map((draft, index) => {
    const startSeconds = parseTimeInput(draft.startTimeInput)!
    const endSeconds = parseTimeInput(draft.endTimeInput)!
    const lengthSeconds = endSeconds - startSeconds
    const sourceVideoName = getBaseName(draft.videoPath)
    return {
      id: `editor-${index}-${startSeconds.toFixed(2)}`,
      sourceVideoName,
      sourceVideoPath: draft.videoPath,
      startSeconds,
      endSeconds,
      lengthSeconds,
      title: draft.title,
      subTitle: draft.subTitle,
      audioTrack: draft.audioEnabled ? '1' : '0'
    } satisfies Segment
  })
}

export function SegmentEditor({ videos, initialSegments, getCurrentTime, onLoad, onClose }: SegmentEditorProps) {
  const [drafts, setDrafts] = useState<SegmentDraft[]>(() => {
    if (initialSegments.length > 0) {
      return initialSegments.map((s) => segmentToDraft(s, videos))
    }
    return [makeDraft(videos[0]?.path ?? '')]
  })
  const [saving, setSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const updateDraft = useCallback((draftId: string, changes: Partial<SegmentDraft>) => {
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
    updateDraft(draftId, { startTimeInput: formatClockTime(getCurrentTime()) })
  }

  const exportCsv = async (andLoad: boolean) => {
    const segments = draftsToSegments(drafts)
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
    const segments = draftsToSegments(drafts)
    if (segments.length === 0) {
      setErrorMessage('Keine gültigen Segmente zum Laden.')
      return
    }
    onLoad(segments)
  }

  const hasInvalidRows = drafts.some((d) => !isDraftValid(d))
  const validCount = drafts.filter(isDraftValid).length

  return (
    <div className="segment-editor-overlay" role="dialog" aria-modal="true" aria-label="Segment-Editor">
      <div className="segment-editor" ref={containerRef}>
        <div className="segment-editor__header">
          <h2 className="segment-editor__title">Segment-Editor</h2>
          <button className="button button--subtle segment-editor__close" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>

        <div className="segment-editor__body">
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
                const valid = isDraftValid(draft)
                return (
                  <tr key={draft.draftId} className={valid ? '' : 'segment-editor__row--invalid'}>
                    <td className="segment-editor__col-nr">{index + 1}</td>
                    {videos.length > 1 && (
                      <td className="segment-editor__col-video">
                        <select
                          className="segment-editor__select"
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
          <button className="button button--subtle" onClick={onClose}>
            Schließen
          </button>
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
