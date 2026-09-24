import type { ChildProcess } from 'node:child_process'

const activeChildProcesses = new Set<ChildProcess>()
let shuttingDown = false

export const registerChildProcess = <T extends ChildProcess>(child: T): T => {
  if (shuttingDown) {
    child.kill('SIGKILL')
    return child
  }

  activeChildProcesses.add(child)
  child.once('close', () => activeChildProcesses.delete(child))
  child.once('error', () => activeChildProcesses.delete(child))
  return child
}

export const terminateAllChildProcesses = (): void => {
  shuttingDown = true
  for (const child of activeChildProcesses) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }
  activeChildProcesses.clear()
}
