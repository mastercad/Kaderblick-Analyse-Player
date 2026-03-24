import type { FilterPreset, FilterSettings } from './types'

export const defaultFilterSettings: FilterSettings = {
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  hueRotate: 0,
  invert: 0,
  saturate: 100,
  sepia: 0
}

export const builtInFilterPresets: FilterPreset[] = [
  {
    id: 'preset-default',
    name: 'Default',
    builtIn: true,
    settings: { ...defaultFilterSettings }
  },
  {
    id: 'preset-low-light',
    name: 'Schlechte Beleuchtung',
    builtIn: true,
    settings: {
      blur: 0,
      brightness: 122,
      contrast: 116,
      grayscale: 0,
      hueRotate: 0,
      invert: 0,
      saturate: 118,
      sepia: 0
    }
  },
  {
    id: 'preset-foggy',
    name: 'Flaues Bild',
    builtIn: true,
    settings: {
      blur: 0.4,
      brightness: 108,
      contrast: 138,
      grayscale: 0,
      hueRotate: 0,
      invert: 0,
      saturate: 128,
      sepia: 4
    }
  },
  {
    id: 'preset-referee',
    name: 'Trikot und Linien',
    builtIn: true,
    settings: {
      blur: 0,
      brightness: 104,
      contrast: 130,
      grayscale: 0,
      hueRotate: 0,
      invert: 0,
      saturate: 140,
      sepia: 0
    }
  }
]
