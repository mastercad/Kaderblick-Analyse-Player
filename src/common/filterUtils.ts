import { defaultFilterSettings } from './filterPresets'
import type { FilterPreset, FilterSettings } from './types'

export const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

export const sanitizeFilterSettings = (settings: Partial<FilterSettings>): FilterSettings => {
  return {
    blur: clamp(settings.blur ?? defaultFilterSettings.blur, 0, 20),
    brightness: clamp(settings.brightness ?? defaultFilterSettings.brightness, 0, 300),
    contrast: clamp(settings.contrast ?? defaultFilterSettings.contrast, 0, 300),
    grayscale: clamp(settings.grayscale ?? defaultFilterSettings.grayscale, 0, 100),
    hueRotate: clamp(settings.hueRotate ?? defaultFilterSettings.hueRotate, 0, 360),
    invert: clamp(settings.invert ?? defaultFilterSettings.invert, 0, 100),
    saturate: clamp(settings.saturate ?? defaultFilterSettings.saturate, 0, 300),
    sepia: clamp(settings.sepia ?? defaultFilterSettings.sepia, 0, 100)
  }
}

export const buildCssFilter = (settings: FilterSettings): string => {
  return [
    `blur(${settings.blur}px)`,
    `brightness(${settings.brightness}%)`,
    `contrast(${settings.contrast}%)`,
    `grayscale(${settings.grayscale}%)`,
    `hue-rotate(${settings.hueRotate}deg)`,
    `invert(${settings.invert}%)`,
    `saturate(${settings.saturate}%)`,
    `sepia(${settings.sepia}%)`
  ].join(' ')
}

export const areFilterSettingsEqual = (left: FilterSettings, right: FilterSettings): boolean => {
  return (
    left.blur === right.blur &&
    left.brightness === right.brightness &&
    left.contrast === right.contrast &&
    left.grayscale === right.grayscale &&
    left.hueRotate === right.hueRotate &&
    left.invert === right.invert &&
    left.saturate === right.saturate &&
    left.sepia === right.sepia
  )
}

export const normalizeImportedPresets = (presets: unknown): FilterPreset[] => {
  if (!Array.isArray(presets)) {
    return []
  }

  return presets
    .map((preset, index) => {
      if (!preset || typeof preset !== 'object') {
        return undefined
      }

      const candidate = preset as Partial<FilterPreset>
      const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''

      if (!name) {
        return undefined
      }

      return {
        id: typeof candidate.id === 'string' && candidate.id.trim() ? candidate.id : `imported-${index}-${name}`,
        name,
        builtIn: false,
        settings: sanitizeFilterSettings(candidate.settings ?? {})
      } satisfies FilterPreset
    })
    .filter((preset): preset is FilterPreset => Boolean(preset))
}

export const mergeCustomPresets = (
  currentPresets: FilterPreset[],
  importedPresets: FilterPreset[]
): FilterPreset[] => {
  const mergedMap = new Map<string, FilterPreset>()

  currentPresets.forEach((preset) => {
    mergedMap.set(preset.name.toLowerCase(), preset)
  })

  importedPresets.forEach((preset) => {
    mergedMap.set(preset.name.toLowerCase(), { ...preset, builtIn: false })
  })

  return Array.from(mergedMap.values()).sort((left, right) => left.name.localeCompare(right.name, 'de'))
}
