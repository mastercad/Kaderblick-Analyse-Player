import { render, screen, within } from '@testing-library/react'
import { defaultFilterSettings } from '../../../../common/filterPresets'
import { VideoWorkspace } from './VideoWorkspace'

describe('VideoWorkspace', () => {
  it('renders overlay dialogs inside the player panel', () => {
    render(
      <VideoWorkspace
        segments={[]}
        filterSettings={defaultFilterSettings}
        filterOverlayVisible
        repeatSingleSegment={false}
        onRepeatSingleSegmentChange={() => undefined}
        onToggleFilterOverlay={() => undefined}
        overlayDialogs={<div data-testid="workspace-overlay">Dialog im Player</div>}
      >
        <div>Overlay-Inhalt</div>
      </VideoWorkspace>
    )

    const playerPanel = screen.getByText('Bitte zuerst ein Video laden').closest('section')

    expect(playerPanel).not.toBeNull()
    expect(within(playerPanel as HTMLElement).getByTestId('workspace-overlay')).toBeInTheDocument()
  })
})