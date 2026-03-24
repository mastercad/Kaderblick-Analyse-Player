import { areFilterSettingsEqual, buildCssFilter, mergeCustomPresets, normalizeImportedPresets, sanitizeFilterSettings } from './filterUtils'

describe('filterUtils', () => {
  it('clamps filter values into safe ranges', () => {
    const sanitized = sanitizeFilterSettings({
      blur: -2,
      brightness: 450,
      contrast: 200,
      grayscale: 500,
      hueRotate: 520,
      invert: -10,
      saturate: 999,
      sepia: 90
    })

    expect(sanitized).toEqual({
      blur: 0,
      brightness: 300,
      contrast: 200,
      grayscale: 100,
      hueRotate: 360,
      invert: 0,
      saturate: 300,
      sepia: 90
    })
  })

  it('builds a CSS filter string for the video element', () => {
    expect(
      buildCssFilter({
        blur: 1,
        brightness: 110,
        contrast: 120,
        grayscale: 0,
        hueRotate: 30,
        invert: 0,
        saturate: 150,
        sepia: 5
      })
    ).toContain('brightness(110%)')
  })

  it('normalizes imported presets and ignores invalid entries', () => {
    const presets = normalizeImportedPresets([
      {
        name: 'Analyse',
        settings: {
          brightness: 120
        }
      },
      {},
      null
    ])

    expect(presets).toHaveLength(1)
    expect(presets[0].settings.brightness).toBe(120)
  })

  it('merges imported presets by name', () => {
    const merged = mergeCustomPresets(
      [
        {
          id: 'a',
          name: 'Abendspiel',
          builtIn: false,
          settings: sanitizeFilterSettings({ brightness: 120 })
        }
      ],
      [
        {
          id: 'b',
          name: 'Abendspiel',
          builtIn: false,
          settings: sanitizeFilterSettings({ brightness: 130 })
        }
      ]
    )

    expect(merged).toHaveLength(1)
    expect(merged[0].settings.brightness).toBe(130)
  })

  it('detects dirty filter settings compared with a preset', () => {
    const baseline = sanitizeFilterSettings({ brightness: 120, contrast: 115 })

    expect(areFilterSettingsEqual(baseline, sanitizeFilterSettings({ brightness: 120, contrast: 115 }))).toBe(true)
    expect(areFilterSettingsEqual(baseline, sanitizeFilterSettings({ brightness: 126, contrast: 115 }))).toBe(false)
  })
})
