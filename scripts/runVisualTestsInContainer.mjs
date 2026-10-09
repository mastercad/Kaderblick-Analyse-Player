import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const image = 'mcr.microsoft.com/playwright:v1.64.0-resolute@sha256:c8dca02cb6a444cd5a970bb6378367752b6e5b09d93aabd2c53e381497459135'
const projectRoot = path.resolve(import.meta.dirname, '..')
const nodeModulesDirectory = mkdtempSync(path.join(tmpdir(), 'kaderblick-visual-node-modules-'))
const npmCacheDirectory = path.join(projectRoot, '.cache', 'npm-visual-container')
const playwrightArguments = process.argv.slice(2)

mkdirSync(npmCacheDirectory, { recursive: true })

const dockerArguments = [
  'run',
  '--rm',
  '--init',
  '--cpus=2',
  '--memory=4g',
  '--shm-size=1g',
  '-e',
  'CI=true',
  '-e',
  'KADERBLICK_E2E_NO_SANDBOX=1',
  '-e',
  'npm_config_cache=/tmp/npm-cache',
  '-v',
  `${projectRoot}:/work`,
  '-v',
  `${nodeModulesDirectory}:/work/node_modules`,
  '-v',
  `${npmCacheDirectory}:/tmp/npm-cache`,
  '-w',
  '/work'
]

if (typeof process.getuid === 'function' && typeof process.getgid === 'function') {
  dockerArguments.push('--user', `${process.getuid()}:${process.getgid()}`)
}

dockerArguments.push(
  image,
  'bash',
  '-lc',
  [
    'set -e',
    'npm ci',
    'npm run test:e2e:build',
    'npm run test:e2e:media',
    'xvfb-run --auto-servernum npx playwright test e2e/visual "$@"'
  ].join('\n'),
  'bash',
  ...playwrightArguments
)

try {
  const result = spawnSync('docker', dockerArguments, { stdio: 'inherit' })

  if (result.error) {
    throw new Error(`Docker konnte nicht gestartet werden: ${result.error.message}`)
  }

  process.exitCode = result.status ?? 1
} finally {
  rmSync(nodeModulesDirectory, { recursive: true, force: true })
}
