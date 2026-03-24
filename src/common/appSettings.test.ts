import { defaultAppInfo } from './appInfo'
import { buildAppSettingsExport } from './appSettings'
import { sanitizeFilterSettings } from './filterUtils'

describe('appSettings', () => {
  it('builds a portable export snapshot of the current app settings', () => {
    const snapshot = buildAppSettingsExport({
      appInfo: defaultAppInfo,
      selectedVideo: {
        path: '/tmp/match.mp4',
        fileName: 'match.mp4',
        fileUrl: 'file:///tmp/match.mp4'
      },
      selectedCsv: {
        path: '/tmp/segments.csv',
        fileName: 'segments.csv',
        content: 'videoname,start_minute,length_seconds\n'
      },
      matchedSegmentCount: 3,
      selectedPresetId: 'preset-default',
      selectedPresetName: 'Default',
      filterOverlayVisible: true,
      repeatSingleSegment: false,
      filterSettings: sanitizeFilterSettings({ brightness: 120 }),
      customPresets: [
        {
          id: 'custom-1',
          name: 'Abendspiel',
          builtIn: false,
          settings: sanitizeFilterSettings({ contrast: 130 })
        }
      ]
    })

    expect(snapshot.appName).toBe(defaultAppInfo.name)
    expect(snapshot.selectedVideoName).toBe('match.mp4')
    expect(snapshot.matchedSegmentCount).toBe(3)
    expect(snapshot.customPresets).toHaveLength(1)
    expect(snapshot.exportedAt).toMatch(/T/)
  })
})
