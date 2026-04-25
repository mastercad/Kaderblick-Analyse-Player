interface CodecStreamingDialogProps {
  open: boolean
  fileName: string
  onConfirm: () => void
  onCancel: () => void
}

export function CodecStreamingDialog({ open, fileName, onConfirm, onCancel }: CodecStreamingDialogProps) {
  if (!open) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <section
        aria-labelledby="codec-streaming-dialog-title"
        aria-modal="true"
        className="modal-card"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">Codec nicht unterstützt</p>
            <h2 id="codec-streaming-dialog-title">Wiedergabe nicht möglich</h2>
          </div>
        </div>

        <p className="about-text">
          <strong>{fileName}</strong> verwendet einen Videocodec, der von diesem Player nicht direkt abgespielt werden kann.
        </p>

        <p className="about-text">
          Der Player kann die Datei über einen Echtzeit-Transcode per ffmpeg streamen. Dabei gelten folgende Einschränkungen:
        </p>

        <ul className="simple-list about-text">
          <li>Auflösung wird auf maximal 1080p begrenzt</li>
          <li>Hohe CPU-Last während der Wiedergabe</li>
          <li>Sprünge im Video sind langsam und ungenau</li>
        </ul>

        <p className="about-text">
          Für professionelle Videoanalyse empfiehlt sich eine Vorkonvertierung der Datei zu H.264 (z. B. mit Handbrake oder ffmpeg).
        </p>

        <div className="button-stack modal-card__actions">
          <button className="button button--primary" type="button" onClick={onConfirm}>
            Trotzdem streamen (1080p, Echtzeit-Transcode)
          </button>
          <button className="button" type="button" onClick={onCancel}>
            Abbrechen
          </button>
        </div>
      </section>
    </div>
  )
}
