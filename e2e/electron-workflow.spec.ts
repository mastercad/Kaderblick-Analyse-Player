import { expect, test } from '@playwright/test'
import { rm } from 'node:fs/promises'
import { assertNoRendererErrors, configureSharedMatch, launchApplication, mediaPath, selectVideoFiles } from './support/electron'

const videos = [
  mediaPath('e2e-main.mp4'),
  mediaPath('e2e-left.mp4'),
  mediaPath('e2e-right.mp4')
]

test('loads real videos through Electron and plays them', async () => {
  const application = await launchApplication()
  try {
    await selectVideoFiles(application, videos)

    await expect(application.page.getByText('3 Videos geladen', { exact: true })).toBeVisible()
    await expect(application.page.locator('.video-library-item')).toHaveCount(3)
    const video = application.page.locator('.video-stage__video')
    await expect(video).toBeVisible()
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)

    await application.page.getByRole('button', { name: 'Play', exact: true }).click()
    await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0.5)
    await assertNoRendererErrors(application)
  } finally {
    await application.close()
  }
})

test('keeps utility buttons equally sized and toggles perspectives through visible labels', async () => {
  const application = await launchApplication()
  try {
    await selectVideoFiles(application, videos)
    const controls = application.page.getByTestId('player-inline-controls').locator('.player-controls__utility')
    const filterButton = controls.getByRole('button', { name: 'Filter', exact: true })
    const perspectiveButton = controls.getByRole('button', { name: 'Perspektiven', exact: true })
    const fullscreenButton = controls.getByRole('button', { name: 'Vollbild', exact: true })
    const boxes = await Promise.all([filterButton, perspectiveButton, fullscreenButton].map((button) => button.boundingBox()))
    expect(boxes.every((box) => box?.width === 104 && box.height === boxes[0]?.height)).toBe(true)

    await perspectiveButton.click()
    const enabled = controls.getByLabel('Zusatzperspektiven anzeigen')
    await controls.getByText('Zusatzperspektiven anzeigen').click()
    await expect(enabled).toBeChecked()
    await expect(perspectiveButton).toHaveClass(/button--active/)
    await controls.getByText('Zusatzperspektiven anzeigen').click()
    await expect(enabled).not.toBeChecked()
    await expect(perspectiveButton).not.toHaveClass(/button--active/)
    await expect(controls.locator('.perspective-picker__panel')).toBeVisible()
    await assertNoRendererErrors(application)
  } finally {
    await application.close()
  }
})

test('restores the complete user session after a real application restart', async () => {
  const firstRun = await launchApplication()
  const userDataDirectory = firstRun.userDataDirectory

  try {
    await selectVideoFiles(firstRun, videos)
    await configureSharedMatch(firstRun, ['e2e-main.mp4', 'e2e-left.mp4', 'e2e-right.mp4'])
    await firstRun.page.getByRole('button', { name: 'Zu Dark Mode wechseln' }).click()
    await firstRun.page.getByRole('button', { name: 'Menü öffnen' }).click()
    await firstRun.page.getByRole('menuitem', { name: 'Einstellungen' }).click()
    await firstRun.page.getByRole('radio', { name: /Videozeit – fortlaufend/ }).check()
    await firstRun.page.getByRole('dialog', { name: 'Zeiteingabe im Player' }).getByRole('button', { name: 'Schließen' }).click()

    await firstRun.page.getByRole('button', { name: 'Filter', exact: true }).click()
    await firstRun.page.getByRole('slider', { name: /Helligkeit/ }).fill('125')
    await expect(firstRun.page.locator('.filter-overlay')).toHaveClass(/filter-overlay--visible/)

    const firstPerspectives = firstRun.page.locator('.perspective-picker')
    await firstPerspectives.getByRole('button', { name: 'Perspektiven' }).click()
    await firstPerspectives.getByLabel('Zusatzperspektiven anzeigen').check()
    await firstPerspectives.getByLabel('e2e-right.mp4').check()
    await firstPerspectives.getByRole('button', { name: 'Perspektiven' }).click()
    await firstRun.page.locator('.video-library-item__button').nth(1).click()
    await expect(firstRun.page.locator('.video-library-item').nth(1)).toHaveClass(/video-library-item--active/)
    await expect.poll(() => firstRun.page.evaluate(() => localStorage.getItem('kaderblick-session-snapshot'))).not.toBeNull()
    const storedSnapshot = await firstRun.page.evaluate(() => JSON.parse(localStorage.getItem('kaderblick-session-snapshot')!))
    expect(storedSnapshot.videoLibrary.every((video: { matchTimeRanges?: unknown[] }) => video.matchTimeRanges?.length === 1)).toBe(true)
    expect(storedSnapshot.filterOverlayVisible).toBe(true)
    expect(storedSnapshot.filterSettings.brightness).toBe(125)
    await assertNoRendererErrors(firstRun)
    await firstRun.close(true)

    const secondRun = await launchApplication({ userDataDirectory })
    try {
      await expect(secondRun.page.getByRole('dialog', { name: 'Sitzung wiederherstellen?' })).toBeVisible()
      await secondRun.page.getByRole('button', { name: 'Ja, wiederherstellen' }).click()

      await expect(secondRun.page.locator('.video-library-item')).toHaveCount(3)
      await expect(secondRun.page.locator('.video-library-item').nth(1)).toHaveClass(/video-library-item--active/)
      await expect(secondRun.page.locator('html')).toHaveAttribute('data-theme', 'dark')
      await expect(secondRun.page.locator('.video-stage__video')).toHaveAttribute('src', /e2e-left\.mp4/)
      await expect(secondRun.page.locator('.filter-overlay')).toHaveClass(/filter-overlay--visible/)
      await expect(secondRun.page.getByRole('slider', { name: /Helligkeit/ })).toHaveValue('125')
      await expect.poll(() => secondRun.page.evaluate(() => localStorage.getItem('kaderblick-player-jump-time-mode'))).toBe('video-cumulative')

      const restoredPerspectives = secondRun.page.locator('.perspective-picker')
      await restoredPerspectives.getByRole('button', { name: 'Perspektiven' }).click()
      await expect(restoredPerspectives.getByLabel('Zusatzperspektiven anzeigen')).toBeChecked()
      await expect(restoredPerspectives.getByLabel('e2e-right.mp4')).toBeChecked()

      await secondRun.page.getByRole('button', { name: 'Segment-Editor', exact: true }).click()
      await expect(secondRun.page.getByRole('dialog', { name: 'Segment-Editor' }).getByText(/Ergebnis: Im Video/)).toHaveCount(3)
      await assertNoRendererErrors(secondRun)
    } finally {
      await secondRun.close(true)
    }
  } finally {
    await rm(userDataDirectory, { recursive: true, force: true })
  }
})
