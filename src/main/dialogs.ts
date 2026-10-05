import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import { normalizeImportedPresets } from '../common/filterUtils'
import type { AppSettingsExport, CsvFileDescriptor, FilterPreset, ScreenshotSaveResult, VideoFileDescriptor } from '../common/types'
import { preparePlaybackFallback, prepareVideoFileForPlayback } from './videoPlayback'

const videoExtensions = ['mp4', 'mov', 'mkv', 'avi', 'm4v', 'webm']

const getActiveWindow = (): BrowserWindow | null => {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null
}

const screenshotTimestamp = (date: Date): string => {
  const pad = (value: number, length = 2): string => String(value).padStart(length, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + '_' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    pad(date.getMilliseconds(), 3)
  ].join('-')
}

const sanitizeScreenshotBaseName = (value: string): string => {
  return value
    .replace(/\.png$/i, '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100) || 'video'
}

export const captureAndSaveScreenshot = async (
  imageBytes: Uint8Array,
  suggestedBaseName: string
): Promise<ScreenshotSaveResult> => {
  const png = Buffer.from(imageBytes)
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (png.length < pngSignature.length || !pngSignature.every((byte, index) => png[index] === byte)) {
    throw new Error('Die Screenshot-Daten sind kein gültiges PNG.')
  }

  const screenshotDirectory = path.join(app.getPath('pictures'), 'Kaderblick Screenshots')
  await fs.mkdir(screenshotDirectory, { recursive: true })
  const baseName = `${sanitizeScreenshotBaseName(suggestedBaseName)}_${screenshotTimestamp(new Date())}`

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`
    const filePath = path.join(screenshotDirectory, `${baseName}${suffix}.png`)
    try {
      await fs.writeFile(filePath, png, { flag: 'wx' })
      return { filePath }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
  }

  throw new Error('Für den Screenshot konnte kein eindeutiger Dateiname erzeugt werden.')
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
