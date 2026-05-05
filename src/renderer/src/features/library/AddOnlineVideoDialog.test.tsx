import { act, fireEvent, render, screen } from '@testing-library/react'
import { AddOnlineVideoDialog } from './AddOnlineVideoDialog'

const defaultProps = {
  open: true,
  existingPaths: new Set<string>(),
  onAdd: vi.fn(),
  onClose: vi.fn()
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

describe('AddOnlineVideoDialog – visibility', () => {
  it('renders the dialog when open=true', () => {
    render(<AddOnlineVideoDialog {...defaultProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Online-Video hinzufügen')).toBeInTheDocument()
  })

  it('renders nothing when open=false', () => {
    render(<AddOnlineVideoDialog {...defaultProps} open={false} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('resets the input when reopened', () => {
    const { rerender } = render(<AddOnlineVideoDialog {...defaultProps} open={true} />)
    const input = screen.getByLabelText(/YouTube- oder Vimeo-URL/)
    fireEvent.change(input, { target: { value: 'https://youtu.be/abc1234567a' } })

    rerender(<AddOnlineVideoDialog {...defaultProps} open={false} />)
    rerender(<AddOnlineVideoDialog {...defaultProps} open={true} />)

    expect(screen.getByLabelText(/YouTube- oder Vimeo-URL/)).toHaveValue('')
  })
})

// ---------------------------------------------------------------------------
// Close behaviour
// ---------------------------------------------------------------------------

describe('AddOnlineVideoDialog – close', () => {
  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<AddOnlineVideoDialog {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Schließen/ }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Abbrechen is clicked', () => {
    const onClose = vi.fn()
    render(<AddOnlineVideoDialog {...defaultProps} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: /Abbrechen/ }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn()
    render(<AddOnlineVideoDialog {...defaultProps} onClose={onClose} />)
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not call onClose on Escape when dialog is closed', () => {
    const onClose = vi.fn()
    render(<AddOnlineVideoDialog {...defaultProps} open={false} onClose={onClose} />)
    act(() => { fireEvent.keyDown(window, { key: 'Escape' }) })
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

describe('AddOnlineVideoDialog – validation', () => {
  it('shows an error when submitting an empty URL', () => {
    render(<AddOnlineVideoDialog {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /Hinzufügen/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/Bitte eine URL eingeben/)
  })

  it('shows an error for an unrecognized URL', () => {
    render(<AddOnlineVideoDialog {...defaultProps} />)
    const input = screen.getByLabelText(/YouTube- oder Vimeo-URL/)
    fireEvent.change(input, { target: { value: 'https://example.com/video' } })
    fireEvent.click(screen.getByRole('button', { name: /Hinzufügen/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/konnte nicht erkannt werden/)
  })

  it('shows an error when the video is already in the library', () => {
    const existingPaths = new Set(['youtube:dQw4w9WgXcQ'])
    render(<AddOnlineVideoDialog {...defaultProps} existingPaths={existingPaths} />)
    const input = screen.getByLabelText(/YouTube- oder Vimeo-URL/)
    fireEvent.change(input, { target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } })
    fireEvent.click(screen.getByRole('button', { name: /Hinzufügen/ }))
    expect(screen.getByRole('alert')).toHaveTextContent(/bereits in der Bibliothek/)
  })

  it('clears the error message when the user changes the input', () => {
    render(<AddOnlineVideoDialog {...defaultProps} />)
    // Trigger error
    fireEvent.click(screen.getByRole('button', { name: /Hinzufügen/ }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    // Type something to clear
    fireEvent.change(screen.getByLabelText(/YouTube- oder Vimeo-URL/), { target: { value: 'x' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Successful submission
// ---------------------------------------------------------------------------

describe('AddOnlineVideoDialog – successful add', () => {
  it('calls onAdd with a YouTube descriptor and onClose for a valid YouTube URL', () => {
    const onAdd = vi.fn()
    const onClose = vi.fn()
    render(<AddOnlineVideoDialog {...defaultProps} onAdd={onAdd} onClose={onClose} />)

    fireEvent.change(screen.getByLabelText(/YouTube- oder Vimeo-URL/), {
      target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Hinzufügen/ }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    const descriptor = onAdd.mock.calls[0][0]
    expect(descriptor.path).toBe('youtube:dQw4w9WgXcQ')
    expect(descriptor.playbackMode).toBe('online')
    expect(descriptor.onlinePlatform).toBe('youtube')
    expect(descriptor.onlineVideoId).toBe('dQw4w9WgXcQ')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onAdd with a Vimeo descriptor for a valid Vimeo URL', () => {
    const onAdd = vi.fn()
    render(<AddOnlineVideoDialog {...defaultProps} onAdd={onAdd} />)

    fireEvent.change(screen.getByLabelText(/YouTube- oder Vimeo-URL/), {
      target: { value: 'https://vimeo.com/123456789' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Hinzufügen/ }))

    expect(onAdd).toHaveBeenCalledTimes(1)
    const descriptor = onAdd.mock.calls[0][0]
    expect(descriptor.path).toBe('vimeo:123456789')
    expect(descriptor.onlinePlatform).toBe('vimeo')
  })

  it('can be submitted via Enter key on the form', () => {
    const onAdd = vi.fn()
    render(<AddOnlineVideoDialog {...defaultProps} onAdd={onAdd} />)

    const input = screen.getByLabelText(/YouTube- oder Vimeo-URL/)
    fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } })
    fireEvent.submit(input.closest('form')!)

    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('does not call onAdd when URL is invalid', () => {
    const onAdd = vi.fn()
    render(<AddOnlineVideoDialog {...defaultProps} onAdd={onAdd} />)

    fireEvent.change(screen.getByLabelText(/YouTube- oder Vimeo-URL/), {
      target: { value: 'https://example.com' }
    })
    fireEvent.click(screen.getByRole('button', { name: /Hinzufügen/ }))

    expect(onAdd).not.toHaveBeenCalled()
  })
})
