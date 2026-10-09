import { expect, test } from '@playwright/test'
import axe from 'axe-core'
import type { UpdateStatus } from '../../src/common/types'
import { assertNoRendererErrors, launchApplication } from '../support/electron'

async function publishUpdateStatus(
  application: Awaited<ReturnType<typeof launchApplication>>,
  status: UpdateStatus
): Promise<void> {
  await application.electronApp.evaluate(({ BrowserWindow }, nextStatus) => {
    BrowserWindow.getAllWindows()[0].webContents.send('app:updateStatus', nextStatus)
  }, status)
}

test('renders the complete in-app update flow clearly', async () => {
  const application = await launchApplication()
  const { page } = application
  try {
    await page.setViewportSize({ width: 1480, height: 980 })

    const dialog = page.getByRole('dialog')
    const availableDialog = page.getByRole('dialog', { name: 'Update verfügbar' })
    await expect.poll(async () => {
      await publishUpdateStatus(application, { phase: 'available', version: '2.12.0' })
      return availableDialog.count()
    }).toBe(1)
    await expect(availableDialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Später' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Herunterladen' })).toBeVisible()
    await page.addScriptTag({ content: axe.source })
    const lightContrast = await page.evaluate(async () => window.axe.run(document.querySelector('.update-dialog')!, {
      runOnly: { type: 'rule', values: ['color-contrast'] }
    }))
    expect(lightContrast.violations).toEqual([])
    await expect(dialog).toHaveScreenshot('update-available-light.png')

    await publishUpdateStatus(application, { phase: 'downloading', version: '2.12.0', percent: 47 })
    await expect(page.getByRole('dialog', { name: 'Download läuft' })).toBeVisible()
    await expect(dialog.getByText('47 %')).toBeVisible()
    await expect(dialog).toHaveScreenshot('update-downloading-light.png')

    await dialog.getByRole('button', { name: 'Ausblenden' }).click()
    await expect(dialog).toBeHidden()
    await page.getByRole('button', { name: 'Zu Dark Mode wechseln' }).click()
    await publishUpdateStatus(application, { phase: 'downloaded', version: '2.12.0' })
    await expect(page.getByRole('dialog', { name: 'Update ist bereit' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Installieren und neu starten' })).toBeVisible()
    await expect(dialog).toHaveScreenshot('update-ready-dark.png')

    await publishUpdateStatus(application, { phase: 'error', version: '2.12.0', message: 'Download vorübergehend nicht möglich.' })
    await expect(page.getByRole('dialog', { name: 'Update fehlgeschlagen' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Schließen' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Erneut versuchen' })).toBeVisible()
    const darkContrast = await page.evaluate(async () => window.axe.run(document.querySelector('.update-dialog')!, {
      runOnly: { type: 'rule', values: ['color-contrast'] }
    }))
    expect(darkContrast.violations).toEqual([])
    await expect(dialog).toHaveScreenshot('update-error-dark.png')

    await assertNoRendererErrors(application)
  } finally {
    await application.close()
  }
})
