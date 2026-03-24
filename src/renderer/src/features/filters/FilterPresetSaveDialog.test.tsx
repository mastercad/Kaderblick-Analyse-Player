import { fireEvent, render, screen } from '@testing-library/react'
import { FilterPresetSaveDialog } from './FilterPresetSaveDialog'

describe('FilterPresetSaveDialog', () => {
  it('shows overwrite and new-save actions for editable presets', () => {
    render(
      <FilterPresetSaveDialog
        open
        mode="save"
        presetNameDraft="Abendspiel"
        selectedPresetName="Abendspiel"
        selectedPresetBuiltIn={false}
        onClose={() => undefined}
        onPresetNameDraftChange={() => undefined}
        onSaveAsNew={() => undefined}
        onOverwriteCurrent={() => undefined}
      />
    )

    expect(screen.getByRole('button', { name: 'Aktuelles Preset ueberschreiben' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Als neues Preset speichern' })).toBeInTheDocument()
  })

  it('updates the preset name input', () => {
    const onPresetNameDraftChange = vi.fn()

    render(
      <FilterPresetSaveDialog
        open
        mode="new"
        presetNameDraft=""
        selectedPresetName="Default"
        selectedPresetBuiltIn
        onClose={() => undefined}
        onPresetNameDraftChange={onPresetNameDraftChange}
        onSaveAsNew={() => undefined}
      />
    )

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Nachtspiel' } })

    expect(onPresetNameDraftChange).toHaveBeenCalledWith('Nachtspiel')
  })
})