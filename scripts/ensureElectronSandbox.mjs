import { chmodSync, chownSync, copyFileSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

const REQUIRED_MODE = 0o4755
const projectRoot = path.resolve(import.meta.dirname, '..')
const electronPath = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')
const sandboxPath = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'chrome-sandbox')
const appArmorParser = '/usr/sbin/apparmor_parser'
const appArmorProfilePath = '/etc/apparmor.d/kaderblick-analyse-player-electron'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })

  if (result.error) {
    throw new Error(`${command} konnte nicht gestartet werden: ${result.error.message}`)
  }

  if (result.status !== 0) {
    throw new Error(`${command} ist mit Status ${result.status ?? 'unbekannt'} fehlgeschlagen`)
  }
}

function runAsRoot(command, args) {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    run(command, args)
  } else {
    run('sudo', ['--', command, ...args])
  }
}

function isAppArmorUserNamespaceRestricted() {
  try {
    return readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8').trim() === '1'
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

function areUnprivilegedUserNamespacesDisabled() {
  try {
    return readFileSync('/proc/sys/kernel/unprivileged_userns_clone', 'utf8').trim() === '0'
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

function escapeAppArmorPath(filePath) {
  return filePath.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

function expectedAppArmorProfile() {
  return `abi <abi/4.0>,

include <tunables/global>

"${escapeAppArmorPath(electronPath)}" flags=(unconfined) {
  userns,
}
`
}

function ensureAppArmorProfile() {
  const expectedProfile = expectedAppArmorProfile()

  try {
    if (readFileSync(appArmorProfilePath, 'utf8') === expectedProfile) {
      console.log('[electron-sandbox] Das dauerhafte AppArmor-Profil ist bereits eingerichtet.')
      return
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error
    }
  }

  console.log('[electron-sandbox] Richte einmalig das dauerhafte AppArmor-Profil ein.')
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'kaderblick-apparmor-'))
  const temporaryProfile = path.join(temporaryDirectory, 'profile')

  try {
    writeFileSync(temporaryProfile, expectedProfile, { mode: 0o644 })
    run(appArmorParser, ['--skip-kernel-load', '--skip-cache', temporaryProfile])

    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      copyFileSync(temporaryProfile, appArmorProfilePath)
      chownSync(appArmorProfilePath, 0, 0)
      chmodSync(appArmorProfilePath, 0o644)
    } else {
      runAsRoot('install', [
        '--owner=root',
        '--group=root',
        '--mode=0644',
        temporaryProfile,
        appArmorProfilePath
      ])
    }

    runAsRoot(appArmorParser, ['--replace', appArmorProfilePath])
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }

  console.log('[electron-sandbox] AppArmor-Profil eingerichtet; weitere Installationen brauchen kein sudo.')
}

function readSandboxState() {
  let stat

  try {
    stat = lstatSync(sandboxPath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return null
    }

    throw error
  }

  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Unsicherer Sandbox-Pfad (keine regulaere Datei): ${sandboxPath}`)
  }

  return {
    uid: stat.uid,
    gid: stat.gid,
    mode: stat.mode & 0o7777
  }
}

function isSandboxConfiguredCorrectly(state) {
  return state?.uid === 0 && state.gid === 0 && state.mode === REQUIRED_MODE
}

function ensureSuidSandbox() {
  const initialState = readSandboxState()

  if (initialState === null) {
    console.log('[electron-sandbox] Electron ist nicht installiert; keine Linux-Sandbox einzurichten.')
    return
  }

  if (isSandboxConfiguredCorrectly(initialState)) {
    console.log('[electron-sandbox] chrome-sandbox ist korrekt als root:root mit Modus 4755 eingerichtet.')
    return
  }

  console.log(
    `[electron-sandbox] Repariere chrome-sandbox (aktuell UID:GID ${initialState.uid}:${initialState.gid}, Modus ${initialState.mode.toString(8)}).`
  )

  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    chownSync(sandboxPath, 0, 0)
    chmodSync(sandboxPath, REQUIRED_MODE)
  } else {
    runAsRoot('chown', ['root:root', '--', sandboxPath])
    runAsRoot('chmod', ['4755', '--', sandboxPath])
  }

  const repairedState = readSandboxState()

  if (!isSandboxConfiguredCorrectly(repairedState)) {
    throw new Error(
      `Sandbox-Reparatur nicht wirksam (UID:GID ${repairedState.uid}:${repairedState.gid}, Modus ${repairedState.mode.toString(8)}): ${sandboxPath}`
    )
  }

  console.log('[electron-sandbox] chrome-sandbox wurde als root:root mit Modus 4755 eingerichtet.')
}

if (process.platform !== 'linux') {
  process.exit(0)
}

if (isAppArmorUserNamespaceRestricted()) {
  ensureAppArmorProfile()
} else if (areUnprivilegedUserNamespacesDisabled()) {
  ensureSuidSandbox()
} else {
  console.log('[electron-sandbox] User-Namespaces sind verfügbar; keine privilegierte Einrichtung nötig.')
}
