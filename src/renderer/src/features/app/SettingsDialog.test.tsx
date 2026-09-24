import { fireEvent, render, screen } from '@testing-library/react'
import { SettingsDialog } from './SettingsDialog'

describe('SettingsDialog', () => {
  it('offers the four jump-time interpretations without changing segment times', () => {
    const onJumpTimeModeChange = vi.fn()
    render(
      <SettingsDialog
        open
        jumpTimeMode="match-cumulative"
        onJumpTimeModeChange={onJumpTimeModeChange}
        onClose={() => undefined}
      />
    )

    expect(screen.getByRole('radio', { name: /Videozeit – je Video/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Videozeit – fortlaufend/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Spielzeit – je Halbzeit\/Teil/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Spielzeit – fortlaufend/ })).toBeChecked()
    expect(screen.getByText(/CSV- und Segmentzeiten bleiben immer direkte Videozeiten/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Videozeit – je Video/ }))
    expect(onJumpTimeModeChange).toHaveBeenCalledWith('video-per-file')
  })
})
