import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from './api'
import type { AppSettingsExport, FilterPreset, VideoPreparationProgress } from '../common/types'

const desktopApi: DesktopApi = {
  pickVideoFile: () => ipcRenderer.invoke('dialog:pickVideoFile'),
  pickVideoFiles: () => ipcRenderer.invoke('dialog:pickVideoFiles'),
  preparePlaybackFallback: (sourcePath: string) => ipcRenderer.invoke('video:preparePlaybackFallback', sourcePath),
  prepareStreamingPlayback: (sourcePath: string) => ipcRenderer.invoke('video:prepareStreamingPlayback', sourcePath),
  getKeyframeTimes: (sourcePath: string) => ipcRenderer.invoke('video:getKeyframeTimes', sourcePath),
  pickCsvFile: () => ipcRenderer.invoke('dialog:pickCsvFile'),
  saveCsvFile: (content: string) => ipcRenderer.invoke('dialog:saveCsvFile', content),
  loadStoredPresets: () => ipcRenderer.invoke('presets:load'),
  saveStoredPresets: (presets: FilterPreset[]) => ipcRenderer.invoke('presets:save', presets),
  exportPresets: (presets: FilterPreset[]) => ipcRenderer.invoke('presets:export', presets),
  importPresets: () => ipcRenderer.invoke('presets:import'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  exportAppSettings: (settings: AppSettingsExport) => ipcRenderer.invoke('app:settings:export', settings),
  importAppSettings: () => ipcRenderer.invoke('app:settings:import'),
  onVideoPreparationProgress: (listener) => {
    const handleProgress = (_event: Electron.IpcRendererEvent, progress: VideoPreparationProgress): void => {
      listener(progress)
    }

    ipcRenderer.on('video:preparationProgress', handleProgress)
    return () => ipcRenderer.removeListener('video:preparationProgress', handleProgress)
  }
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
