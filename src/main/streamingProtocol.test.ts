import { describe, expect, it } from 'vitest'
import { buildStreamingFfmpegArgs } from './streamingProtocol'

describe('streaming protocol FFmpeg arguments', () => {
  it('creates a real-time low-resolution stream without audio for PiP previews', () => {
    const args = buildStreamingFfmpegArgs({
      filePath: '/tmp/4k.mp4',
      startSeconds: 123.5,
      codecName: 'h264',
      preview: true
    })

    expect(args).toEqual(expect.arrayContaining([
      '-re', '-ss', '123.5', '-map', '0:v:0', '-an',
      '-vf', 'fps=15,scale=w=640:h=360:force_original_aspect_ratio=decrease:flags=fast_bilinear',
      '-c:v', 'libx264', '-threads', '2', '-preset', 'ultrafast'
    ]))
    expect(args).not.toContain('copy')
    expect(args).not.toContain('aac')
  })

  it('keeps the established full-size stream behavior outside PiP previews', () => {
    const args = buildStreamingFfmpegArgs({
      filePath: '/tmp/video.mp4',
      startSeconds: 0,
      codecName: 'h264',
      preview: false
    })

    expect(args).toEqual(expect.arrayContaining(['-c:v', 'copy', '-c:a', 'aac']))
    expect(args).not.toContain('-re')
  })
})
