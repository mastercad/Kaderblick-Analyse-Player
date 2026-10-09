import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ffmpegPath from 'ffmpeg-static'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputDirectory = path.join(root, '.cache', 'e2e-media')
const mode = process.argv[2] ?? 'standard'
const longDuration = Number.parseInt(process.env.KADERBLICK_4K_TEST_SECONDS ?? '70', 10)

if (!ffmpegPath) throw new Error('Das gebündelte FFmpeg-Binary wurde nicht gefunden.')
if (mode !== 'standard' && mode !== '4k') throw new Error(`Unbekannter Medienmodus: ${mode}`)
if (!Number.isFinite(longDuration) || longDuration < 30) {
  throw new Error('KADERBLICK_4K_TEST_SECONDS muss mindestens 30 Sekunden betragen.')
}

mkdirSync(outputDirectory, { recursive: true })

const runFfmpeg = (args) => new Promise((resolve, reject) => {
  const child = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', ...args], {
    stdio: ['ignore', 'inherit', 'inherit']
  })
  child.once('error', reject)
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg endete mit Code ${code}.`)))
})

const createVideo = async ({ name, size, duration, rate, source }) => {
  const destination = path.join(outputDirectory, name)
  const specificationPath = `${destination}.spec.json`
  const specification = JSON.stringify({ size, duration, rate, source })
  if (existsSync(destination) && existsSync(specificationPath) && readFileSync(specificationPath, 'utf8') === specification) return

  const temporary = `${destination}.partial.mp4`
  await runFfmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', `${source}=size=${size}:rate=${rate}:duration=${duration}`,
    '-f', 'lavfi',
    '-i', `sine=frequency=440:sample_rate=48000:duration=${duration}`,
    '-shortest',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-crf', mode === '4k' ? '32' : '24',
    '-pix_fmt', 'yuv420p',
    '-g', String(rate * 2),
    '-c:a', 'aac',
    '-b:a', '96k',
    '-movflags', '+faststart',
    temporary
  ])
  await import('node:fs/promises').then(({ rename }) => rename(temporary, destination))
  writeFileSync(specificationPath, specification, 'utf8')
}

const standardVideos = [
  { name: 'e2e-main.mp4', source: 'testsrc2', size: '1280x720', rate: 25, duration: 18 },
  { name: 'e2e-left.mp4', source: 'smptebars', size: '1280x720', rate: 25, duration: 18 },
  { name: 'e2e-right.mp4', source: 'testsrc', size: '1280x720', rate: 25, duration: 18 }
]

const performanceVideos = [
  { name: 'e2e-4k-main.mp4', source: 'testsrc2', size: '3840x2160', rate: 25, duration: longDuration },
  { name: 'e2e-4k-left.mp4', source: 'smptebars', size: '3840x2160', rate: 25, duration: longDuration },
  { name: 'e2e-4k-right.mp4', source: 'testsrc', size: '3840x2160', rate: 25, duration: longDuration }
]

for (const specification of mode === '4k' ? performanceVideos : standardVideos) {
  await createVideo(specification)
}

console.log(`${mode === '4k' ? '4K-Langzeitmedien' : 'E2E-Testmedien'} liegen unter ${outputDirectory}.`)
