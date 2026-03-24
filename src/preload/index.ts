import { contextBridge, ipcRenderer } from 'electron'
import type { DesktopApi } from './api'
import type { AppSettingsExport, FilterPreset } from '../common/types'

const desktopApi: DesktopApi = {
  pickVideoFile: () => ipcRenderer.invoke('dialog:pickVideoFile'),
  pickCsvFile: () => ipcRenderer.invoke('dialog:pickCsvFile'),
  loadStoredPresets: () => ipcRenderer.invoke('presets:load'),
  saveStoredPresets: (presets: FilterPreset[]) => ipcRenderer.invoke('presets:save', presets),
  exportPresets: (presets: FilterPreset[]) => ipcRenderer.invoke('presets:export', presets),
  importPresets: () => ipcRenderer.invoke('presets:import'),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  exportAppSettings: (settings: AppSettingsExport) => ipcRenderer.invoke('app:settings:export', settings)
}

contextBridge.exposeInMainWorld('desktopApi', desktopApi)
