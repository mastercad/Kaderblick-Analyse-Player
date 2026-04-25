import { act, fireEvent, render, screen } from '@testing-library/react'
import type { Segment, VideoFileDescriptor } from '../../../../common/types'
import { VideoWorkspace } from './VideoWorkspace'

const defaultFilter = {
  blur: 0,
  brightness: 100,
  contrast: 100,
  grayscale: 0,
  hueRotate: 0,
  invert: 0,
  saturate: 100,
  sepia: 0
}

const directVideo: VideoFileDescriptor = {
  path: '/tmp/test.mp4',
  fileName: 'test.mp4',
  fileUrl: 'file:///tmp/test.mp4',
  playbackMode: 'direct'
}

const makeSegment = (id: string, start: number, end: number, title: string): Segment => ({
  id,
  sourceVideoName: 'test.mp4',
  sourceVideoPath: '/tmp/test.mp4',
  startSeconds: start,
  endSeconds: end,
  lengthSeconds: end - start,
  title,
  subTitle: '',
  audioTrack: '1'
})

const twoSegments = [
  makeSegment('s1', 60, 90, 'Erstes Tor'),
  makeSegment('s2', 90, 120, 'Zweites Tor')
]

const baseProps = {
  segments: twoSegments,
  filterSettings: defaultFilter,
  filterOverlayVisible: false,
  repeatSingleSegment: false,
  onRepeatSingleSegmentChange: () => {},
  onToggleFilterOverlay: () => {},
  selectedVideo: directVideo,
  interstitialLogoDataUrl: null
}

describe('VideoWorkspace – interstitial on segment navigation', () => {
  it('shows interstitial when clicking "Nächstes Segment" and interstitialDuration > 0', () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' }))
    })

    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
  })

  it('shows interstitial when clicking "Voriges Segment" and interstitialDuration > 0', () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    // Move currentTime into the second segment so getPreviousSegmentIndex finds the first
    // writable: true is required so that seekTo() inside jumpToSegment can re-assign currentTime
    const videoEl = document.querySelector('video')!
    Object.defineProperty(videoEl, 'currentTime', { value: 95, configurable: true, writable: true })
    act(() => {
      fireEvent(videoEl, new Event('timeupdate'))
    })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Voriges Segment' }))
    })

    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
  })

  it('shows interstitial when clicking a segment card in the list and interstitialDuration > 0', () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Zweites Tor/ }))
    })

    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
  })

  it('does NOT show interstitial when interstitialDuration is 0', () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0}>
        <div />
      </VideoWorkspace>
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' }))
    })

    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
  })

  it('Segment-Klick während laufendem Countdown startet neuen Countdown sofort (war playing)', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    vi.useFakeTimers()
    try {
      // Video starten
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })

      // Nächstes Segment → Einspieler + Countdown startet sofort (war playing)
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })
      expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
      // Button zeigt "Pause" weil isInterstitialCounting=true
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

      // Während Countdown läuft: auf anderes Segment klicken
      await act(async () => { vi.advanceTimersByTime(1000) })
      act(() => { fireEvent.click(screen.getByRole('button', { name: /Zweites Tor/ })) })

      // Neuer Einspieler sofort sichtbar, Countdown läuft weiter (war playing)
      expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

      // Countdown-Ende → Einspieler verschwindet, play() aufgerufen
      await act(async () => { vi.advanceTimersByTime(3000) })
      expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
      expect(videoEl.play).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Segment-Wechsel während Countdown: Fortschrittsbalken startet neu (neue DOM-Instanz)', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    vi.useFakeTimers()
    try {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })

      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })
      const firstBar = document.querySelector('.segment-interstitial__progress-bar')
      expect(firstBar).toBeInTheDocument()

      // 1 s vergehen, dann auf anderes Segment klicken
      await act(async () => { vi.advanceTimersByTime(1000) })
      act(() => { fireEvent.click(screen.getByRole('button', { name: /Zweites Tor/ })) })

      // Fortschrittsbalken ist eine NEUE DOM-Instanz (key geändert → React remount)
      const secondBar = document.querySelector('.segment-interstitial__progress-bar')
      expect(secondBar).toBeInTheDocument()
      expect(secondBar).not.toBe(firstBar)
    } finally {
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// Interstitial timer behaviour (seek-first, play-state preservation)
// ---------------------------------------------------------------------------

describe('VideoWorkspace – interstitial timer behaviour', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('updates the timeline display immediately (before the interstitial timer fires)', () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' }))
    })

    // Interstitial is visible — timer has NOT fired yet
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
    // Time display already shows the target segment's start time (60 s = 01:00)
    expect(document.querySelector('.time-row__current')?.textContent).toBe('01:00')
  })

  it('timeupdate during interstitial does NOT overwrite the timeline position', () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    // Simulate video playing at 95 s (inside segment 2)
    Object.defineProperty(videoEl, 'currentTime', { value: 95, configurable: true, writable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    // Navigate to segment 1 (start=60 s) → interstitial shown, marker jumps to 01:00
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Voriges Segment' }))
    })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
    expect(document.querySelector('.time-row__current')?.textContent).toBe('01:00')

    // Video is still at 95 s (not seeked yet — seek happens after interstitial).
    // A timeupdate event fires with the stale old position — must NOT overwrite the marker.
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    expect(document.querySelector('.time-row__current')?.textContent).toBe('01:00')
  })

  it('video wird beim Einspieler pausiert und nach dem Countdown wieder abgespielt', async () => {    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)
    videoEl.pause = vi.fn()

    // Video starten
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })

    // Zum nächsten Segment navigieren → Einspieler erscheint
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' }))
    })

    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
    // Video muss während des Einspielers pausiert sein
    expect(videoEl.pause).toHaveBeenCalled()

    // Nach Ablauf des Countdowns muss das Video wieder abgespielt werden
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
    expect(videoEl.play).toHaveBeenCalledTimes(2) // 1× beim Start, 1× nach Einspieler
  })

  it('hides the interstitial after the timer fires (video was playing)', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Start playing first so that countdown begins immediately when navigating
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' }))
    })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

    await act(async () => { vi.advanceTimersByTime(3000) })

    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
  })

  it('does NOT resume playback after interstitial if video was paused', async () => {    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Video starts paused — click next segment
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' }))
    })

    await act(async () => { vi.advanceTimersByTime(3000) })

    // Still paused — Play button says "Play", not "Pause"
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(videoEl.play).not.toHaveBeenCalled()
  })

  it('resumes playback after interstitial if video was playing', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Start playing
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    // Navigate to next segment — countdown starts immediately (was playing)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' }))
    })
    // Button still shows "Pause" because countdown is running (video will auto-resume)
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    // After timer fires, playback should resume
    await act(async () => { vi.advanceTimersByTime(3000) })

    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('Pause während Countdown: Einspieler bleibt sichtbar und Timer hält an', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={6}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Video starten
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })

    // Nächstes Segment → Einspieler + Countdown startet sofort (war playing)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

    // 2 Sekunden vergehen
    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

    // Pause drücken → Einspieler muss bleiben, kein play()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pause' })) })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

    // Weitere 10 s vergehen → Einspieler bleibt (Timer pausiert)
    await act(async () => { vi.advanceTimersByTime(10_000) })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
    // play() wurde genau 1× aufgerufen (beim ersten Play-Klick, nicht durch Timer)
    expect(videoEl.play).toHaveBeenCalledTimes(1)
  })

  it('Play nach Pause setzt Countdown mit verbleibender Zeit fort', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={6}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Video starten
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })

    // Nächstes Segment → Countdown läuft (6 s total)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })

    // 2 s vergehen, dann Pause → ~4 s verbleibend
    await act(async () => { vi.advanceTimersByTime(2000) })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pause' })) })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

    // Play → Countdown läuft weiter
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

    // 3 s später → Einspieler noch da (von ~4 s verbleibend, erst 3 s vergangen)
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

    // Restliche 1,1 s → Einspieler weg, play() aufgerufen
    await act(async () => { vi.advanceTimersByTime(1100) })
    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
    expect(videoEl.play).toHaveBeenCalledTimes(2)
  })

  it('Pause während Countdown: Fortschrittsbalken pausiert (progress bar paused class)', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={6}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })

    await act(async () => { vi.advanceTimersByTime(1000) })

    // Countdown läuft → Balken sichtbar, kein paused-Modifier
    const progressBar = document.querySelector('.segment-interstitial__progress-bar')
    expect(progressBar).toBeInTheDocument()
    expect(progressBar?.classList.contains('segment-interstitial__progress-bar--paused')).toBe(false)

    // Pause → Balken weiter sichtbar, paused-Modifier gesetzt
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pause' })) })
    const pausedBar = document.querySelector('.segment-interstitial__progress-bar')
    expect(pausedBar).toBeInTheDocument()
    expect(pausedBar?.classList.contains('segment-interstitial__progress-bar--paused')).toBe(true)

    // Play → paused-Modifier wieder weg
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    const resumedBar = document.querySelector('.segment-interstitial__progress-bar')
    expect(resumedBar).toBeInTheDocument()
    expect(resumedBar?.classList.contains('segment-interstitial__progress-bar--paused')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// "Nur Segmente abspielen" respects current play state
// ---------------------------------------------------------------------------

describe('VideoWorkspace – segment mode toggle respects play state', () => {
  it('enters segment mode without starting playback when video is paused', () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0}>
        <div />
      </VideoWorkspace>
    )

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
    })

    // Segment mode is active
    expect(screen.getByRole('button', { name: 'Segmentmodus beenden' })).toBeInTheDocument()
    // But video is still paused
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('enters segment mode and continues playback when video is playing', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Start playing
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    // Toggle segment mode
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
    })

    // Segment mode active and still playing
    expect(screen.getByRole('button', { name: 'Segmentmodus beenden' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('Pause während Segment-Wiedergabe: kein Einspieler, Video pausiert einfach', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    vi.useFakeTimers()
    try {
      // Segment-Modus aktivieren und Einspieler abwarten
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
      })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Play' }))
      })
      await act(async () => { vi.advanceTimersByTime(3000) })
      // Jetzt spielt das Video (kein Einspieler)
      expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

      // Pause drücken — jsdom hat immer paused=true, daher den paused-State direkt setzen
      Object.defineProperty(videoEl, 'paused', { value: false, configurable: true })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
      })

      // Kein Einspieler sichtbar — nur pausiert
      expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Play nach Pause/Play-Zyklus startet KEINEN Einspieler mehr', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    vi.useFakeTimers()
    try {
      // Segment-Modus, Einspieler abwarten → Video läuft
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' })) })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
      await act(async () => { vi.advanceTimersByTime(3000) })
      expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

      // Pause
      Object.defineProperty(videoEl, 'paused', { value: false, configurable: true })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pause' })) })
      expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()

      // Play → kein erneuter Einspieler, Video läuft direkt weiter
      Object.defineProperty(videoEl, 'paused', { value: true, configurable: true })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
      expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
      // play() wurde genau 2× aufgerufen: 1× nach Einspieler, 1× nach Pause→Play
      expect(videoEl.play).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('beendet Einspieler-Countdown und setzt Wiedergabe fort wenn Segmentmodus während Countdown verlassen wird', async () => {
    // Bug: exitSegmentMode cleared the countdown timer but never called playPlayback(),
    // leaving the video paused even though playback was active before the interstitial.
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    vi.useFakeTimers()
    try {
      // Segment-Modus starten (pausiert) → Einspieler-Bild OHNE Countdown
      act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' })) })
      expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

      // Play → Countdown startet (Timer läuft jetzt)
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
      // Countdown läuft → Play-Button zeigt "Pause" (isInterstitialCounting=true)
      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
      // Segmentmodus-Button muss sichtbar bleiben
      expect(screen.getByRole('button', { name: 'Segmentmodus beenden' })).toBeInTheDocument()

      // Segmentmodus BEENDEN während Countdown läuft → Video muss wieder spielen
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Segmentmodus beenden' })) })

      // Einspieler weg, Segmentmodus beendet, playPlayback() wurde gerufen
      expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
      expect(videoEl.play).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('beendet Einspieler-Bild ohne Countdown und lässt Video pausiert wenn Segmentmodus verlassen wird', async () => {
    // When the interstitial image is shown WITHOUT a countdown (because the video was paused
    // when the segment boundary was hit), exitSegmentMode should NOT resume playback.
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Segment-Modus starten (pausiert) → Einspieler-Bild ohne Countdown
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' })) })

    // Einspieler-Bild ist sichtbar, kein Countdown (Video war pausiert)
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
    // Play wurde NICHT gerufen (kein Auto-Start)
    expect(videoEl.play).not.toHaveBeenCalled()

    // Segmentmodus beenden → Video soll pausiert bleiben
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Segmentmodus beenden' })) })

    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
    // play() darf NICHT gerufen worden sein — Video bleibt pausiert
    expect(videoEl.play).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Frame freeze: video.currentTime must NOT change while interstitial is visible
// ---------------------------------------------------------------------------

describe('VideoWorkspace – video frame freezes during interstitial', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('does NOT change video.currentTime immediately when interstitial is shown (paused)', () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    const initialCurrentTime = videoEl.currentTime

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' }))
    })

    // Interstitial is visible, but the video frame hasn't moved
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
    expect(videoEl.currentTime).toBe(initialCurrentTime)
  })

  it('seeks video.currentTime after the interstitial timer fires (video was playing)', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Start playing so countdown starts immediately on navigation
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' }))
    })
    expect(videoEl.currentTime).toBe(0) // not yet seeked

    await act(async () => { vi.advanceTimersByTime(3000) })

    // twoSegments[0].startSeconds = 60
    expect(videoEl.currentTime).toBe(60)
  })
})

// ---------------------------------------------------------------------------
// No repeated interstitial for the already-active segment
// ---------------------------------------------------------------------------

describe('VideoWorkspace – no interstitial when navigating to the active segment', () => {
  it('does not show interstitial when clicking the already-active segment card', () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    // Move into segment 0 (Erstes Tor, 60–90 s)
    const videoEl = document.querySelector('video')!
    Object.defineProperty(videoEl, 'currentTime', { value: 70, configurable: true, writable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    // Click segment card 0 — it is already active
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Erstes Tor/ }))
    })

    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
  })

  it('does not show interstitial when "Voriges Segment" is clicked while already at the first segment', () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    // Move into segment 0 (Erstes Tor, 60–90 s)
    const videoEl = document.querySelector('video')!
    Object.defineProperty(videoEl, 'currentTime', { value: 70, configurable: true, writable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    // getPreviousSegmentIndex returns 0 (already active) — no interstitial
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Voriges Segment' }))
    })

    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
  })

  it('shows interstitial when navigating to a DIFFERENT segment', () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    // Move into segment 0 (Erstes Tor, 60–90 s)
    const videoEl = document.querySelector('video')!
    Object.defineProperty(videoEl, 'currentTime', { value: 70, configurable: true, writable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    // Click segment card 1 (Zweites Tor) — different from active (0)
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Zweites Tor/ }))
    })

    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Bug-Fix: Play im Segment-Modus (pausiert) muss Einspieler zeigen
// ---------------------------------------------------------------------------

describe('VideoWorkspace – Play im Segment-Modus zeigt Einspieler (pausiert gestartet)', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('zeigt Einspieler sofort beim Aktivieren des Segmentmodus (pausiert, interstitialDuration > 0)', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Segmentmodus aktivieren (Video ist pausiert) → Einspieler erscheint sofort
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
    })
    expect(screen.getByRole('button', { name: 'Segmentmodus beenden' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    // Einspieler-Bild wird sofort gezeigt — kein Play-Druck nötig
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
  })

  it('zeigt KEINEN Einspieler wenn Play im Segment-Modus (pausiert, interstitialDuration=0) gedrückt wird', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    })

    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
    // Playback startet direkt
    expect(videoEl.play).toHaveBeenCalled()
  })

  it('startet Wiedergabe nach dem Einspieler-Timer (pausiert → Play → Einspieler → Abspielen)', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Segmentmodus (pausiert)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
    })

    // Play → Einspieler erscheint
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
    expect(videoEl.play).not.toHaveBeenCalled()

    // Timer abwarten → Einspieler verschwindet, Wiedergabe startet
    await act(async () => { vi.advanceTimersByTime(3000) })

    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
    expect(videoEl.play).toHaveBeenCalled()
  })

  it('bleibt im Segment-Modus nach Play + Einspieler', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    })
    await act(async () => { vi.advanceTimersByTime(3000) })

    expect(screen.getByRole('button', { name: 'Segmentmodus beenden' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Bug-Fix: Play/Pause im Segment-Modus (kein aktiver Einspieler) springt Timeline
// ---------------------------------------------------------------------------

describe('VideoWorkspace – Play/Pause im Segment-Modus springt Timeline zu Segment-Start', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  /**
   * Hilfsfunktion: Segment-Modus aktivieren (pausiert) → hinterlässt den Zustand:
   *   isSegmentMode=true, isInterstitialActiveRef=true, isInterstitialCounting=false,
   *   isPlaying=false, currentTime=60, sequenceIndex=0, Button zeigt "Play",
   *   Einspieler-Bild sichtbar (kein laufender Countdown).
   */
  async function enterSegmentModeAndShowImage(videoEl: HTMLVideoElement): Promise<void> {
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Schritt 1: Segment-Modus aktivieren (pausiert) → Einspieler-Bild erscheint, kein Countdown
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
    })
    // Jetzt: Segment-Modus aktiv, Einspieler-Bild sichtbar, kein Countdown, pausiert, currentTime=60
  }

  it('Play: Timeline springt sofort zum Segment-Start und startet Einspieler-Countdown', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    await enterSegmentModeAndShowImage(videoEl)

    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

    // Play drücken → Timeline springt auf Segment-Start (60 s), Einspieler + Countdown
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    })

    // Einspieler sichtbar, Timeline bereits bei 01:00 (vor Timer-Ablauf)
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
    expect(document.querySelector('.time-row__current')?.textContent).toBe('01:00')

    // Countdown läuft sofort (startCountdownImmediately=true) → nach Timer: Einspieler weg
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
    expect(videoEl.play).toHaveBeenCalledTimes(1)
  })

  it('Pause: Video pausiert einfach, kein Einspieler', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Segment-Modus aktivieren, Einspieler abwarten → Video läuft
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    })
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()

    // jsdom: paused=false simulieren (Video läuft)
    Object.defineProperty(videoEl, 'paused', { value: false, configurable: true })

    // Pause drücken → kein Einspieler, einfach pausiert
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    })

    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    // play() wurde nur einmal aufgerufen (nach Einspieler-Countdown), nicht erneut
    expect(videoEl.play).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Bug-Fix: Timeline-Klick im Segment-Modus (spielend) springt Marker ZUERST
// ---------------------------------------------------------------------------

describe('VideoWorkspace – Timeline-Klick im Segment-Modus springt Marker sofort zum Segment', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  /**
   * Simuliert einen einfachen Timeline-Klick (ohne Drag):
   * pointerDown → pointerUp → click (click wird durch neue Logik unterdrückt).
   */
  const clickTimeline = (timeline: HTMLElement, clientX: number): void => {
    fireEvent.pointerDown(timeline, { clientX, pointerId: 1 })
    fireEvent.pointerUp(timeline, { clientX, pointerId: 1 })
    fireEvent.click(timeline, { clientX })
  }

  it('Timeline-Klick auf anderes Segment (spielend): Marker springt sofort + Einspieler + Countdown', async () => {    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(videoEl, 'duration', { value: 120, configurable: true })
    Object.defineProperty(videoEl, 'videoWidth', { value: 1920, configurable: true })
    Object.defineProperty(videoEl, 'videoHeight', { value: 1080, configurable: true })
    act(() => { fireEvent(videoEl, new Event('loadedmetadata')) })
    Object.defineProperty(videoEl, 'setPointerCapture', { value: vi.fn(), configurable: true })
    Object.defineProperty(videoEl, 'releasePointerCapture', { value: vi.fn(), configurable: true })

    // Segment-Modus starten (pausiert) → Einspieler erscheint (Segment 0, Start=60)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
    })
    // Play → Countdown
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    })
    // Timer ablaufen → isPlaying=true
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()

    // Timeline so konfigurieren dass ein Klick auf Segment 2 (Start=90 s) trifft:
    // duration=120, Segment 2 startet bei 90 s → clientX = 90/120 * 200 = 150
    const timeline = screen.getByRole('button', { name: 'Zeitleiste' })
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200 }),
      configurable: true
    })

    act(() => { clickTimeline(timeline, 150) })

    // Einspieler erscheint UND Timeline zeigt bereits Segment-2-Start (90 s = 01:30)
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
    expect(document.querySelector('.time-row__current')?.textContent).toBe('01:30')

    // Nach Countdown: Einspieler weg, Video spielt ab
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
    expect(videoEl.play).toHaveBeenCalledTimes(2)
  })

  it('Timeline-Klick auf anderes Segment (pausiert): Marker springt sofort + Einspieler ohne Countdown + bleibt pausiert', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(videoEl, 'duration', { value: 120, configurable: true })
    Object.defineProperty(videoEl, 'videoWidth', { value: 1920, configurable: true })
    Object.defineProperty(videoEl, 'videoHeight', { value: 1080, configurable: true })
    act(() => { fireEvent(videoEl, new Event('loadedmetadata')) })
    Object.defineProperty(videoEl, 'setPointerCapture', { value: vi.fn(), configurable: true })
    Object.defineProperty(videoEl, 'releasePointerCapture', { value: vi.fn(), configurable: true })

    // Segment-Modus starten (Video ist pausiert)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' }))
    })
    // Einspieler-Bild erscheint sofort (kein Countdown, weil pausiert)
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
    // Einspieler manuell schließen: 3 s warten ohne Countdown → Bild bleibt, nichts passiert
    // Stattdessen: Segmentmodus verlassen und neu betreten um sauberen Zustand zu haben
    // Einfacher: Countdown durch "Pause-Klick" abbrechen (es läuft noch kein Countdown)
    // → direkt weiter, Einspieler-Bild ist noch offen; wir brauchen keinen sauberen Zustand

    // Kein Countdown aktiv (pausiert) → 3 s vergehen ohne Effekt
    await act(async () => { vi.advanceTimersByTime(3000) })
    // Bild bleibt (kein Countdown)
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

    // Timeline-Klick auf Segment 2 (Start=90 s, clientX=150 bei width=200)
    const timeline = screen.getByRole('button', { name: 'Zeitleiste' })
    Object.defineProperty(timeline, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200 }),
      configurable: true
    })

    act(() => {
      fireEvent.pointerDown(timeline, { clientX: 150, pointerId: 1 })
      fireEvent.pointerUp(timeline, { clientX: 150, pointerId: 1 })
      fireEvent.click(timeline, { clientX: 150 })
    })

    // Einspieler erscheint, Marker bei 01:30 (90 s)
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
    expect(document.querySelector('.time-row__current')?.textContent).toBe('01:30')

    // Kein Countdown (Video war pausiert) → 3 s vergehen ohne play()
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(videoEl.play).not.toHaveBeenCalled()
    // Bild bleibt sichtbar (kein Countdown gestartet)
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Multi-Video – onAllSegmentsDone callback
// ---------------------------------------------------------------------------

describe('VideoWorkspace – onAllSegmentsDone wird aufgerufen', () => {
  it('ruft onAllSegmentsDone auf, wenn das einzige Segment seine endSeconds erreicht', () => {
    const onAllSegmentsDone = vi.fn()
    // Segment: start=60, end=90
    const singleSegment = [makeSegment('s1', 60, 90, 'Einziges Tor')]

    render(
      <VideoWorkspace
        {...baseProps}
        segments={singleSegment}
        interstitialDuration={0}
        onAllSegmentsDone={onAllSegmentsDone}
      >
        <div />
      </VideoWorkspace>
    )

    const vid = document.querySelector('video')!

    // Segment-Modus aktivieren (sequenceIndex = 0)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' })) })

    // currentTime auf Segment-Ende setzen (>= endSeconds - 0.05 = 89.95)
    Object.defineProperty(vid, 'currentTime', { value: 90, configurable: true, writable: true })
    act(() => { fireEvent(vid, new Event('timeupdate')) })

    expect(onAllSegmentsDone).toHaveBeenCalledOnce()
  })

  it('ruft onAllSegmentsDone auf, wenn das letzte von zwei Segmenten seine endSeconds erreicht', () => {
    const onAllSegmentsDone = vi.fn()
    // Segment 1: start=60, end=90; Segment 2: start=90, end=120
    const twoSegmentsLocal = [
      makeSegment('s1', 60, 90, 'Erstes Tor'),
      makeSegment('s2', 90, 120, 'Zweites Tor')
    ]

    render(
      <VideoWorkspace
        {...baseProps}
        segments={twoSegmentsLocal}
        interstitialDuration={0}
        onAllSegmentsDone={onAllSegmentsDone}
      >
        <div />
      </VideoWorkspace>
    )

    const vid = document.querySelector('video')!

    // Segment-Modus aktivieren (sequenceIndex = 0)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nur Segmente abspielen' })) })

    // Zum zweiten Segment springen (sequenceIndex = 1, kein Interstitial)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })

    // currentTime auf Ende von Segment 2 setzen (>= 119.95)
    Object.defineProperty(vid, 'currentTime', { value: 120, configurable: true, writable: true })
    act(() => { fireEvent(vid, new Event('timeupdate')) })

    expect(onAllSegmentsDone).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Multi-Video navigation – onAllSegmentsDone via "Nächstes Segment" Button
// ---------------------------------------------------------------------------

describe('VideoWorkspace – onAllSegmentsDone beim Button-Klick am letzten Segment', () => {
  it('ruft onAllSegmentsDone auf, wenn am letzten Segment "Nächstes Segment" geklickt wird', () => {
    const onAllSegmentsDone = vi.fn()
    const singleSegment = [makeSegment('s1', 60, 90, 'Einziges Tor')]

    render(
      <VideoWorkspace
        {...baseProps}
        segments={singleSegment}
        interstitialDuration={0}
        onAllSegmentsDone={onAllSegmentsDone}
      >
        <div />
      </VideoWorkspace>
    )

    const vid = document.querySelector('video')!
    // currentTime innerhalb des einzigen Segments → getNextSegmentIndex gibt -1 zurück
    Object.defineProperty(vid, 'currentTime', { value: 65, configurable: true, writable: true })
    act(() => { fireEvent(vid, new Event('timeupdate')) })

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })

    expect(onAllSegmentsDone).toHaveBeenCalledOnce()
  })

  it('ruft onAllSegmentsDone auf, wenn am letzten von zwei Segmenten "Nächstes Segment" geklickt wird', () => {
    const onAllSegmentsDone = vi.fn()
    const twoSegmentsLocal = [
      makeSegment('s1', 60, 90, 'Erstes Tor'),
      makeSegment('s2', 90, 120, 'Zweites Tor')
    ]

    render(
      <VideoWorkspace
        {...baseProps}
        segments={twoSegmentsLocal}
        interstitialDuration={0}
        onAllSegmentsDone={onAllSegmentsDone}
      >
        <div />
      </VideoWorkspace>
    )

    const vid = document.querySelector('video')!

    // currentTime in zweites Segment setzen, damit getPreviousSegmentIndex/getNextSegmentIndex
    // das zweite Segment als aktiv erkennt
    Object.defineProperty(vid, 'currentTime', { value: 95, configurable: true, writable: true })
    act(() => { fireEvent(vid, new Event('timeupdate')) })

    // Jetzt ist currentTime=95 → kein nächstes Segment → Callback
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })

    expect(onAllSegmentsDone).toHaveBeenCalledOnce()
  })

  it('ruft onAllSegmentsDone NICHT auf, wenn noch ein nächstes Segment vorhanden ist', () => {
    const onAllSegmentsDone = vi.fn()
    const twoSegmentsLocal = [
      makeSegment('s1', 60, 90, 'Erstes Tor'),
      makeSegment('s2', 90, 120, 'Zweites Tor')
    ]

    render(
      <VideoWorkspace
        {...baseProps}
        segments={twoSegmentsLocal}
        interstitialDuration={0}
        onAllSegmentsDone={onAllSegmentsDone}
      >
        <div />
      </VideoWorkspace>
    )

    // currentTime vor dem ersten Segment → nächstes Segment existiert
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })

    expect(onAllSegmentsDone).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Multi-Video navigation – onFirstSegmentReached via "Voriges Segment" Button
// ---------------------------------------------------------------------------

describe('VideoWorkspace – onFirstSegmentReached beim Button-Klick am ersten Segment', () => {
  it('ruft onFirstSegmentReached auf, wenn am ersten Segment "Voriges Segment" geklickt wird', () => {
    const onFirstSegmentReached = vi.fn()
    const singleSegment = [makeSegment('s1', 60, 90, 'Einziges Tor')]

    render(
      <VideoWorkspace
        {...baseProps}
        segments={singleSegment}
        interstitialDuration={0}
        onFirstSegmentReached={onFirstSegmentReached}
      >
        <div />
      </VideoWorkspace>
    )

    // currentTime vor oder innerhalb des ersten Segments → kein vorigeres Segment
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Voriges Segment' })) })

    expect(onFirstSegmentReached).toHaveBeenCalledOnce()
  })

  it('ruft onFirstSegmentReached auf, wenn currentTime vor dem ersten Segment liegt und "Voriges Segment" geklickt wird', () => {
    const onFirstSegmentReached = vi.fn()
    const twoSegmentsLocal = [
      makeSegment('s1', 60, 90, 'Erstes Tor'),
      makeSegment('s2', 90, 120, 'Zweites Tor')
    ]

    render(
      <VideoWorkspace
        {...baseProps}
        segments={twoSegmentsLocal}
        interstitialDuration={0}
        onFirstSegmentReached={onFirstSegmentReached}
      >
        <div />
      </VideoWorkspace>
    )

    // currentTime=0 (default) liegt vor dem ersten Segment (Start=60s)
    // → getPreviousSegmentIndex gibt -1 zurück → Callback wird aufgerufen
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Voriges Segment' })) })

    expect(onFirstSegmentReached).toHaveBeenCalledOnce()
  })

  it('ruft onFirstSegmentReached NICHT auf, wenn noch ein vorigeres Segment vorhanden ist', () => {
    const onFirstSegmentReached = vi.fn()
    const twoSegmentsLocal = [
      makeSegment('s1', 60, 90, 'Erstes Tor'),
      makeSegment('s2', 90, 120, 'Zweites Tor')
    ]

    render(
      <VideoWorkspace
        {...baseProps}
        segments={twoSegmentsLocal}
        interstitialDuration={0}
        onFirstSegmentReached={onFirstSegmentReached}
      >
        <div />
      </VideoWorkspace>
    )

    const vid = document.querySelector('video')!

    // currentTime in zweitem Segment → erstes Segment ist das vorherige
    Object.defineProperty(vid, 'currentTime', { value: 95, configurable: true, writable: true })
    act(() => { fireEvent(vid, new Event('timeupdate')) })

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Voriges Segment' })) })

    expect(onFirstSegmentReached).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Zoom-Sperre während Interstitial – Zoom-Controls sind deaktiviert
// ---------------------------------------------------------------------------

describe('VideoWorkspace – Zoom-Sperre während Interstitial', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('Zoom-Slider ist während des Einspielers deaktiviert und danach wieder aktiv', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Zoom-Dock öffnen (Badge klicken) damit der Slider im DOM ist
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Zoom-Steuerung einblenden' })) })
    const zoomSlider = screen.getByRole('slider', { name: 'Zoomstufe' })
    expect(zoomSlider).not.toBeDisabled() // Ausgangszustand: aktiv

    // Video starten, zum nächsten Segment navigieren → Einspieler erscheint
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

    // Während Einspieler: Zoom-Slider deaktiviert
    expect(zoomSlider).toBeDisabled()

    // Einspieler-Timer ablaufen lassen
    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()

    // Nach Einspieler: Zoom-Slider wieder aktiv
    expect(zoomSlider).not.toBeDisabled()
  })

  it('Zoom-Vergrößern-Button ist während des Einspielers deaktiviert und danach wieder aktiv', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // Zoom-Dock öffnen
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Zoom-Steuerung einblenden' })) })
    const zoomInBtn = screen.getByRole('button', { name: 'Zoom vergroessern' })
    expect(zoomInBtn).not.toBeDisabled()

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })
    expect(screen.getByText('Nächste Szene')).toBeInTheDocument()

    expect(zoomInBtn).toBeDisabled()

    await act(async () => { vi.advanceTimersByTime(3000) })
    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()

    expect(zoomInBtn).not.toBeDisabled()
  })

  it('isInterstitialActiveRef wird nach dem Einspieler auf false gesetzt', async () => {
    // Testet indirekt, dass der Ref korrekt synchronisiert wird, indem
    // die viewport-Events nach dem Einspieler wieder angenommen werden (kein undefined-Handler)
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={3}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })

    // Während Interstitial: Viewport-Pointer-Events sind deaktiviert (onPointerDown=undefined)
    const viewport = screen.getByTestId('video-zoom-viewport')
    expect(viewport).toBeInTheDocument()

    await act(async () => { vi.advanceTimersByTime(3000) })

    // Nach Interstitial: Einspieler weg → isInterstitialActiveRef.current muss false sein
    // Das lässt sich daran erkennen, dass der Viewport wieder anklickbar ist (kein disabled)
    expect(screen.queryByText('Nächste Szene')).not.toBeInTheDocument()
    // Der Zoom-Slider (über Badge öffnen) ist wieder aktiv
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Zoom-Steuerung einblenden' })) })
    expect(screen.getByRole('slider', { name: 'Zoomstufe' })).not.toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Bug-Fixes: onAllSegmentsDone / onFirstSegmentReached + autoStartSegmentsFromEnd
// Callbacks haben keine Parameter mehr – Play-State wird global in App via isPlayingRef verfolgt.
// ---------------------------------------------------------------------------

describe('VideoWorkspace – Bug 1: onAllSegmentsDone wird gerufen wenn kein nächstes Segment', () => {
  it('ruft onAllSegmentsDone wenn Nächstes-Segment hinter letztem Segment geklickt (pausiert)', () => {
    const onAllSegmentsDone = vi.fn()
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} onAllSegmentsDone={onAllSegmentsDone}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    // Hinter letztem Segment (s2 endet bei 120)
    Object.defineProperty(videoEl, 'currentTime', { value: 130, configurable: true, writable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })

    expect(onAllSegmentsDone).toHaveBeenCalledOnce()
  })

  it('ruft onAllSegmentsDone wenn Nächstes-Segment hinter letztem Segment geklickt (abgespielt)', async () => {
    const onAllSegmentsDone = vi.fn()
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} onAllSegmentsDone={onAllSegmentsDone}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })

    Object.defineProperty(videoEl, 'currentTime', { value: 130, configurable: true, writable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Nächstes Segment' })) })

    expect(onAllSegmentsDone).toHaveBeenCalledOnce()
  })
})

describe('VideoWorkspace – Bug 3a: onFirstSegmentReached wird am ersten Segment gerufen', () => {
  it('ruft onFirstSegmentReached wenn Voriges-Segment am ersten Segment geklickt (pausiert)', () => {
    const onFirstSegmentReached = vi.fn()
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} onFirstSegmentReached={onFirstSegmentReached}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    // Im ersten Segment (s1: 60–90)
    Object.defineProperty(videoEl, 'currentTime', { value: 65, configurable: true, writable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Voriges Segment' })) })

    expect(onFirstSegmentReached).toHaveBeenCalledOnce()
  })

  it('ruft onFirstSegmentReached wenn Voriges-Segment am ersten Segment geklickt (abgespielt)', async () => {
    const onFirstSegmentReached = vi.fn()
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} onFirstSegmentReached={onFirstSegmentReached}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })

    Object.defineProperty(videoEl, 'currentTime', { value: 65, configurable: true, writable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Voriges Segment' })) })

    expect(onFirstSegmentReached).toHaveBeenCalledOnce()
  })

  it('springt bei Voriges-Segment zwischen Segmenten weiterhin korrekt', () => {
    // Sicherstellen dass der Fix nur die erste-Segment-Grenze betrifft,
    // nicht die normale Rückwärts-Navigation zwischen Segmenten.
    const onFirstSegmentReached = vi.fn()
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} onFirstSegmentReached={onFirstSegmentReached}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    // Im zweiten Segment (s2: 90–120)
    Object.defineProperty(videoEl, 'currentTime', { value: 95, configurable: true, writable: true })
    act(() => { fireEvent(videoEl, new Event('timeupdate')) })

    // Voriges Segment → soll zu Segment 0 (60 s) springen, NICHT onFirstSegmentReached auslösen
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Voriges Segment' })) })

    expect(onFirstSegmentReached).not.toHaveBeenCalled()
    // Zeitanzeige springt auf 01:00 (=60 s)
    expect(document.querySelector('.time-row__current')?.textContent).toBe('01:00')
  })
})

describe('VideoWorkspace – Bug 3b: autoStartSegmentsFromEnd startet am letzten Segment', () => {
  const threeSegments: Segment[] = [
    { id: 's1', sourceVideoName: 'test.mp4', sourceVideoPath: '/tmp/test.mp4', startSeconds: 60, endSeconds: 90, lengthSeconds: 30, title: 'Erstes', subTitle: '', audioTrack: '1' },
    { id: 's2', sourceVideoName: 'test.mp4', sourceVideoPath: '/tmp/test.mp4', startSeconds: 90, endSeconds: 120, lengthSeconds: 30, title: 'Zweites', subTitle: '', audioTrack: '1' },
    { id: 's3', sourceVideoName: 'test.mp4', sourceVideoPath: '/tmp/test.mp4', startSeconds: 120, endSeconds: 150, lengthSeconds: 30, title: 'Drittes', subTitle: '', audioTrack: '1' }
  ]

  it('startet in Segment-Modus am letzten Segment wenn autoStartSegmentsFromEnd=true', async () => {
    render(
      <VideoWorkspace
        {...baseProps}
        segments={threeSegments}
        interstitialDuration={0}
        autoStartSegmentsOnLoad={true}
        autoStartSegmentsFromEnd={true}
      >
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // canplay auslösen → handleCanPlay → startSegmentPlayback mit letztem Segment
    await act(async () => { fireEvent(videoEl, new Event('canplay')) })

    // Letztes Segment (s3) startet bei 120 s = 02:00
    expect(document.querySelector('.time-row__current')?.textContent).toBe('02:00')
    // autoPlayOnLoad=false (Standard) → kein auto-play
    expect(videoEl.play).not.toHaveBeenCalled()
  })

  it('spielt automatisch wenn autoPlayOnLoad=true und autoStartSegmentsFromEnd=true', async () => {
    render(
      <VideoWorkspace
        {...baseProps}
        segments={threeSegments}
        interstitialDuration={0}
        autoStartSegmentsOnLoad={true}
        autoStartSegmentsFromEnd={true}
        autoPlayOnLoad={true}
      >
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent(videoEl, new Event('canplay')) })

    expect(document.querySelector('.time-row__current')?.textContent).toBe('02:00')
    expect(videoEl.play).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// autoPlayOnLoad – vollständige Abdeckung des canplay-Timings
// Diese Tests schützen vor der Regression, bei der pendingAutoPlayRef durch einen
// React-18-useEffect nicht rechtzeitig gesetzt war, bevor das canplay-Event feuerte.
// ---------------------------------------------------------------------------

describe('VideoWorkspace – autoPlayOnLoad: canplay startet Wiedergabe', () => {
  it('spielt wenn autoPlayOnLoad=true und canplay feuert (kein Segmentmodus)', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} autoPlayOnLoad={true}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent(videoEl, new Event('canplay')) })

    expect(videoEl.play).toHaveBeenCalledOnce()
  })

  it('spielt NICHT wenn autoPlayOnLoad=false und canplay feuert (kein Segmentmodus)', async () => {
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} autoPlayOnLoad={false}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent(videoEl, new Event('canplay')) })

    expect(videoEl.play).not.toHaveBeenCalled()
  })

  it('spielt wenn autoPlayOnLoad=true und autoStartSegmentsOnLoad=true (Segmentmodus)', async () => {
    render(
      <VideoWorkspace
        {...baseProps}
        interstitialDuration={0}
        autoPlayOnLoad={true}
        autoStartSegmentsOnLoad={true}
      >
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent(videoEl, new Event('canplay')) })

    expect(videoEl.play).toHaveBeenCalledOnce()
  })

  it('spielt NICHT wenn autoPlayOnLoad=false und autoStartSegmentsOnLoad=true (Segmentmodus)', async () => {
    render(
      <VideoWorkspace
        {...baseProps}
        interstitialDuration={0}
        autoPlayOnLoad={false}
        autoStartSegmentsOnLoad={true}
      >
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent(videoEl, new Event('canplay')) })

    expect(videoEl.play).not.toHaveBeenCalled()
  })
})

describe('VideoWorkspace – autoPlayOnLoad bei Videopfad-Wechsel (Regression: pendingAutoPlayRef-Timing)', () => {
  const secondVideo: VideoFileDescriptor = {
    path: '/tmp/test2.mp4',
    fileName: 'test2.mp4',
    fileUrl: 'file:///tmp/test2.mp4',
    playbackMode: 'direct'
  }

  it('spielt nach Videopfad-Wechsel wenn autoPlayOnLoad=true', async () => {
    // Simulates: playing video 1 → next-segment crosses boundary → App switches to video 2
    // with autoPlayOnLoad=true. The canplay event of the new video MUST trigger playback.
    const { rerender } = render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} autoPlayOnLoad={false}>
        <div />
      </VideoWorkspace>
    )

    // Switch to a new video with autoPlayOnLoad=true (as App.tsx does when wasPlaying=true)
    rerender(
      <VideoWorkspace
        {...baseProps}
        selectedVideo={secondVideo}
        interstitialDuration={0}
        autoPlayOnLoad={true}
      >
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    // canplay feuert für das neue Video
    await act(async () => { fireEvent(videoEl, new Event('canplay')) })

    expect(videoEl.play).toHaveBeenCalledOnce()
  })

  it('spielt NICHT nach Videopfad-Wechsel wenn autoPlayOnLoad=false', async () => {
    // Simulates: paused on video 1 → manual video selection → App switches to video 2
    // with autoPlayOnLoad=false. canplay must NOT trigger playback.
    const { rerender } = render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} autoPlayOnLoad={true}>
        <div />
      </VideoWorkspace>
    )

    // Switch to new video with autoPlayOnLoad=false (as App.tsx does when wasPlaying=false)
    rerender(
      <VideoWorkspace
        {...baseProps}
        selectedVideo={secondVideo}
        interstitialDuration={0}
        autoPlayOnLoad={false}
      >
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent(videoEl, new Event('canplay')) })

    expect(videoEl.play).not.toHaveBeenCalled()
  })

  it('spielt nach Videopfad-Wechsel mit Segmentmodus wenn autoPlayOnLoad=true', async () => {
    // Simulates: playing video 1 in segment mode → crosses to video 2
    // App sets autoPlayOnLoad=true AND autoStartSegmentsOnLoad=true
    const { rerender } = render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} autoPlayOnLoad={false}>
        <div />
      </VideoWorkspace>
    )

    rerender(
      <VideoWorkspace
        {...baseProps}
        selectedVideo={secondVideo}
        interstitialDuration={0}
        autoPlayOnLoad={true}
        autoStartSegmentsOnLoad={true}
      >
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent(videoEl, new Event('canplay')) })

    expect(videoEl.play).toHaveBeenCalledOnce()
  })

  it('spielt NICHT nach Videopfad-Wechsel mit Segmentmodus wenn autoPlayOnLoad=false', async () => {
    // Simulates: paused on video 1 in segment mode → manual selection of video 2
    // App sets autoPlayOnLoad=false AND autoStartSegmentsOnLoad=true
    const { rerender } = render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} autoPlayOnLoad={true}>
        <div />
      </VideoWorkspace>
    )

    rerender(
      <VideoWorkspace
        {...baseProps}
        selectedVideo={secondVideo}
        interstitialDuration={0}
        autoPlayOnLoad={false}
        autoStartSegmentsOnLoad={true}
      >
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent(videoEl, new Event('canplay')) })

    expect(videoEl.play).not.toHaveBeenCalled()
  })
})

describe('VideoWorkspace – onPlayStateChange via useLayoutEffect (Timing-Garantie)', () => {
  // Stellt sicher dass onPlayStateChange synchron nach jedem Commit gerufen wird –
  // bevor der Browser das nächste Event verarbeitet. Das ist die Voraussetzung dafür,
  // dass isPlayingRef in App.tsx beim nächsten Button-Klick immer aktuell ist.

  it('ruft onPlayStateChange=true nachdem Play gedrückt wurde', async () => {
    const onPlayStateChange = vi.fn()
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} onPlayStateChange={onPlayStateChange}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })

    expect(onPlayStateChange).toHaveBeenLastCalledWith(true)
  })

  it('ruft onPlayStateChange=false nachdem Pause gedrückt wurde', async () => {
    const onPlayStateChange = vi.fn()
    render(
      <VideoWorkspace {...baseProps} interstitialDuration={0} onPlayStateChange={onPlayStateChange}>
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play' })) })
    expect(onPlayStateChange).toHaveBeenLastCalledWith(true)

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Pause' })) })
    // Prüfen dass der Callback irgendwann mit false gerufen wurde.
    // (Nach Pause kann jsdom noch weitere Events feuern, die einen Folge-Aufruf auslösen.)
    expect(onPlayStateChange).toHaveBeenCalledWith(false)
  })

  it('ruft onPlayStateChange=true beim autoPlayOnLoad nach canplay', async () => {
    const onPlayStateChange = vi.fn()
    render(
      <VideoWorkspace
        {...baseProps}
        interstitialDuration={0}
        autoPlayOnLoad={true}
        onPlayStateChange={onPlayStateChange}
      >
        <div />
      </VideoWorkspace>
    )

    const videoEl = document.querySelector('video')!
    videoEl.play = vi.fn().mockResolvedValue(undefined)

    await act(async () => { fireEvent(videoEl, new Event('canplay')) })

    expect(onPlayStateChange).toHaveBeenLastCalledWith(true)
  })
})
