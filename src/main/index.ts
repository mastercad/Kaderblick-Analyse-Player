import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain } from 'electron'
import { defaultAppInfo } from '../common/appInfo'
import type { AppSettingsExport, FilterPreset } from '../common/types'
import { exportAppSettingsToJson, exportPresetsToJson, importPresetsFromJson, pickCsvFile, pickVideoFile } from './dialogs'
import { readStoredPresets, writeStoredPresets } from './presetStorage'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    title: 'Kaderblick Analyse Player',
    width: 1480,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(currentDirectory, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(currentDirectory, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  app.setAppUserModelId('de.fussballverein.video-player')

  ipcMain.handle('dialog:pickVideoFile', () => pickVideoFile())
  ipcMain.handle('dialog:pickCsvFile', () => pickCsvFile())
  ipcMain.handle('presets:load', () => readStoredPresets())
  ipcMain.handle('presets:save', (_, presets: FilterPreset[]) => writeStoredPresets(presets))
  ipcMain.handle('presets:export', (_, presets: FilterPreset[]) => exportPresetsToJson(presets))
  ipcMain.handle('presets:import', () => importPresetsFromJson())
  ipcMain.handle('app:info', () => ({
    ...defaultAppInfo,
    version: app.getVersion()
  }))
  ipcMain.handle('app:settings:export', (_, settings: AppSettingsExport) => exportAppSettingsToJson(settings))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

