interface FilterPresetSaveDialogProps {
  open: boolean
  mode: 'new' | 'save'
  presetNameDraft: string
  selectedPresetName: string
  selectedPresetBuiltIn: boolean
  onClose: () => void
  onPresetNameDraftChange: (value: string) => void
  onSaveAsNew: () => void
  onOverwriteCurrent?: () => void
}

export function FilterPresetSaveDialog({
  open,
  mode,
  presetNameDraft,
  selectedPresetName,
  selectedPresetBuiltIn,
  onClose,
  onPresetNameDraftChange,
  onSaveAsNew,
  onOverwriteCurrent
}: FilterPresetSaveDialogProps) {
  if (!open) {
    return null
  }

  const showOverwriteOption = mode === 'save' && !selectedPresetBuiltIn && Boolean(onOverwriteCurrent)

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-card modal-card--narrow" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">Filter-Preset speichern</p>
            <h2>{mode === 'new' ? 'Neues Preset anlegen' : 'Preset speichern'}</h2>
          </div>
          <button className="button" type="button" onClick={onClose}>
            Schliessen
          </button>
        </div>

        <p className="about-text">
          {showOverwriteOption
            ? `Du kannst das aktuelle Preset \"${selectedPresetName}\" ueberschreiben oder die Veraenderungen als neues Preset ablegen.`
            : 'Vergib einen Namen fuer das neue Preset und speichere die aktuellen Filterwerte.'}
        </p>

        <label className="form-field">
          <span>Name fuer neues Preset</span>
          <input
            type="text"
            value={presetNameDraft}
            placeholder="z. B. Abendspiel Kamera 2"
            onChange={(event) => onPresetNameDraftChange(event.target.value)}
          />
        </label>

        <div className="button-stack modal-card__actions">
          {showOverwriteOption ? (
            <button className="button" type="button" onClick={onOverwriteCurrent}>
              Aktuelles Preset ueberschreiben
            </button>
          ) : null}
          <button className="button button--primary" type="button" onClick={onSaveAsNew}>
            Als neues Preset speichern
          </button>
        </div>
      </section>
    </div>
  )
}
