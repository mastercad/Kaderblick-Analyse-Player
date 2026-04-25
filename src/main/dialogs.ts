import { promises as fs } from 'node:fs'
import path from 'node:path'
import { BrowserWindow, dialog } from 'electron'
import { normalizeImportedPresets } from '../common/filterUtils'
import type { AppSettingsExport, CsvFileDescriptor, FilterPreset, VideoFileDescriptor } from '../common/types'
import { preparePlaybackFallback, prepareVideoFileForPlayback } from './videoPlayback'

const videoExtensions = ['mp4', 'mov', 'mkv', 'avi', 'm4v', 'webm']

const getActiveWindow = (): BrowserWindow | null => {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

export const pickVideoFile = async (ownerWindow?: BrowserWindow | null): Promise<VideoFileDescriptor | undefined> => {
  const activeWindow = ownerWindow ?? getActiveWindow()

  const result = await dialog.showOpenDialog(activeWindow, {
    title: 'Video auswahlen',
    properties: ['openFile'],
    filters: [
      {
        name: 'Video',
        extensions: videoExtensions
      },
      {
        name: 'Alle Dateien',
        extensions: ['*']
      }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return undefined
  }

  const selectedPath = result.filePaths[0]
  return prepareVideoFileForPlayback(selectedPath, {
    onProgress: (progress) => activeWindow?.webContents.send('video:preparationProgress', progress)
  })
}

export const pickVideoFiles = async (ownerWindow?: BrowserWindow | null): Promise<VideoFileDescriptor[]> => {
  const activeWindow = ownerWindow ?? getActiveWindow()

  const result = await dialog.showOpenDialog(activeWindow ?? undefined, {
    title: 'Videos auswählen',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Video',
        extensions: videoExtensions
      },
      {
        name: 'Alle Dateien',
        extensions: ['*']
      }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const videos: VideoFileDescriptor[] = []
  const failures: string[] = []
  for (const filePath of result.filePaths) {
    try {
      const video = await prepareVideoFileForPlayback(filePath, {
        onProgress: (progress) => activeWindow?.webContents.send('video:preparationProgress', progress)
      })
      videos.push(video)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      failures.push(`"${path.basename(filePath)}": ${detail}`)
      console.warn(`Video konnte nicht vorbereitet werden: ${filePath}`, error)
    }
  }

  if (videos.length === 0) {
    await dialog.showMessageBox(activeWindow ?? undefined, {
      type: 'error',
      title: 'Video konnte nicht geladen werden',
      message: 'Die ausgewählte Datei konnte nicht geöffnet werden.',
      detail: failures.join('\n'),
      buttons: ['OK']
    })
    throw new Error(failures.join('\n'))
  }

  return videos
}

export const preparePlaybackFallbackForPath = async (
  sourcePath: string,
  ownerWindow?: BrowserWindow | null
): Promise<VideoFileDescriptor> => {
  const activeWindow = ownerWindow ?? getActiveWindow()

  return preparePlaybackFallback(sourcePath, {
    onProgress: (progress) => activeWindow?.webContents.send('video:preparationProgress', progress)
  })
}

export const pickCsvFile = async (): Promise<CsvFileDescriptor | undefined> => {
  const result = await dialog.showOpenDialog(getActiveWindow(), {
    title: 'Segmentdatei auswahlen',
    properties: ['openFile'],
    filters: [
      {
        name: 'CSV',
        extensions: ['csv']
      }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return undefined
  }

  const selectedPath = result.filePaths[0]
  const content = await fs.readFile(selectedPath, 'utf-8')

  return {
    path: selectedPath,
    fileName: path.basename(selectedPath),
    content
  }
}

export const exportPresetsToJson = async (presets: FilterPreset[]): Promise<boolean> => {
  const result = await dialog.showSaveDialog(getActiveWindow(), {
    title: 'Presets exportieren',
    defaultPath: 'filter-presets.json',
    filters: [
      {
        name: 'JSON',
        extensions: ['json']
      }
    ]
  })

  if (result.canceled || !result.filePath) {
    return false
  }

  await fs.writeFile(result.filePath, JSON.stringify(presets, null, 2), 'utf-8')
  return true
}

export const saveCsvFile = async (content: string, suggestedName = 'segmente.csv'): Promise<boolean> => {
  const result = await dialog.showSaveDialog(getActiveWindow(), {
    title: 'Segmente als CSV speichern',
    defaultPath: suggestedName,
    filters: [
      { name: 'CSV', extensions: ['csv'] },
      { name: 'Alle Dateien', extensions: ['*'] }
    ]
  })

  if (result.canceled || !result.filePath) {
    return false
  }

  await fs.writeFile(result.filePath, content, 'utf-8')
  return true
}

export const importPresetsFromJson = async (): Promise<FilterPreset[]> => {
  const result = await dialog.showOpenDialog(getActiveWindow(), {
    title: 'Presets importieren',
    properties: ['openFile'],
    filters: [
      {
        name: 'JSON',
        extensions: ['json']
      }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return []
  }

  const content = await fs.readFile(result.filePaths[0], 'utf-8')
  return normalizeImportedPresets(JSON.parse(content))
}

export const importAppSettingsFromJson = async (): Promise<AppSettingsExport | null> => {
  const result = await dialog.showOpenDialog(getActiveWindow(), {
    title: 'Sitzung importieren',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const content = await fs.readFile(result.filePaths[0], 'utf-8')
  const parsed: unknown = JSON.parse(content)

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).filterSettings !== 'object'
  ) {
    throw new Error('Die Datei enthält keine gültige Sitzungsdatei.')
  }

  return parsed as AppSettingsExport
}

export const exportAppSettingsToJson = async (settings: AppSettingsExport): Promise<boolean> => {
  const result = await dialog.showSaveDialog(getActiveWindow(), {
    title: 'App-Einstellungen exportieren',
    defaultPath: 'kaderblick-app-einstellungen.json',
    filters: [
      {
        name: 'JSON',
        extensions: ['json']
      }
    ]
  })

  if (result.canceled || !result.filePath) {
    return false
  }

  await fs.writeFile(result.filePath, JSON.stringify(settings, null, 2), 'utf-8')
  return true
}
