import { promises as fs } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

const testRoot = path.join(tmpdir(), `kaderblick-preview-storage-${process.pid}`)

vi.mock('electron', () => ({ app: { getPath: () => testRoot } }))

describe('timelinePreviewStorage', () => {
  beforeEach(async () => {
    await fs.rm(testRoot, { recursive: true, force: true })
    await fs.mkdir(testRoot, { recursive: true })
  })

  afterAll(async () => {
    await fs.rm(testRoot, { recursive: true, force: true })
  })

  it('stores storyboard sheets, selects a nearby cell and persists completion', async () => {
    const sourcePath = path.join(testRoot, 'match.mp4')
    await fs.writeFile(sourcePath, 'video')
    const storage = await import('./timelinePreviewStorage')
    await storage.storeTimelinePreviewSheet(sourcePath, {
      phase: 'coarse',
      targets: [0, 10, 20],
      columns: 5,
      rows: 5,
      imageBytes: new Uint8Array([1, 2, 3])
    })
    await storage.markTimelinePreviewPhaseComplete(sourcePath, 'coarse')

    const frame = await storage.getTimelinePreviewFrame(sourcePath, 11)
    expect(frame).toMatchObject({ column: 1, row: 0, columns: 5, rows: 5 })
    expect(frame?.imageUrl).toBe('data:image/webp;base64,AQID')
    await expect(storage.getTimelinePreviewFrame(sourcePath, 40)).resolves.toBeNull()
    await expect(storage.getTimelinePreviewCacheState(sourcePath)).resolves.toMatchObject({ coarseComplete: true, fineComplete: false })
  })

  it('invalidates cached data when the source file changes', async () => {
    const sourcePath = path.join(testRoot, 'changed.mp4')
    await fs.writeFile(sourcePath, 'first')
    const storage = await import('./timelinePreviewStorage')
    await storage.storeTimelinePreviewSheet(sourcePath, {
      phase: 'fine', targets: [0], columns: 1, rows: 1, imageBytes: new Uint8Array([1])
    })
    await new Promise((resolve) => setTimeout(resolve, 5))
    await fs.writeFile(sourcePath, 'changed-content')
    await expect(storage.getTimelinePreviewCacheState(sourcePath)).resolves.toEqual({ coarseComplete: false, fineComplete: false, cachedTargets: [] })
  })

  it('serializes concurrent sheet writes without losing manifest entries', async () => {
    const sourcePath = path.join(testRoot, 'concurrent.mp4')
    await fs.writeFile(sourcePath, 'video')
    const storage = await import('./timelinePreviewStorage')

    await Promise.all(Array.from({ length: 12 }, (_, target) => storage.storeTimelinePreviewSheet(sourcePath, {
      phase: 'fine',
      targets: [target],
      columns: 1,
      rows: 1,
      imageBytes: new Uint8Array([target])
    })))

    const state = await storage.getTimelinePreviewCacheState(sourcePath)
    expect(state.cachedTargets).toHaveLength(12)
    expect([...state.cachedTargets].sort((left, right) => left - right)).toEqual(Array.from({ length: 12 }, (_, index) => index))
  })
})
