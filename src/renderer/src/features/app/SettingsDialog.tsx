import { createPortal } from 'react-dom'
import type { PlayerJumpTimeMode } from '../../../../common/types'

interface SettingsDialogProps {
  open: boolean
  jumpTimeMode: PlayerJumpTimeMode
  onJumpTimeModeChange: (mode: PlayerJumpTimeMode) => void
  onClose: () => void
}

const jumpTimeModes: Array<{ value: PlayerJumpTimeMode; title: string; description: string }> = [
  { value: 'video-per-file', title: 'Videozeit – je Video', description: 'Die Eingabe ist die direkte Position im aktuell geöffneten Video.' },
  { value: 'video-cumulative', title: 'Videozeit – fortlaufend', description: 'Die Laufzeiten vorheriger Videos desselben Spiels sind eingerechnet.' },
  { value: 'match-per-part', title: 'Spielzeit – je Halbzeit/Teil', description: 'Die Zeit beginnt in jeder Halbzeit beziehungsweise jedem Teil wieder bei 00:00.' },
  { value: 'match-cumulative', title: 'Spielzeit – fortlaufend', description: 'Die Spieluhr läuft über alle Halbzeiten beziehungsweise Teile weiter.' }
]

export function SettingsDialog({ open, jumpTimeMode, onJumpTimeModeChange, onClose }: SettingsDialogProps) {
  if (!open) return null

  return createPortal(
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section aria-labelledby="settings-dialog-title" aria-modal="true" className="modal-card settings-dialog" role="dialog" onClick={(event) => event.stopPropagation()}>
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">Einstellungen</p>
            <h2 id="settings-dialog-title">Zeiteingabe im Player</h2>
          </div>
          <button aria-label="Schließen" className="icon-button" type="button" onClick={onClose}>✕</button>
        </div>
        <p className="settings-dialog__intro">Wie soll eine spontan eingegebene Sprungzeit interpretiert werden? CSV- und Segmentzeiten bleiben immer direkte Videozeiten.</p>
        <fieldset className="settings-dialog__options">
          <legend>Zeitformat für Sprungziele</legend>
          {jumpTimeModes.map((mode) => (
            <label className="settings-dialog__option" key={mode.value}>
              <input type="radio" name="jump-time-mode" value={mode.value} checked={jumpTimeMode === mode.value} onChange={() => onJumpTimeModeChange(mode.value)} />
              <span><strong>{mode.title}</strong><small>{mode.description}</small></span>
            </label>
          ))}
        </fieldset>
      </section>
    </div>,
    document.body
  )
}
