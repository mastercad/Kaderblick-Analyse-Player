import { useEffect, useState } from 'react'
import { defaultAppInfo } from '../../../common/appInfo'
import { buildAppSettingsExport } from '../../../common/appSettings'
import { builtInFilterPresets, defaultFilterSettings } from '../../../common/filterPresets'
import { areFilterSettingsEqual, mergeCustomPresets, sanitizeFilterSettings } from '../../../common/filterUtils'
import { matchSegmentsToVideo, parseSegmentsCsv } from '../../../common/segmentUtils'
import type { AppInfo, CsvFileDescriptor, FilterPreset, FilterSettings, Segment, VideoFileDescriptor } from '../../../common/types'
import { AboutDialog } from '../features/app/AboutDialog'
import { StartScreen } from '../features/app/StartScreen'
import { FilterOverlay } from '../features/filters/FilterOverlay'
import { FilterPresetSaveDialog } from '../features/filters/FilterPresetSaveDialog'
import { LibraryToolbar } from '../features/library/LibraryToolbar'
import { VideoWorkspace } from '../features/player/VideoWorkspace'
import appLogo from '../../../../assets/icon.svg'

const defaultPresetId = builtInFilterPresets[0].id
const themeStorageKey = 'kaderblick-theme-mode'

type ThemeMode = 'light' | 'dark'

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const storedTheme = window.localStorage.getItem(themeStorageKey)
  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function App() {
  const [selectedVideo, setSelectedVideo] = useState<VideoFileDescriptor>()
  const [selectedCsv, setSelectedCsv] = useState<CsvFileDescriptor>()
  const [allSegments, setAllSegments] = useState<Segment[]>([])
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>([])
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({ ...defaultFilterSettings })
  const [selectedPresetId, setSelectedPresetId] = useState<string>(defaultPresetId)
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [statusMessage, setStatusMessage] = useState('Video und CSV laden, um mit der Analyse zu starten.')
  const [filterOverlayVisible, setFilterOverlayVisible] = useState(true)
  const [repeatSingleSegment, setRepeatSingleSegment] = useState(false)
  const [aboutDialogVisible, setAboutDialogVisible] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo>(defaultAppInfo)
  const [presetSaveDialogVisible, setPresetSaveDialogVisible] = useState(false)
  const [presetSaveMode, setPresetSaveMode] = useState<'new' | 'save'>('save')
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme)

  const presets = [...builtInFilterPresets, ...customPresets]
  const matchedSegments = selectedVideo ? matchSegmentsToVideo(allSegments, selectedVideo.fileName) : []
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? builtInFilterPresets[0]
  const showStartScreen = !selectedVideo && !selectedCsv
  const isPresetDirty = !areFilterSettingsEqual(selectedPreset.settings, filterSettings)

  useEffect(() => {
    let cancelled = false

    const loadPresets = async (): Promise<void> => {
      try {
        const storedPresets = await window.desktopApi.loadStoredPresets()
        const nextAppInfo = await window.desktopApi.getAppInfo()

        if (!cancelled) {
          setCustomPresets(storedPresets)
          setAppInfo(nextAppInfo)
        }
      } catch {
        if (!cancelled) {
          setStatusMessage('Ein Teil der App-Daten konnte nicht geladen werden. Die App laeuft trotzdem weiter.')
        }
      }
    }

    void loadPresets()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode
    document.documentElement.style.colorScheme = themeMode
    window.localStorage.setItem(themeStorageKey, themeMode)
  }, [themeMode])

  const persistCustomPresets = async (nextPresets: FilterPreset[], message?: string): Promise<void> => {
    setCustomPresets(nextPresets)
    await window.desktopApi.saveStoredPresets(nextPresets)
    if (message) {
      setStatusMessage(message)
    }
  }

  const handleLoadVideo = async (): Promise<void> => {
    const video = await window.desktopApi.pickVideoFile()

    if (!video) {
      return
    }

    setSelectedVideo(video)
    const segmentCount = matchSegmentsToVideo(allSegments, video.fileName).length
    setStatusMessage(`${video.fileName} geladen. ${segmentCount} passende Segmente gefunden.`)
  }

  const handleLoadCsv = async (): Promise<void> => {
    const csvFile = await window.desktopApi.pickCsvFile()

    if (!csvFile) {
      return
    }

    try {
      const parsedSegments = parseSegmentsCsv(csvFile.content)
      setSelectedCsv(csvFile)
      setAllSegments(parsedSegments)

      const segmentCount = selectedVideo ? matchSegmentsToVideo(parsedSegments, selectedVideo.fileName).length : 0
      setStatusMessage(`${csvFile.fileName} geladen. ${parsedSegments.length} Segmente importiert, ${segmentCount} davon passen zum aktuellen Video.`)
    } catch {
      setStatusMessage('Die CSV-Datei konnte nicht gelesen werden. Bitte Format und Spaltennamen pruefen.')
    }
  }

  const handleSettingChange = (key: keyof FilterSettings, value: number): void => {
    setFilterSettings((currentSettings) => sanitizeFilterSettings({ ...currentSettings, [key]: value }))
  }

  const handleResetFilters = (): void => {
    setFilterSettings({ ...defaultFilterSettings })
    setSelectedPresetId(defaultPresetId)
    setStatusMessage('Filter wurden auf die Standardwerte zurueckgesetzt.')
  }

  const applyPreset = (presetId: string): void => {
    const preset = presets.find((candidate) => candidate.id === presetId)
    if (!preset) {
      return
    }

    setSelectedPresetId(preset.id)
    setFilterSettings({ ...preset.settings })
    setStatusMessage(`Preset \"${preset.name}\" geladen.`)
  }

  const handleSaveNewPreset = async (): Promise<void> => {
    const trimmedName = presetNameDraft.trim()

    if (!trimmedName) {
      setStatusMessage('Bitte zuerst einen Namen fuer das neue Preset eintragen.')
      return
    }

    const conflictingPreset = presets.find((preset) => preset.name.trim().toLowerCase() === trimmedName.toLowerCase())
    if (conflictingPreset) {
      setStatusMessage('Ein Preset mit diesem Namen existiert bereits. Bitte einen anderen Namen verwenden.')
      return
    }

    const nextPreset: FilterPreset = {
      id: `custom-${Date.now()}`,
      name: trimmedName,
      builtIn: false,
      settings: { ...filterSettings }
    }

    const nextPresets = mergeCustomPresets(customPresets, [nextPreset])
    await persistCustomPresets(nextPresets, `Preset \"${trimmedName}\" gespeichert.`)
    setSelectedPresetId(nextPreset.id)
    setPresetNameDraft('')
    setPresetSaveDialogVisible(false)
  }

  const handleOverwritePreset = async (): Promise<void> => {
    if (selectedPreset.builtIn) {
      setStatusMessage('Mitgelieferte Presets koennen nicht ueberschrieben werden.')
      return
    }

    const nextPresets = customPresets.map((preset) => {
      if (preset.id !== selectedPreset.id) {
        return preset
      }

      return {
        ...preset,
        settings: { ...filterSettings }
      }
    })

    await persistCustomPresets(nextPresets, `Preset \"${selectedPreset.name}\" aktualisiert.`)
    setPresetSaveDialogVisible(false)
  }

  const handleDeletePreset = async (): Promise<void> => {
    if (selectedPreset.builtIn) {
      setStatusMessage('Mitgelieferte Presets koennen nicht geloescht werden.')
      return
    }

    const nextPresets = customPresets.filter((preset) => preset.id !== selectedPreset.id)
    await persistCustomPresets(nextPresets, `Preset \"${selectedPreset.name}\" geloescht.`)
    setSelectedPresetId(defaultPresetId)
  }

  const openNewPresetDialog = (): void => {
    setPresetSaveMode('new')
    setPresetNameDraft('')
    setPresetSaveDialogVisible(true)
  }

  const openSavePresetDialog = (): void => {
    if (!isPresetDirty) {
      return
    }

    setPresetSaveMode('save')
    setPresetNameDraft(selectedPreset.builtIn ? '' : selectedPreset.name)
    setPresetSaveDialogVisible(true)
  }

  const handleImportPresets = async (): Promise<void> => {
    const importedPresets = await window.desktopApi.importPresets()

    if (importedPresets.length === 0) {
      setStatusMessage('Es wurden keine Presets importiert.')
      return
    }

    const nextPresets = mergeCustomPresets(customPresets, importedPresets)
    await persistCustomPresets(nextPresets, `${importedPresets.length} Presets importiert.`)
  }

  const handleExportPresets = async (): Promise<void> => {
    const success = await window.desktopApi.exportPresets(customPresets)
    setStatusMessage(success ? 'Eigene Presets wurden exportiert.' : 'Preset-Export abgebrochen.')
  }

  const handleExportAppSettings = async (): Promise<void> => {
    const settingsSnapshot = buildAppSettingsExport({
      appInfo,
      selectedVideo,
      selectedCsv,
      matchedSegmentCount: matchedSegments.length,
      selectedPresetId,
      selectedPresetName: selectedPreset.name,
      filterOverlayVisible,
      repeatSingleSegment,
      filterSettings,
      customPresets
    })

    const success = await window.desktopApi.exportAppSettings(settingsSnapshot)
    setStatusMessage(success ? 'App-Einstellungen wurden als JSON exportiert.' : 'Export der App-Einstellungen abgebrochen.')
  }

  const toggleThemeMode = (): void => {
    setThemeMode((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
  }

  return (
    <div className={`shell ${showStartScreen ? 'shell--start' : 'shell--workspace'}`}>
      <header className="shell__header">
        <div className="shell__header-inner">
          <div className="brand-lockup">
            <div className="brand-mark">
              <img alt="Kaderblick Logo" className="brand-mark__logo" src={appLogo} />
              <div className="brand-mark__copy">
                <span className="brand-mark__word" aria-label="Kaderblick">
                  <span className="brand-mark__initial">K</span>
                  <span className="brand-mark__rest">ADERBLICK</span>
                </span>
                <span className="brand-mark__player">ANALYSE PLAYER</span>
              </div>
            </div>
            <div className="brand-copy">
              <p className="shell__eyebrow">Desktop-App</p>
              <h1>Intuitive Videoanalyse fuer Spielszenen und Segmente</h1>
              <p className="shell__subline">Klarer Player-Fokus mit Kaderblick Branding, Light- und Dark-Mode sowie direktem Zugriff auf Segmente und Bildfilter.</p>
            </div>
          </div>

          <div className="shell__header-side">
            <div className="button-stack shell__header-actions">
              <button
                aria-label={`Zu ${themeMode === 'dark' ? 'Light' : 'Dark'} Mode wechseln`}
                className="theme-toggle"
                type="button"
                onClick={toggleThemeMode}
              >
                <span className="theme-toggle__label">Modus</span>
                <span className="theme-toggle__value">{themeMode === 'dark' ? 'Dark' : 'Light'}</span>
                <span className={`theme-toggle__indicator theme-toggle__indicator--${themeMode}`} aria-hidden="true" />
              </button>
              <button className="button button--header" type="button" onClick={() => setAboutDialogVisible(true)}>
                Ueber die App
              </button>
              <button className="button button--header" type="button" onClick={() => void handleExportAppSettings()}>
                App-Einstellungen exportieren
              </button>
            </div>
            <p className="shell__status">{statusMessage}</p>
          </div>
        </div>
      </header>

      <div className="shell__content">
        <LibraryToolbar
          compact={!showStartScreen}
          selectedVideo={selectedVideo}
          selectedCsv={selectedCsv}
          matchedSegmentCount={matchedSegments.length}
          totalSegmentCount={allSegments.length}
          onLoadVideo={handleLoadVideo}
          onLoadCsv={handleLoadCsv}
        />

        <main className="layout layout--single">
          <section className="layout__main layout__main--full-width">
            {showStartScreen ? (
              <StartScreen
                appInfo={appInfo}
                onLoadVideo={handleLoadVideo}
                onLoadCsv={handleLoadCsv}
                onOpenAbout={() => setAboutDialogVisible(true)}
                onExportAppSettings={handleExportAppSettings}
              />
            ) : (
              <VideoWorkspace
                selectedVideo={selectedVideo}
                segments={matchedSegments}
                filterSettings={filterSettings}
                filterOverlayVisible={filterOverlayVisible}
                repeatSingleSegment={repeatSingleSegment}
                onRepeatSingleSegmentChange={setRepeatSingleSegment}
                onToggleFilterOverlay={() => setFilterOverlayVisible((visible) => !visible)}
                overlayDialogs={(
                  <>
                    <AboutDialog appInfo={appInfo} open={aboutDialogVisible} onClose={() => setAboutDialogVisible(false)} />
                    <FilterPresetSaveDialog
                      open={presetSaveDialogVisible}
                      mode={presetSaveMode}
                      presetNameDraft={presetNameDraft}
                      selectedPresetName={selectedPreset.name}
                      selectedPresetBuiltIn={selectedPreset.builtIn}
                      onClose={() => setPresetSaveDialogVisible(false)}
                      onPresetNameDraftChange={setPresetNameDraft}
                      onSaveAsNew={() => void handleSaveNewPreset()}
                      onOverwriteCurrent={selectedPreset.builtIn ? undefined : () => void handleOverwritePreset()}
                    />
                  </>
                )}
              >
                <FilterOverlay
                  visible={filterOverlayVisible}
                  settings={filterSettings}
                  presets={presets}
                  selectedPresetId={selectedPresetId}
                  isPresetDirty={isPresetDirty}
                  selectedPresetBuiltIn={selectedPreset.builtIn}
                  onChangeSetting={handleSettingChange}
                  onReset={handleResetFilters}
                  onSelectPreset={applyPreset}
                  onOpenNewPresetDialog={openNewPresetDialog}
                  onOpenSavePresetDialog={openSavePresetDialog}
                  onDeletePreset={handleDeletePreset}
                  onImportPresets={handleImportPresets}
                  onExportPresets={handleExportPresets}
                />
              </VideoWorkspace>
            )}
          </section>
        </main>
      </div>

      {showStartScreen ? <AboutDialog appInfo={appInfo} open={aboutDialogVisible} onClose={() => setAboutDialogVisible(false)} /> : null}
    </div>
  )
}
