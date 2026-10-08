import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { determineReleaseType, formatChangelogEntry, incrementVersion } from './releasePlan.mjs'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
const previousTag = git('describe', '--tags', '--match', 'v[0-9]*', '--abbrev=0')
const log = git('log', `${previousTag}..HEAD`, '--format=%H%x1f%s%x1f%b%x1e')
const commits = log
  .split('\x1e')
  .map((record) => record.trim())
  .filter(Boolean)
  .map((record) => {
    const [hash, subject, body = ''] = record.split('\x1f')
    return { hash, subject, body }
  })

const releaseType = determineReleaseType(commits)
if (releaseType === null) {
  writeOutput('release', 'false')
  console.log('Keine release-relevanten Commits seit', previousTag)
  process.exit(0)
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const taggedVersion = previousTag.slice(1)
if (packageJson.version !== taggedVersion) {
  throw new Error(`package.json (${packageJson.version}) stimmt nicht mit ${previousTag} überein`)
}

const version = incrementVersion(packageJson.version, releaseType)
const tag = `v${version}`
execFileSync('npm', ['version', version, '--no-git-tag-version'], { stdio: 'inherit' })

const repositoryUrl = packageJson.repository.url.replace(/\.git$/, '')
const date = new Date().toISOString().slice(0, 10)
const changelogEntry = formatChangelogEntry({ commits, previousTag, version, repositoryUrl, date })
const changelog = readFileSync('CHANGELOG.md', 'utf8')
writeFileSync('CHANGELOG.md', `${changelogEntry}${changelog}`)

writeOutput('release', 'true')
writeOutput('version', version)
writeOutput('tag', tag)
console.log(`Release ${tag} (${releaseType}) vorbereitet`)

function writeOutput(name, value) {
  const outputFile = process.env.GITHUB_OUTPUT
  if (outputFile) {
    writeFileSync(outputFile, `${name}=${value}\n`, { flag: 'a' })
  } else {
    console.log(`${name}=${value}`)
  }
}
