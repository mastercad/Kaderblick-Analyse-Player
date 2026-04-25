import { useCallback, useEffect, useRef, useState } from 'react'
import { defaultAppInfo } from '../../../common/appInfo'
import { buildAppSettingsExport } from '../../../common/appSettings'
import { builtInFilterPresets, defaultFilterSettings } from '../../../common/filterPresets'
import { areFilterSettingsEqual, mergeCustomPresets, sanitizeFilterSettings } from '../../../common/filterUtils'
import { matchSegmentsToVideo, matchSegmentsToVideos, parseSegmentsCsv, interpolateSegmentTitles } from '../../../common/segmentUtils'
import { formatClockTime } from '../../../common/timeUtils'
import type { AppInfo, AppSettingsExport, CsvFileDescriptor, FilterPreset, FilterSettings, Segment, SessionSnapshot, VideoFileDescriptor, VideoPreparationProgress } from '../../../common/types'
import { AboutDialog } from '../features/app/AboutDialog'
import { SessionRestoreDialog } from '../features/app/SessionRestoreDialog'
import { StartScreen } from '../features/app/StartScreen'
import { FilterOverlay } from '../features/filters/FilterOverlay'
import { FilterPresetSaveDialog } from '../features/filters/FilterPresetSaveDialog'
import { CodecStreamingDialog } from '../features/player/CodecStreamingDialog'
import { SegmentEditor } from '../features/player/SegmentEditor'
import { LibraryToolbar } from '../features/library/LibraryToolbar'
import { VideoWorkspace } from '../features/player/VideoWorkspace'
import appLogo from '../../../../assets/icon.png'

const defaultPresetId = builtInFilterPresets[0].id
const themeStorageKey = 'kaderblick-theme-mode'
const sessionTitleStorageKey = 'kaderblick-session-title'
const interstitialDurationStorageKey = 'kaderblick-interstitial-duration'
const interstitialLogoStorageKey = 'kaderblick-interstitial-logo'
const sessionSnapshotKey = 'kaderblick-session-snapshot'

function loadStoredSessionSnapshot(): SessionSnapshot | null {
  try {
    const raw = window.localStorage.getItem(sessionSnapshotKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionSnapshot
    // Minimal validation: must have at least one video or a CSV
    if (!Array.isArray(parsed.videoLibrary) || (parsed.videoLibrary.length === 0 && !parsed.csvFileName)) return null
    return parsed
  } catch {
    return null
  }
}

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
  const [videoLibrary, setVideoLibrary] = useState<VideoFileDescriptor[]>([])
  const [activeVideoIndex, setActiveVideoIndex] = useState(0)
  const [autoStartSegmentsOnLoad, setAutoStartSegmentsOnLoad] = useState(false)
  const [selectedCsv, setSelectedCsv] = useState<CsvFileDescriptor>()
  const [allSegments, setAllSegments] = useState<Segment[]>([])
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>([])
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({ ...defaultFilterSettings })
  const [selectedPresetId, setSelectedPresetId] = useState<string>(defaultPresetId)
  const [presetNameDraft, setPresetNameDraft] = useState('')
  const [statusMessage, setStatusMessage] = useState('Video und CSV laden, um mit der Analyse zu starten.')
  const [filterOverlayVisible, setFilterOverlayVisible] = useState(false)
  const [repeatSingleSegment, setRepeatSingleSegment] = useState(false)
  const [aboutDialogVisible, setAboutDialogVisible] = useState(false)
  const [appInfo, setAppInfo] = useState<AppInfo>(defaultAppInfo)
  const [presetSaveDialogVisible, setPresetSaveDialogVisible] = useState(false)
  const [presetSaveMode, setPresetSaveMode] = useState<'new' | 'save'>('save')
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialTheme)
  const [videoPreparationProgress, setVideoPreparationProgress] = useState<VideoPreparationProgress>({
    phase: 'idle',
    message: ''
  })
  const [isRecoveringPlayback, setIsRecoveringPlayback] = useState(false)
  const [autoPlayRecoveredVideo, setAutoPlayRecoveredVideo] = useState(false)
  const [autoStartSegmentsFromEnd, setAutoStartSegmentsFromEnd] = useState(false)
  const [streamingConfirmFor, setStreamingConfirmFor] = useState<{ video: VideoFileDescriptor; index: number } | null>(null)
  const [segmentEditorOpen, setSegmentEditorOpen] = useState(false)
  const [sessionRestorePrompt, setSessionRestorePrompt] = useState<SessionSnapshot | null>(() => loadStoredSessionSnapshot())
  const videoCurrentTimeRef = useRef(0)
  const isSegmentModeRef = useRef(false)
  const isPlayingRef = useRef(false)
  const handlePlayStateChange = useCallback((playing: boolean) => { isPlayingRef.current = playing }, [])
  const [sessionTitle, setSessionTitle] = useState<string>(() =>
    typeof window !== 'undefined' ? (window.localStorage.getItem(sessionTitleStorageKey) ?? '') : ''
  )
  const isRecoveringPlaybackRef = useRef(false)
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const headerMenuRef = useRef<HTMLDivElement>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [interstitialDuration, setInterstitialDuration] = useState<number>(() => {
    const stored = window.localStorage.getItem(interstitialDurationStorageKey)
    const n = Number(stored)
    return Number.isFinite(n) && n >= 1 && n <= 5 ? n : 3
  })
  const [interstitialLogoDataUrl, setInterstitialLogoDataUrl] = useState<string | null>(() =>
    window.localStorage.getItem(interstitialLogoStorageKey)
  )

  useEffect(() => {
    if (!headerMenuOpen) return
    const handleClickOutside = (e: MouseEvent): void => {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [headerMenuOpen])

  const handleSessionTitleChange = (title: string): void => {
    setSessionTitle(title)
    window.localStorage.setItem(sessionTitleStorageKey, title)
  }

  const handlePickInterstitialLogo = (): void => {
    setHeaderMenuOpen(false)
    logoInputRef.current?.click()
  }

  const handleLogoFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setInterstitialLogoDataUrl(dataUrl)
      window.localStorage.setItem(interstitialLogoStorageKey, dataUrl)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handleRemoveInterstitialLogo = (): void => {
    setInterstitialLogoDataUrl(null)
    window.localStorage.removeItem(interstitialLogoStorageKey)
    setHeaderMenuOpen(false)
  }

  const handleSetInterstitialDuration = (seconds: number): void => {
    setInterstitialDuration(seconds)
    window.localStorage.setItem(interstitialDurationStorageKey, String(seconds))
  }

  const selectedVideo = videoLibrary[activeVideoIndex]
  const presets = [...builtInFilterPresets, ...customPresets]
  const matchedSegments = selectedVideo ? matchSegmentsToVideo(allSegments, selectedVideo.fileName) : []
  // Interpolated segments: empty titles filled from last non-empty title — for interstitial display only
  const displaySegments = interpolateSegmentTitles(matchedSegments)
  const matchedSegmentsAllVideos = videoLibrary.length > 0 ? matchSegmentsToVideos(allSegments, videoLibrary.map((v) => v.fileName)) : []
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? builtInFilterPresets[0]
  const showStartScreen = videoLibrary.length === 0 && !selectedCsv
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

  useEffect(() => {
    return window.desktopApi.onVideoPreparationProgress((progress) => {
      if (progress.phase === 'idle') {
        setVideoPreparationProgress(progress)
        return
      }

      if (progress.phase === 'ready') {
        setVideoPreparationProgress({ phase: 'idle', message: '' })
        setStatusMessage(progress.message)
        return
      }

      setVideoPreparationProgress(progress)

      setStatusMessage(progress.message)
    })
  }, [])

  const persistCustomPresets = async (nextPresets: FilterPreset[], message?: string): Promise<void> => {
    setCustomPresets(nextPresets)
    await window.desktopApi.saveStoredPresets(nextPresets)
    if (message) {
      setStatusMessage(message)
    }
  }

  // Auto-save session whenever meaningful state changes
  useEffect(() => {
    if (videoLibrary.length === 0 && !selectedCsv) return
    const snapshot: SessionSnapshot = {
      savedAt: new Date().toISOString(),
      videoLibrary,
      activeVideoIndex,
      csvFileName: selectedCsv?.fileName,
      csvPath: selectedCsv?.path,
      csvContent: selectedCsv?.content,
      filterSettings,
      filterOverlayVisible,
      repeatSingleSegment,
      selectedPresetId
    }
    window.localStorage.setItem(sessionSnapshotKey, JSON.stringify(snapshot))
  }, [videoLibrary, activeVideoIndex, selectedCsv, filterSettings, filterOverlayVisible, repeatSingleSegment, selectedPresetId])

  const handleRestoreSession = (snapshot: SessionSnapshot): void => {
    setSessionRestorePrompt(null)
    setVideoLibrary(snapshot.videoLibrary)
    setActiveVideoIndex(Math.min(snapshot.activeVideoIndex, snapshot.videoLibrary.length - 1))
    setFilterSettings(sanitizeFilterSettings(snapshot.filterSettings ?? defaultFilterSettings))
    setFilterOverlayVisible(snapshot.filterOverlayVisible ?? false)
    setRepeatSingleSegment(snapshot.repeatSingleSegment ?? false)
    const allPresets = [...builtInFilterPresets, ...customPresets]
    if (allPresets.some((p) => p.id === snapshot.selectedPresetId)) {
      setSelectedPresetId(snapshot.selectedPresetId)
    }
    if (snapshot.csvContent && snapshot.csvFileName && snapshot.csvPath) {
      const csv: CsvFileDescriptor = {
        path: snapshot.csvPath,
        fileName: snapshot.csvFileName,
        content: snapshot.csvContent
      }
      setSelectedCsv(csv)
      try {
        setAllSegments(parseSegmentsCsv(snapshot.csvContent))
      } catch {
        setAllSegments([])
      }
    }
    setStatusMessage(`Sitzung vom ${new Date(snapshot.savedAt).toLocaleString('de-DE')} wiederhergestellt.`)
  }

  const handleDeclineRestore = (): void => {
    setSessionRestorePrompt(null)
    window.localStorage.removeItem(sessionSnapshotKey)
  }

  const handleLoadVideos = async (): Promise<void> => {
    let videos: VideoFileDescriptor[] | null
    try {
      videos = await window.desktopApi.pickVideoFiles()
    } catch {
      setStatusMessage('Video konnte nicht geladen werden.')
      return
    }

    if (videos === null) {
      return
    }

    isRecoveringPlaybackRef.current = false
    setIsRecoveringPlayback(false)
    setAutoStartSegmentsOnLoad(false)
    setAutoPlayRecoveredVideo(false)
    setSessionRestorePrompt(null)
    setVideoLibrary(videos)
    setActiveVideoIndex(0)
    setStatusMessage(`${videos.length} Video${videos.length !== 1 ? 's' : ''} geladen.`)
  }

  const handleAddVideos = async (): Promise<void> => {
    let videos: VideoFileDescriptor[] | null
    try {
      videos = await window.desktopApi.pickVideoFiles()
    } catch {
      setStatusMessage('Video konnte nicht hinzugefügt werden.')
      return
    }

    if (!videos || !videos.length) {
      return
    }

    setVideoLibrary((prev) => {
      const existingPaths = new Set(prev.map((v) => v.path))
      const newVideos = videos.filter((v) => !existingPaths.has(v.path))
      return [...prev, ...newVideos]
    })
    setStatusMessage(`${videos.length} Video${videos.length !== 1 ? 's' : ''} hinzugefügt.`)
  }

  const handleSelectVideo = (index: number): void => {
    isRecoveringPlaybackRef.current = false
    setIsRecoveringPlayback(false)
    const wasPlaying = isPlayingRef.current
    setAutoPlayRecoveredVideo(wasPlaying)
    const nextVideo = videoLibrary[index]
    const hasSegments = allSegments.length > 0 && matchSegmentsToVideo(allSegments, nextVideo.fileName).length > 0
    setAutoStartSegmentsOnLoad(isSegmentModeRef.current && hasSegments)
    setAutoStartSegmentsFromEnd(false)
    setActiveVideoIndex(index)
  }

  const handleAllSegmentsDone = (): void => {
    isRecoveringPlaybackRef.current = false
    setIsRecoveringPlayback(false)
    setAutoPlayRecoveredVideo(false)

    const nextIndex = activeVideoIndex + 1
    if (nextIndex >= videoLibrary.length) {
      setAutoStartSegmentsOnLoad(false)
      return
    }

    const nextVideo = videoLibrary[nextIndex]
    const nextHasSegments = allSegments.length > 0 && matchSegmentsToVideo(allSegments, nextVideo.fileName).length > 0
    setActiveVideoIndex(nextIndex)
    setAutoPlayRecoveredVideo(isPlayingRef.current)
    setAutoStartSegmentsOnLoad(nextHasSegments)
  }

  const handleFirstSegmentReached = (): void => {
    isRecoveringPlaybackRef.current = false
    setIsRecoveringPlayback(false)
    setAutoPlayRecoveredVideo(false)

    const prevIndex = activeVideoIndex - 1
    if (prevIndex < 0) {
      setAutoStartSegmentsOnLoad(false)
      return
    }

    const prevVideo = videoLibrary[prevIndex]
    const prevHasSegments = allSegments.length > 0 && matchSegmentsToVideo(allSegments, prevVideo.fileName).length > 0
    setActiveVideoIndex(prevIndex)
    setAutoPlayRecoveredVideo(isPlayingRef.current)
    setAutoStartSegmentsOnLoad(prevHasSegments)
    setAutoStartSegmentsFromEnd(true)
  }

  const handleVideoEnded = (): void => {
    isRecoveringPlaybackRef.current = false
    setIsRecoveringPlayback(false)
    setAutoStartSegmentsOnLoad(false)
    setAutoPlayRecoveredVideo(false)

    if (activeVideoIndex + 1 < videoLibrary.length) {
      setActiveVideoIndex(activeVideoIndex + 1)
      setAutoPlayRecoveredVideo(true)
    }
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

      const segmentCount = videoLibrary.length > 0 ? matchSegmentsToVideos(parsedSegments, videoLibrary.map((v) => v.fileName)).length : 0
      setStatusMessage(`${csvFile.fileName} geladen. ${parsedSegments.length} Segmente importiert, ${segmentCount} davon passen zu den geladenen Videos.`)
    } catch {
      setStatusMessage('Die CSV-Datei konnte nicht gelesen werden. Bitte Format und Spaltennamen prüfen.')
    }
  }

  const handleSettingChange = (key: keyof FilterSettings, value: number): void => {
    setFilterSettings((currentSettings) => sanitizeFilterSettings({ ...currentSettings, [key]: value }))
  }

  const handleResetFilters = (): void => {
    setFilterSettings({ ...defaultFilterSettings })
    setSelectedPresetId(defaultPresetId)
    setStatusMessage('Filter wurden auf die Standardwerte zurückgesetzt.')
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
      setStatusMessage('Bitte zuerst einen Namen für das neue Preset eintragen.')
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
      setStatusMessage('Mitgelieferte Presets können nicht überschrieben werden.')
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
      setStatusMessage('Mitgelieferte Presets können nicht gelöscht werden.')
      return
    }

    const nextPresets = customPresets.filter((preset) => preset.id !== selectedPreset.id)
    await persistCustomPresets(nextPresets, `Preset \"${selectedPreset.name}\" gelöscht.`)
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

  const handleImportAppSettings = async (): Promise<void> => {
    let imported: AppSettingsExport | null
    try {
      imported = await window.desktopApi.importAppSettings()
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setStatusMessage(`Sitzung konnte nicht importiert werden: ${detail}`)
      return
    }

    if (!imported) return

    setFilterSettings(sanitizeFilterSettings(imported.filterSettings ?? defaultFilterSettings))
    setRepeatSingleSegment(imported.repeatSingleSegment ?? false)
    setFilterOverlayVisible(imported.filterOverlayVisible ?? false)

    if (Array.isArray(imported.customPresets) && imported.customPresets.length > 0) {
      const merged = mergeCustomPresets(customPresets, imported.customPresets)
      void persistCustomPresets(merged)
    }

    const allPresets = [...builtInFilterPresets, ...customPresets]
    const matchedPreset = allPresets.find((p) => p.id === imported.selectedPresetId)
    if (matchedPreset) {
      setSelectedPresetId(imported.selectedPresetId)
    }

    const parts: string[] = ['Sitzung importiert.']
    if (imported.selectedVideoName) parts.push(`Letztes Video: ${imported.selectedVideoName}.`)
    if (imported.selectedCsvName) parts.push(`Letzte CSV: ${imported.selectedCsvName}.`)
    setStatusMessage(parts.join(' '))
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
    setStatusMessage(success ? 'Sitzung wurde als JSON exportiert.' : 'Export abgebrochen.')
  }

  const toggleThemeMode = (): void => {
    setThemeMode((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))
  }

  return (
    <div className={`shell ${showStartScreen ? 'shell--start' : 'shell--workspace'}`}>
      {sessionRestorePrompt && (
        <SessionRestoreDialog
          snapshot={sessionRestorePrompt}
          onRestore={handleRestoreSession}
          onDecline={handleDeclineRestore}
        />
      )}
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
              <p className="shell__eyebrow">Für Trainer &amp; Analysten</p>
              <h1>Spielszenen. Auf den Punkt.</h1>
            </div>
          </div>

          <div className="shell__header-side">
            <div className="shell__header-actions">
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

              <div className="header-menu" ref={headerMenuRef}>
                <button
                  aria-label="Menü öffnen"
                  aria-expanded={headerMenuOpen}
                  aria-haspopup="menu"
                  className="header-menu__trigger button button--header"
                  type="button"
                  onClick={() => setHeaderMenuOpen((o) => !o)}
                >
                  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                    <circle cx="3" cy="9" r="1.6" />
                    <circle cx="9" cy="9" r="1.6" />
                    <circle cx="15" cy="9" r="1.6" />
                  </svg>
                </button>

                {headerMenuOpen && (
                  <div className="header-menu__dropdown" role="menu">
                    <button
                      className="header-menu__item"
                      role="menuitem"
                      type="button"
                      onClick={() => { void handleImportAppSettings(); setHeaderMenuOpen(false) }}
                    >
                      Sitzung importieren
                    </button>
                    <button
                      className="header-menu__item"
                      role="menuitem"
                      type="button"
                      onClick={() => { void handleExportAppSettings(); setHeaderMenuOpen(false) }}
                    >
                      Sitzung exportieren
                    </button>
                    <div className="header-menu__separator" role="separator" />
                    <div className="header-menu__group">
                      <p className="header-menu__group-label">Übergangsscreen</p>
                      <button
                        className="header-menu__item"
                        role="menuitem"
                        type="button"
                        onClick={handlePickInterstitialLogo}
                      >
                        {interstitialLogoDataUrl ? 'Logo ersetzen…' : 'Logo wählen…'}
                      </button>
                      {interstitialLogoDataUrl ? (
                        <button
                          className="header-menu__item header-menu__item--muted"
                          role="menuitem"
                          type="button"
                          onClick={handleRemoveInterstitialLogo}
                        >
                          Logo entfernen
                        </button>
                      ) : null}
                      <div className="header-menu__duration">
                        <span className="header-menu__duration-label">Dauer</span>
                        <div className="header-menu__duration-btns">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <button
                              key={s}
                              className={`header-menu__duration-btn${interstitialDuration === s ? ' header-menu__duration-btn--active' : ''}`}
                              type="button"
                              onClick={() => handleSetInterstitialDuration(s)}
                            >
                              {s}s
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="header-menu__separator" role="separator" />
                    <button
                      className="header-menu__item"
                      role="menuitem"
                      type="button"
                      onClick={() => { setAboutDialogVisible(true); setHeaderMenuOpen(false) }}
                    >
                      Über die App
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="shell__content">
        <LibraryToolbar
          compact={!showStartScreen}
          videoLibrary={videoLibrary}
          activeVideoIndex={activeVideoIndex}
          selectedCsv={selectedCsv}
          matchedSegmentCount={matchedSegmentsAllVideos.length}
          totalSegmentCount={allSegments.length}
          onLoadVideos={handleLoadVideos}
          onAddVideos={handleAddVideos}
          onSelectVideo={handleSelectVideo}
          onReorderVideos={(reordered) => {
            const currentVideo = videoLibrary[activeVideoIndex]
            setVideoLibrary(reordered)
            if (currentVideo) {
              const newIdx = reordered.findIndex((v) => v.path === currentVideo.path)
              setActiveVideoIndex(newIdx >= 0 ? newIdx : 0)
            }
          }}
          onLoadCsv={handleLoadCsv}
        />

        <main className="layout layout--single">
          <section className="layout__main layout__main--full-width">
            {showStartScreen ? (
              <StartScreen
                appInfo={appInfo}
              />
            ) : (
              <VideoWorkspace
                selectedVideo={selectedVideo}
                segments={displaySegments}
                isSegmentEditorOpen={segmentEditorOpen}
                onOpenSegmentEditor={() => setSegmentEditorOpen((prev) => !prev)}
                onCurrentTimeChange={(t) => { videoCurrentTimeRef.current = t }}
                sessionTitle={sessionTitle}
                onSessionTitleChange={handleSessionTitleChange}
                interstitialDuration={interstitialDuration}
                interstitialLogoDataUrl={interstitialLogoDataUrl}
                filterSettings={filterSettings}
                filterOverlayVisible={filterOverlayVisible}
                repeatSingleSegment={repeatSingleSegment}
                onRepeatSingleSegmentChange={setRepeatSingleSegment}
                onToggleFilterOverlay={() => setFilterOverlayVisible((visible) => !visible)}
                playbackRecoveryInProgress={isRecoveringPlayback}
                autoPlayOnLoad={autoPlayRecoveredVideo}
                autoStartSegmentsOnLoad={autoStartSegmentsOnLoad}
                autoStartSegmentsFromEnd={autoStartSegmentsFromEnd}
                onAllSegmentsDone={handleAllSegmentsDone}
                onFirstSegmentReached={handleFirstSegmentReached}
                onVideoEnded={handleVideoEnded}
                onSegmentModeChange={(active) => { isSegmentModeRef.current = active }}
                onPlayStateChange={handlePlayStateChange}
                onVideoLoaded={(durationSeconds) => {
                  if (!selectedVideo) {
                    return
                  }

                  isRecoveringPlaybackRef.current = false
                  setIsRecoveringPlayback(false)
                  setAutoPlayRecoveredVideo(false)
                  setAutoStartSegmentsOnLoad(false)
                  setAutoStartSegmentsFromEnd(false)

                  setStatusMessage(
                    `${selectedVideo.fileName} ist bereit. Dauer ${formatClockTime(durationSeconds)}. ${matchedSegments.length} passende Segmente gefunden.`
                  )
                }}
                onVideoError={(message, recoverable) => {
                  if (!selectedVideo) {
                    setStatusMessage(message)
                    return
                  }

                  // If already in proxy or stream mode, just show the error — no further fallback
                  if (selectedVideo.playbackMode === 'proxy' || selectedVideo.playbackMode === 'stream') {
                    isRecoveringPlaybackRef.current = false
                    setIsRecoveringPlayback(false)
                    setStatusMessage(message)
                    return
                  }

                  if (isRecoveringPlaybackRef.current || isRecoveringPlayback) {
                    return
                  }

                  if (!recoverable) {
                    setStatusMessage(message)
                    return
                  }

                  // Show confirmation dialog — never transcode silently
                  isRecoveringPlaybackRef.current = true
                  setIsRecoveringPlayback(true)
                  setStreamingConfirmFor({ video: selectedVideo, index: activeVideoIndex })
                }}
                overlayDialogs={(
                  <>
                    {segmentEditorOpen && videoLibrary.length > 0 && (
                      <SegmentEditor
                        videos={videoLibrary}
                        initialSegments={allSegments}
                        getCurrentTime={() => videoCurrentTimeRef.current}
                        onLoad={(editedSegments) => {
                          const loadedPaths = new Set(videoLibrary.map((v) => v.path))
                          const preserved = allSegments.filter((s) => !loadedPaths.has(s.sourceVideoPath))
                          setAllSegments([...preserved, ...editedSegments])
                          setSegmentEditorOpen(false)
                        }}
                        onClose={() => setSegmentEditorOpen(false)}
                      />
                    )}
                    <AboutDialog appInfo={appInfo} open={aboutDialogVisible} onClose={() => setAboutDialogVisible(false)} />
                    <CodecStreamingDialog
                      open={streamingConfirmFor !== null}
                      fileName={streamingConfirmFor?.video.fileName ?? ''}
                      onConfirm={() => {
                        if (!streamingConfirmFor) return
                        const { video, index } = streamingConfirmFor
                        setStreamingConfirmFor(null)
                        void window.desktopApi.prepareStreamingPlayback(video.path)
                          .then((streamDescriptor) => {
                            setVideoLibrary((prev) => {
                              const next = [...prev]
                              next[index] = streamDescriptor
                              return next
                            })
                            isRecoveringPlaybackRef.current = false
                            setIsRecoveringPlayback(false)
                          })
                          .catch((streamError: unknown) => {
                            isRecoveringPlaybackRef.current = false
                            setIsRecoveringPlayback(false)
                            setStatusMessage(streamError instanceof Error ? streamError.message : 'Streaming fehlgeschlagen.')
                          })
                      }}
                      onCancel={() => {
                        if (streamingConfirmFor) {
                          setStatusMessage(`${streamingConfirmFor.video.fileName} kann auf diesem System nicht abgespielt werden.`)
                        }
                        setStreamingConfirmFor(null)
                        isRecoveringPlaybackRef.current = false
                        setIsRecoveringPlayback(false)
                      }}
                    />
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
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleLogoFileInputChange}
      />

      <footer className="shell__status-bar" role="status" aria-live="polite">
        <p className="shell__status">{statusMessage}</p>
        {videoPreparationProgress.phase !== 'idle' ? (
          <div className="status-progress-inline">
            <strong>{videoPreparationProgress.phase === 'transcoding' ? 'Video wird umgewandelt' : 'Videoanalyse'}</strong>
            <span>{videoPreparationProgress.message}</span>
            {typeof videoPreparationProgress.percent === 'number' ? (
              <div className="status-progress-bar" aria-hidden="true">
                <span className="status-progress-bar__fill" style={{ width: `${videoPreparationProgress.percent}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}
      </footer>
    </div>
  )
}
