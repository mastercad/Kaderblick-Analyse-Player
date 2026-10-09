import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, type ElectronApplication, type Page } from 'playwright'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export interface RunningApplication {
  electronApp: ElectronApplication
  page: Page
  userDataDirectory: string
  rendererErrors: string[]
  close: (keepUserData?: boolean) => Promise<void>
}

export async function launchApplication(options: {
  userDataDirectory?: string
  deterministicRendering?: boolean
} = {}): Promise<RunningApplication> {
  const ownsUserDataDirectory = !options.userDataDirectory
  const userDataDirectory = options.userDataDirectory ?? await mkdtemp(path.join(os.tmpdir(), 'kaderblick-e2e-'))
  const args = ['.', `--user-data-dir=${userDataDirectory}`, '--no-sandbox']
  if (options.deterministicRendering !== false) args.push('--disable-gpu')

  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE

  const electronApp = await electron.launch({
    args,
    cwd: projectRoot,
    env: {
      ...environment,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      LANG: 'de_DE.UTF-8'
    }
  })
  const page = await electronApp.firstWindow()
  await electronApp.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const workArea = screen.getPrimaryDisplay().workArea
    const width = Math.min(1480, workArea.width)
    const height = Math.min(980, workArea.height)
    window.setBounds({
      x: workArea.x + Math.floor((workArea.width - width) / 2),
      y: workArea.y + Math.floor((workArea.height - height) / 2),
      width,
      height
    })
    window.show()
    window.focus()
  })
  await page.bringToFront()
  const rendererErrors: string[] = []
  page.on('pageerror', (error) => rendererErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') rendererErrors.push(message.text())
  })
  await page.waitForLoadState('domcontentloaded')

  let closed = false
  return {
    electronApp,
    page,
    userDataDirectory,
    rendererErrors,
    close: async (keepUserData = false) => {
      if (closed) return
      closed = true
      await electronApp.close()
      if (ownsUserDataDirectory && !keepUserData) {
        await rm(userDataDirectory, { recursive: true, force: true })
      }
    }
  }
}

export async function selectVideoFiles(application: RunningApplication, filePaths: string[]): Promise<void> {
  await application.electronApp.evaluate(({ dialog }, selectedPaths) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: selectedPaths })
  }, filePaths)
  await application.page.getByRole('button', { name: 'Videos laden' }).click()
  await application.page.getByLabel('Bibliotheksstatus').waitFor({ state: 'visible' })
}

export function mediaPath(fileName: string): string {
  return path.join(projectRoot, '.cache', 'e2e-media', fileName)
}

export async function configureSharedMatch(
  application: RunningApplication,
  fileNames: string[],
  duration = '00:17'
): Promise<void> {
  const page = application.page
  await page.getByRole('button', { name: 'Segment-Editor', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Segment-Editor' })
  await expectVisible(dialog)

  for (const fileName of fileNames) {
    const row = dialog.locator('.segment-editor__match-row').filter({ hasText: fileName })
    if (!await row.evaluate((element: HTMLDetailsElement) => element.open)) {
      await row.locator(':scope > summary').click()
    }
    await row.getByLabel(`Spiel für ${fileName}`).fill('E2E-Testspiel')
    await row.getByLabel(`Dauer des Spielabschnitts 1 von ${fileName}`).fill(duration)
    await expectVisible(row.getByText(/Ergebnis: Im Video/))
  }

  await dialog.getByRole('button', { name: 'Schließen', exact: true }).last().click()
  await dialog.waitFor({ state: 'detached' })
}

async function expectVisible(locator: import('playwright').Locator): Promise<void> {
  await locator.waitFor({ state: 'visible' })
}

export async function assertNoRendererErrors(application: RunningApplication): Promise<void> {
  if (application.rendererErrors.length > 0) {
    throw new Error(`Fehler im Renderer:\n${application.rendererErrors.join('\n')}`)
  }
}
