import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { normalizeImportedPresets } from '../common/filterUtils'
import type { FilterPreset } from '../common/types'

const PRESET_FILE_NAME = 'filter-presets.json'

const getPresetFilePath = (): string => {
  return path.join(app.getPath('userData'), PRESET_FILE_NAME)
}

export const readStoredPresets = async (): Promise<FilterPreset[]> => {
  const presetFilePath = getPresetFilePath()

  try {
    const content = await fs.readFile(presetFilePath, 'utf-8')
    return normalizeImportedPresets(JSON.parse(content))
  } catch (error) {
    const typedError = error as NodeJS.ErrnoException
    if (typedError.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

export const writeStoredPresets = async (presets: FilterPreset[]): Promise<void> => {
  const presetFilePath = getPresetFilePath()
  await fs.mkdir(path.dirname(presetFilePath), { recursive: true })
  await fs.writeFile(presetFilePath, JSON.stringify(presets, null, 2), 'utf-8')
}
