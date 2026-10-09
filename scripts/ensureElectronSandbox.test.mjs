import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

describe('ensureElectronSandbox', () => {
  it('überspringt privilegierte Einrichtung ausschließlich für den markierten CI-E2E-Container', () => {
    const output = execFileSync(process.execPath, ['scripts/ensureElectronSandbox.mjs'], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: 'true',
        KADERBLICK_E2E_NO_SANDBOX: '1'
      }
    })

    expect(output).toContain('Einrichtung fuer den isolierten E2E-Container uebersprungen.')
  })
})
