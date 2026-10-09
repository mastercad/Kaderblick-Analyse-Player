import { createPortal } from 'react-dom'
import type { UpdateStatus } from '../../../../common/types'
import appLogo from '../../../../../assets/kaderblick_analyse_player_appicon.svg'

interface UpdateDialogProps {
  status: UpdateStatus
  open: boolean
  onClose: () => void
  onDownload: () => void
  onInstallAndRestart: () => void
}

export function UpdateDialog({ status, open, onClose, onDownload, onInstallAndRestart }: UpdateDialogProps) {
  if (!open || status.phase === 'idle') return null

  const version = 'version' in status ? status.version : undefined
  const title = status.phase === 'available'
    ? 'Update verfügbar'
    : status.phase === 'downloading'
      ? 'Download läuft'
      : status.phase === 'downloaded'
        ? 'Update ist bereit'
        : 'Update fehlgeschlagen'

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="update-dialog-title" aria-modal="true" className="modal-card modal-card--narrow update-dialog" role="dialog">
        <div className="update-dialog__brand">
          <span className="update-dialog__mark" aria-hidden="true">
            <img alt="" src={appLogo} />
          </span>
          <h2 id="update-dialog-title">{title}</h2>
        </div>

        {status.phase === 'available' && (
          <p>Version <strong>{status.version}</strong> ist verfügbar.</p>
        )}
        {status.phase === 'downloading' && (
          <>
            <p>Version <strong>{status.version}</strong> wird heruntergeladen.</p>
            <div className="update-dialog__progress" aria-label="Downloadfortschritt">
              <div style={{ width: `${Math.max(0, Math.min(100, status.percent ?? 0))}%` }} />
            </div>
            <p className="update-dialog__progress-label">
              {status.percent === undefined ? 'Download wird vorbereitet…' : `${Math.round(status.percent)} %`}
            </p>
          </>
        )}
        {status.phase === 'downloaded' && (
          <p>Version <strong>{status.version}</strong> ist bereit. Der Player wird für die Installation geschlossen und anschließend neu gestartet.</p>
        )}
        {status.phase === 'error' && (
          <>
            <p>Das Update konnte nicht heruntergeladen werden.</p>
            <p className="update-dialog__error">{status.message}</p>
          </>
        )}

        <div className="modal-card__actions update-dialog__actions">
          <button className="button button--subtle" type="button" onClick={onClose}>
            {status.phase === 'downloading'
              ? 'Ausblenden'
              : status.phase === 'error'
                ? 'Schließen'
                : 'Später'}
          </button>
          {status.phase === 'available' && (
            <button className="button button--primary" type="button" autoFocus onClick={onDownload}>Herunterladen</button>
          )}
          {status.phase === 'downloaded' && (
            <button className="button button--primary" type="button" autoFocus onClick={onInstallAndRestart}>Installieren und neu starten</button>
          )}
          {status.phase === 'error' && version && (
            <button className="button button--primary" type="button" onClick={onDownload}>Erneut versuchen</button>
          )}
        </div>
      </section>
    </div>,
    document.body
  )
}
