import type { FilterPreset, FilterSettings } from '../../../../common/types'

interface FilterOverlayProps {
  visible: boolean
  settings: FilterSettings
  presets: FilterPreset[]
  selectedPresetId: string
  isPresetDirty: boolean
  selectedPresetBuiltIn: boolean
  onChangeSetting: (key: keyof FilterSettings, value: number) => void
  onReset: () => void
  onSelectPreset: (presetId: string) => void
  onOpenNewPresetDialog: () => void
  onOpenSavePresetDialog: () => void
  onDeletePreset: () => Promise<void>
  onImportPresets: () => Promise<void>
  onExportPresets: () => Promise<void>
}

const controls: Array<{
  key: keyof FilterSettings
  label: string
  min: number
  max: number
  step: number
  unit: string
}> = [
  { key: 'blur', label: 'Gaussian Blur', min: 0, max: 20, step: 0.1, unit: 'px' },
  { key: 'brightness', label: 'Brightness', min: 0, max: 300, step: 1, unit: '%' },
  { key: 'contrast', label: 'Contrast', min: 0, max: 300, step: 1, unit: '%' },
  { key: 'grayscale', label: 'Grayscale', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'hueRotate', label: 'Hue Rotation', min: 0, max: 360, step: 1, unit: 'deg' },
  { key: 'invert', label: 'Color Inversion', min: 0, max: 100, step: 1, unit: '%' },
  { key: 'saturate', label: 'Saturation', min: 0, max: 300, step: 1, unit: '%' },
  { key: 'sepia', label: 'Sepia', min: 0, max: 100, step: 1, unit: '%' }
]

function SaveIcon() {
  return (
    <svg aria-hidden="true" className="icon-button__icon" viewBox="0 0 24 24">
      <path
        d="M5 4h11l3 3v13H5zM8 4v6h8V4M8 20v-6h8v6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

export function FilterOverlay({
  visible,
  settings,
  presets,
  selectedPresetId,
  isPresetDirty,
  selectedPresetBuiltIn,
  onChangeSetting,
  onReset,
  onSelectPreset,
  onOpenNewPresetDialog,
  onOpenSavePresetDialog,
  onDeletePreset,
  onImportPresets,
  onExportPresets
}: FilterOverlayProps) {
  return (
    <div className={`filter-overlay ${visible ? 'filter-overlay--visible' : 'filter-overlay--hidden'}`}>
      <div className="filter-overlay__header">
        <div>
          <p className="panel__eyebrow">Live-Filter</p>
          <h2>Kompakte Bildkorrektur</h2>
        </div>
        <div className="filter-preset-bar">
          <label className="filter-preset-bar__select-wrap">
            <span className="filter-preset-bar__label">Preset</span>
            <select value={selectedPresetId} onChange={(event) => onSelectPreset(event.target.value)}>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                  {preset.builtIn ? ' (mitgeliefert)' : ''}
                </option>
              ))}
            </select>
          </label>
          <button aria-label="Neues Preset" className="icon-button" type="button" onClick={onOpenNewPresetDialog}>
            +
          </button>
          <button
            aria-label="Preset speichern"
            className={`icon-button ${isPresetDirty ? 'icon-button--dirty' : ''}`}
            disabled={!isPresetDirty}
            type="button"
            onClick={onOpenSavePresetDialog}
          >
            <SaveIcon />
          </button>
          <span className={`dirty-flag ${isPresetDirty ? 'dirty-flag--visible' : ''}`}>
            {isPresetDirty ? 'Nicht gespeichert' : 'Gespeichert'}
          </span>
        </div>
      </div>

      <div className="filter-overlay__subactions">
        <button className="button button--subtle" type="button" onClick={onReset}>
          Reset
        </button>
        <button className="button button--subtle" type="button" onClick={() => void onImportPresets()}>
          Import
        </button>
        <button className="button button--subtle" type="button" onClick={() => void onExportPresets()}>
          Export
        </button>
        <button className="button button--subtle" disabled={selectedPresetBuiltIn} type="button" onClick={() => void onDeletePreset()}>
          Loeschen
        </button>
      </div>

      <div className="filter-grid filter-grid--compact">
        {controls.map((control) => (
          <label className="slider-row" key={control.key}>
            <span className="slider-row__label">{control.label}</span>
            <strong className="slider-row__value">
                {settings[control.key]}
                {control.unit}
            </strong>
            <input
              type="range"
              min={control.min}
              max={control.max}
              step={control.step}
              value={settings[control.key]}
              onChange={(event) => onChangeSetting(control.key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
