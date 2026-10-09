import { expect, test } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { assertNoRendererErrors, configureSharedMatch, launchApplication, mediaPath, selectVideoFiles } from '../support/electron'

interface VideoSample {
  label: string
  source: string
  currentTime: number
  effectiveTime: number
  readyState: number
  paused: boolean
  totalFrames: number
  droppedFrames: number
}

interface PerformanceSample {
  elapsedSeconds: number
  videos: VideoSample[]
}

const fileNames = ['e2e-4k-main.mp4', 'e2e-4k-left.mp4', 'e2e-4k-right.mp4']
const videos = fileNames.map(mediaPath)

test('@performance keeps two real 4K perspectives synchronized during sustained playback', async ({}, testInfo) => {
  test.setTimeout(150_000)
  const application = await launchApplication({ deterministicRendering: false })
  const { page } = application
  const samples: PerformanceSample[] = []

  try {
    await selectVideoFiles(application, videos)
    await configureSharedMatch(application, fileNames, '01:05')

    const perspectives = page.locator('.perspective-picker')
    await perspectives.getByRole('button', { name: 'Perspektiven' }).click()
    await perspectives.getByLabel('Zusatzperspektiven anzeigen').check()
    await perspectives.getByLabel('e2e-4k-left.mp4').check()
    await perspectives.getByLabel('e2e-4k-right.mp4').check()
    await perspectives.getByRole('button', { name: 'Perspektiven' }).click()
    await expect(page.locator('.perspective-preview video')).toHaveCount(2)

    const mainVideo = page.locator('.video-stage__video')
    await expect.poll(() => mainVideo.evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2)
    await page.getByRole('button', { name: 'Play', exact: true }).click()

    const startedAt = Date.now()
    for (let index = 0; index < 13; index += 1) {
      await page.waitForTimeout(index === 0 ? 1_000 : 5_000)
      samples.push({
        elapsedSeconds: (Date.now() - startedAt) / 1000,
        videos: await page.locator('.video-stage__video, .perspective-preview video').evaluateAll((elements) => (
          elements.map((element, elementIndex) => {
            const video = element as HTMLVideoElement
            const source = video.currentSrc || video.src
            let streamStart = 0
            try {
              streamStart = Number(new URL(source).searchParams.get('t') ?? 0) || 0
            } catch {
              streamStart = 0
            }
            const quality = typeof video.getVideoPlaybackQuality === 'function'
              ? video.getVideoPlaybackQuality()
              : { totalVideoFrames: 0, droppedVideoFrames: 0 }
            return {
              label: elementIndex === 0 ? 'main' : video.getAttribute('aria-label') ?? `perspective-${elementIndex}`,
              source,
              currentTime: video.currentTime,
              effectiveTime: streamStart + video.currentTime,
              readyState: video.readyState,
              paused: video.paused,
              totalFrames: quality.totalVideoFrames,
              droppedFrames: quality.droppedVideoFrames
            }
          })
        ))
      })
    }

    expect(samples.every((sample) => sample.videos.length === 3), 'Alle drei realen Videostreams müssen während des gesamten Laufs vorhanden sein.').toBe(true)
    const labels = samples[0].videos.map((video) => video.label)
    for (const label of labels) {
      const series = samples.map((sample) => sample.videos.find((video) => video.label === label)!)
      const progress = series.at(-1)!.effectiveTime - series[0].effectiveTime
      expect(progress, `${label} muss während des Langzeittests kontinuierlich fortschreiten.`).toBeGreaterThan(50)

      let consecutiveStalls = 0
      let worstConsecutiveStalls = 0
      let renderedIntervals = 0
      for (let index = 1; index < series.length; index += 1) {
        consecutiveStalls = series[index].effectiveTime - series[index - 1].effectiveTime < 1
          ? consecutiveStalls + 1
          : 0
        worstConsecutiveStalls = Math.max(worstConsecutiveStalls, consecutiveStalls)
        if (series[index].source === series[index - 1].source && series[index].totalFrames - series[index - 1].totalFrames >= 10) {
          renderedIntervals += 1
        }
      }
      expect(worstConsecutiveStalls, `${label} darf nicht über zwei Messintervalle stehen bleiben.`).toBeLessThanOrEqual(1)
      expect(renderedIntervals, `${label} muss nicht nur Zeit fortschreiben, sondern tatsächlich Frames rendern.`).toBeGreaterThanOrEqual(9)
      expect(series.filter((sample) => sample.readyState >= 2 && !sample.paused).length, `${label} muss abspielbereit bleiben.`).toBeGreaterThanOrEqual(11)
    }

    for (const sample of samples.slice(2)) {
      const mainTime = sample.videos[0].effectiveTime
      for (const preview of sample.videos.slice(1)) {
        expect(Math.abs(preview.effectiveTime - mainTime), `${preview.label} driftet bei ${sample.elapsedSeconds.toFixed(1)} s zu weit ab.`).toBeLessThanOrEqual(3)
      }
    }

    const metricsDirectory = path.resolve('test-results', 'performance')
    const metricsPath = path.join(metricsDirectory, '4k-perspective-metrics.json')
    await mkdir(metricsDirectory, { recursive: true })
    await writeFile(metricsPath, JSON.stringify(samples, null, 2), 'utf8')
    await testInfo.attach('4k-perspective-metrics.json', { path: metricsPath, contentType: 'application/json' })
    await assertNoRendererErrors(application)
  } finally {
    await application.close()
  }
})
