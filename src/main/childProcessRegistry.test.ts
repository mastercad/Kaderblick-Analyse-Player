import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

describe('childProcessRegistry', () => {
  it('forcibly terminates running and subsequently registered child processes during shutdown', async () => {
    vi.resetModules()
    const { registerChildProcess, terminateAllChildProcesses } = await import('./childProcessRegistry')
    const runningChild = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn().mockReturnValue(true)
    }) as unknown as ChildProcess
    const lateChild = Object.assign(new EventEmitter(), {
      exitCode: null,
      signalCode: null,
      kill: vi.fn().mockReturnValue(true)
    }) as unknown as ChildProcess

    registerChildProcess(runningChild)
    terminateAllChildProcesses()
    registerChildProcess(lateChild)

    expect(runningChild.kill).toHaveBeenCalledWith('SIGKILL')
    expect(lateChild.kill).toHaveBeenCalledWith('SIGKILL')
  })
})
