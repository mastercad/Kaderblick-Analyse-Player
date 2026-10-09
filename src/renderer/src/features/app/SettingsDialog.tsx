import { createPortal } from 'react-dom'
import { PLAYER_JUMP_TIME_MODE_OPTIONS } from '../../../../common/playerJumpTimeModes'
import type { PlayerJumpTimeMode } from '../../../../common/types'

interface SettingsDialogProps {
  open: boolean
  jumpTimeMode: PlayerJumpTimeMode
  onJumpTimeModeChange: (mode: PlayerJumpTimeMode) => void
  onClose: () => void
}

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
        <p className="settings-dialog__intro">Wie sollen Sprungzeiten und die unverändert gespeicherten Segmentzeiten bei der Wiedergabe interpretiert werden?</p>
        <fieldset className="settings-dialog__options">
          <legend>Zeitformat für Sprungziele</legend>
          {PLAYER_JUMP_TIME_MODE_OPTIONS.map((mode) => (
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
