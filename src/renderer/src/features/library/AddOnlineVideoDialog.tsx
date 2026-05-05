import { useEffect, useRef, useState } from 'react'
import { createOnlineVideoDescriptor, parseOnlineVideoUrl } from '../../../../common/onlineVideoUtils'
import type { VideoFileDescriptor } from '../../../../common/types'

interface AddOnlineVideoDialogProps {
  open: boolean
  existingPaths: Set<string>
  onAdd: (video: VideoFileDescriptor) => void
  onClose: () => void
}

export function AddOnlineVideoDialog({ open, existingPaths, onAdd, onClose }: AddOnlineVideoDialogProps) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setUrl('')
      setError(null)
      // Focus the input on next frame so the dialog is visible first
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()

    const trimmed = url.trim()
    if (!trimmed) {
      setError('Bitte eine URL eingeben.')
      return
    }

    const info = parseOnlineVideoUrl(trimmed)
    if (!info) {
      setError('Die URL konnte nicht erkannt werden. Bitte eine gültige YouTube- oder Vimeo-URL eingeben.')
      return
    }

    const descriptor = createOnlineVideoDescriptor(trimmed)
    if (!descriptor) {
      setError('Das Video konnte nicht hinzugefügt werden.')
      return
    }

    if (existingPaths.has(descriptor.path)) {
      setError('Dieses Video ist bereits in der Bibliothek vorhanden.')
      return
    }

    onAdd(descriptor)
    onClose()
  }

  if (!open) return null

  return (
    <div className="segment-editor-overlay" role="dialog" aria-modal="true" aria-label="Online-Video hinzufügen">
      <div className="segment-editor" style={{ maxWidth: '480px' }}>
        <div className="segment-editor__header">
          <h2 className="segment-editor__title">Online-Video hinzufügen</h2>
          <button className="button button--subtle segment-editor__close" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>

        <div className="segment-editor__body" style={{ padding: '1.25rem' }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label htmlFor="online-video-url" style={{ display: 'block', marginBottom: '0.375rem', fontSize: '0.875rem', fontWeight: 600 }}>
                YouTube- oder Vimeo-URL
              </label>
              <input
                id="online-video-url"
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(null) }}
                placeholder="https://www.youtube.com/watch?v=… oder https://vimeo.com/…"
                style={{ width: '100%', boxSizing: 'border-box' }}
                className="segment-editor__select"
                autoComplete="off"
                spellCheck={false}
              />
              {error ? (
                <p style={{ color: 'var(--color-error, #c0392b)', fontSize: '0.8125rem', margin: '0.375rem 0 0' }} role="alert">{error}</p>
              ) : null}
            </div>

            <p style={{ fontSize: '0.8125rem', margin: '0 0 1.25rem', opacity: 0.7, lineHeight: 1.5 }}>
              Für YouTube werden Video-IDs als Kennung verwendet (z.&thinsp;B.{' '}
              <code>youtube:dQw4w9WgXcQ</code>). Diese Kennung trägst du in der CSV-Spalte{' '}
              <code>videoname</code> ein, um Segmente diesem Video zuzuordnen.
            </p>

            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button type="button" className="button button--subtle" onClick={onClose}>
                Abbrechen
              </button>
              <button type="submit" className="button button--primary">
                Hinzufügen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
