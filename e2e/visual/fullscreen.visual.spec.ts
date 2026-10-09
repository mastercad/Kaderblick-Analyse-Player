import { expect, test } from '@playwright/test'
import axe from 'axe-core'
import { assertNoRendererErrors, configureSharedMatch, launchApplication, mediaPath, selectVideoFiles } from '../support/electron'

const fileNames = ['e2e-main.mp4', 'e2e-left.mp4', 'e2e-right.mp4']
const videos = fileNames.map(mediaPath)

async function assertPanelDoesNotCoverPerspectives(
  panel: import('@playwright/test').Locator,
  previews: import('@playwright/test').Locator
): Promise<void> {
  const [panelBox, previewsBox] = await Promise.all([panel.boundingBox(), previews.boundingBox()])
  expect(panelBox).not.toBeNull()
  expect(previewsBox).not.toBeNull()
  const overlaps = panelBox!.x < previewsBox!.x + previewsBox!.width &&
    panelBox!.x + panelBox!.width > previewsBox!.x &&
    panelBox!.y < previewsBox!.y + previewsBox!.height &&
    panelBox!.y + panelBox!.height > previewsBox!.y
  expect(overlaps, 'Flyout und Zusatzperspektiven dürfen sich nicht überlagern.').toBe(false)
}

test('renders dark mode, splash, perspectives and fullscreen tools without regressions', async () => {
  const application = await launchApplication()
  const { page } = application
  try {
    await page.setViewportSize({ width: 1480, height: 980 })
    await selectVideoFiles(application, videos)
    await configureSharedMatch(application, fileNames)

    const utilityControls = page.getByTestId('player-inline-controls').locator('.player-controls__utility')
    const filterButton = utilityControls.getByRole('button', { name: 'Filter', exact: true })
    const perspectiveButton = utilityControls.getByRole('button', { name: 'Perspektiven', exact: true })
    const fullscreenButton = utilityControls.getByRole('button', { name: 'Vollbild', exact: true })
    const readButtonPresentation = (button: typeof filterButton) => button.evaluate((element) => {
      const style = getComputedStyle(element)
      const box = element.getBoundingClientRect()
      return {
        element: element.tagName,
        height: box.height,
        width: box.width,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        borderStyle: style.borderStyle,
        borderWidth: style.borderWidth,
        boxShadow: style.boxShadow,
        color: style.color,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        paddingBlock: style.paddingBlock
      }
    })
    const [filterPresentation, perspectivePresentation, fullscreenPresentation] = await Promise.all([
      readButtonPresentation(filterButton),
      readButtonPresentation(perspectiveButton),
      readButtonPresentation(fullscreenButton)
    ])
    expect(perspectivePresentation).toEqual(filterPresentation)
    expect(perspectivePresentation).toEqual(fullscreenPresentation)
    await expect(utilityControls).toHaveScreenshot('inline-utility-buttons-light.png', {
      // Linux font and native range-control rasterization differs slightly
      // between the developer desktop and the pinned Ubuntu CI image. Button
      // geometry and computed presentation are asserted exactly above.
      maxDiffPixels: 300
    })

    await page.getByRole('button', { name: 'Zu Dark Mode wechseln' }).click()

    const perspectives = page.locator('.perspective-picker')
    await perspectives.getByRole('button', { name: 'Perspektiven' }).click()
    const perspectivesEnabled = perspectives.getByLabel('Zusatzperspektiven anzeigen')
    await perspectives.getByText('Zusatzperspektiven anzeigen').click()
    await expect(perspectivesEnabled).toBeChecked()
    await expect(perspectiveButton).toHaveClass(/button--active/)
    await perspectives.getByText('Zusatzperspektiven anzeigen').click()
    await expect(perspectivesEnabled).not.toBeChecked()
    await expect(perspectiveButton).not.toHaveClass(/button--active/)
    await perspectives.getByText('Zusatzperspektiven anzeigen').click()
    await expect(perspectivesEnabled).toBeChecked()
    await perspectives.getByText('e2e-left.mp4', { exact: true }).click()
    await expect(perspectives.getByLabel('e2e-left.mp4')).toBeChecked()
    await perspectives.getByText('e2e-right.mp4', { exact: true }).click()
    await expect(perspectives.getByLabel('e2e-right.mp4')).toBeChecked()
    await perspectives.getByRole('button', { name: 'Perspektiven' }).click()

    const mainVideo = page.locator('.video-stage__video')
    await expect.poll(() => mainVideo.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
    await mainVideo.evaluate(async (element: HTMLVideoElement) => {
      element.currentTime = 2
      await new Promise<void>((resolve) => element.addEventListener('seeked', () => resolve(), { once: true }))
    })
    // Decoder presentation can differ by one frame between otherwise identical
    // runs. Keep the rendered containers/headings in the visual regression while
    // the separate Electron and 4K tests validate actual frame playback.
    await page.addStyleTag({
      content: '.video-stage__video, .perspective-preview video { visibility: hidden !important; }'
    })

    await expect(page).toHaveScreenshot('workspace-dark-with-perspectives.png', {
      mask: [page.locator('.video-stage__video, .perspective-preview video, .timeline__preview')]
    })

    await page.getByRole('button', { name: 'Vollbild', exact: true }).click()
    await expect(page.locator('.player-panel--fullscreen')).toBeVisible()
    await page.setViewportSize({ width: 1920, height: 1080 })
    await expect(page.getByTestId('fullscreen-flyout-shell')).toHaveCount(0)
    await expect(page.getByLabel('Aktuell verfügbare Zusatzperspektiven')).toHaveCount(0)
    await expect(page).toHaveScreenshot('fullscreen-splash-dark.png')

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press('Space')
    await expect(page.getByTestId('fullscreen-flyout-shell')).toBeVisible()
    await expect(page.getByLabel('Aktuell verfügbare Zusatzperspektiven')).toBeVisible()
    await page.keyboard.press('Space')

    await page.getByRole('button', { name: 'Werkzeuge einblenden' }).click()
    const tools = page.getByTestId('fullscreen-flyout-right-panel')
    await expect(tools).toHaveClass(/fullscreen-flyout-panel--open/)
    const previews = page.getByLabel('Aktuell verfügbare Zusatzperspektiven')
    await page.waitForTimeout(250)
    await assertPanelDoesNotCoverPerspectives(tools, previews)
    await page.addScriptTag({ content: axe.source })
    await expect(page).toHaveScreenshot('fullscreen-tools-and-perspectives-dark.png', {
      mask: [page.locator('.video-stage__video, .perspective-preview video, .fullscreen-keyboard-hud')]
    })

    const flyouts = [
      { side: 'right', screenshot: undefined },
      { side: 'top', screenshot: 'fullscreen-info-dark.png' },
      { side: 'left', screenshot: 'fullscreen-segments-dark.png' },
      { side: 'bottom', screenshot: 'fullscreen-controls-dark.png' }
    ] as const
    for (const flyout of flyouts) {
      const trigger = page.locator(`[aria-controls="fullscreen-flyout-${flyout.side}"]`)
      const panel = page.locator(`#fullscreen-flyout-${flyout.side}`)
      if (flyout.side !== 'right') {
        await trigger.click()
        await expect(panel).toHaveClass(/fullscreen-flyout-panel--open/)
        await page.waitForTimeout(250)
        await assertPanelDoesNotCoverPerspectives(panel, previews)
      }
      const contrast = await page.evaluate(async (selector) => {
        return window.axe.run(document.querySelector(selector)!, {
          runOnly: { type: 'rule', values: ['color-contrast'] }
        })
      }, `#fullscreen-flyout-${flyout.side}`)
      expect(contrast.violations, `Kontrastfehler im ${flyout.side}-Flyout`).toEqual([])
      if (flyout.screenshot) {
        await expect(page).toHaveScreenshot(flyout.screenshot, {
          mask: [page.locator('.video-stage__video, .perspective-preview video, .fullscreen-keyboard-hud')]
        })
      }
    }
    await assertNoRendererErrors(application)
  } finally {
    await application.close()
  }
})
