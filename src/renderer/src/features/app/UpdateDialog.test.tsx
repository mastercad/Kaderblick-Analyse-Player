import { fireEvent, render, screen } from '@testing-library/react'
import { UpdateDialog } from './UpdateDialog'

describe('UpdateDialog', () => {
  it('offers a clear choice before downloading', () => {
    const onDownload = vi.fn()
    const onClose = vi.fn()
    render(<UpdateDialog status={{ phase: 'available', version: '2.12.0' }} open onClose={onClose} onDownload={onDownload} onInstallAndRestart={() => {}} />)

    expect(screen.getByRole('heading', { name: 'Update verfügbar' })).toBeInTheDocument()
    expect(screen.getByText('2.12.0')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Herunterladen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Später' }))
    expect(onDownload).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('shows progress without claiming that the app must close', () => {
    render(<UpdateDialog status={{ phase: 'downloading', version: '2.12.0', percent: 42.4 }} open onClose={() => {}} onDownload={() => {}} onInstallAndRestart={() => {}} />)

    expect(screen.getByText('42 %')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ausblenden' })).toBeInTheDocument()
  })

  it('restarts only through the explicit install action', () => {
    const onInstallAndRestart = vi.fn()
    render(<UpdateDialog status={{ phase: 'downloaded', version: '2.12.0' }} open onClose={() => {}} onDownload={() => {}} onInstallAndRestart={onInstallAndRestart} />)

    fireEvent.click(screen.getByRole('button', { name: 'Installieren und neu starten' }))
    expect(onInstallAndRestart).toHaveBeenCalledOnce()
  })
})
