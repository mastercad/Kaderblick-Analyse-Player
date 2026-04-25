import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, ipcMain, protocol } from 'electron'
import { defaultAppInfo } from '../common/appInfo'
import { KVIDEO_SCHEME } from '../common/streaming'
import type { AppSettingsExport, FilterPreset } from '../common/types'
import { exportAppSettingsToJson, importAppSettingsFromJson, exportPresetsToJson, importPresetsFromJson, pickCsvFile, pickVideoFile, pickVideoFiles, preparePlaybackFallbackForPath, saveCsvFile } from './dialogs'
import { readStoredPresets, writeStoredPresets } from './presetStorage'
import { initStreamingProtocol, registerStreamingProtocol } from './streamingProtocol'
import { ffmpegExecutable, getKeyframeTimes, prepareStreamingPlayback } from './videoPlayback'


protocol.registerSchemesAsPrivileged([{
  scheme: KVIDEO_SCHEME,
  privileges: {
    secure: true,
    standard: true,
    stream: true,
    supportFetchAPI: true,
    corsEnabled: true
  }
}])

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
    title: 'Kaderblick Analyse Player',
    icon: path.join(currentDirectory, '../../assets/icon.png'),
    width: 1480,
    height: 980,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(currentDirectory, '../preload/index.mjs'),
      sandbox: false,
      partition: 'persist:main',
      // In dev mode the renderer runs on http://localhost (Vite dev server).
      // Chromium blocks file:// video sources from http:// origins without this.
      // In production the renderer loads from file://, so the restriction doesn't apply.
      webSecurity: !process.env.ELECTRON_RENDERER_URL
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

  initStreamingProtocol(ffmpegExecutable)
  registerStreamingProtocol()

  ipcMain.handle('dialog:pickVideoFile', (event) => pickVideoFile(BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle('dialog:pickVideoFiles', (event) => pickVideoFiles(BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle('video:preparePlaybackFallback', (event, sourcePath: string) => {
    return preparePlaybackFallbackForPath(sourcePath, BrowserWindow.fromWebContents(event.sender))
  })
  ipcMain.handle('video:prepareStreamingPlayback', (_, sourcePath: string) => prepareStreamingPlayback(sourcePath))
  ipcMain.handle('video:getKeyframeTimes', (_, sourcePath: string) => getKeyframeTimes(sourcePath))
  ipcMain.handle('dialog:pickCsvFile', () => pickCsvFile())
  ipcMain.handle('dialog:saveCsvFile', (_, content: string) => saveCsvFile(content))
  ipcMain.handle('presets:load', () => readStoredPresets())
  ipcMain.handle('presets:save', (_, presets: FilterPreset[]) => writeStoredPresets(presets))
  ipcMain.handle('presets:export', (_, presets: FilterPreset[]) => exportPresetsToJson(presets))
  ipcMain.handle('presets:import', () => importPresetsFromJson())
  ipcMain.handle('app:info', () => ({
    ...defaultAppInfo,
    version: app.getVersion()
  }))
  ipcMain.handle('app:settings:export', (_, settings: AppSettingsExport) => exportAppSettingsToJson(settings))
  ipcMain.handle('app:settings:import', () => importAppSettingsFromJson())

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

