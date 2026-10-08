const RELEASE_COMMIT_PATTERN = /^chore\(release\):/i
const CONVENTIONAL_COMMIT_PATTERN = /^(?<type>[a-z]+)(?:\([^)]+\))?(?<breaking>!)?:\s*(?<description>.+)$/i

export function determineReleaseType(commits) {
  let releaseType = null

  for (const commit of commits) {
    const subject = commit.subject.trim()
    if (RELEASE_COMMIT_PATTERN.test(subject)) continue

    const match = subject.match(CONVENTIONAL_COMMIT_PATTERN)
    const hasBreakingChange = match?.groups?.breaking === '!' || /^BREAKING(?: |-)?CHANGE:/im.test(commit.body)

    if (hasBreakingChange) return 'major'
    if (match?.groups?.type.toLowerCase() === 'feat') releaseType = 'minor'
    if (releaseType === null && ['fix', 'perf', 'revert'].includes(match?.groups?.type.toLowerCase())) {
      releaseType = 'patch'
    }
  }

  return releaseType
}

export function incrementVersion(version, releaseType) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) throw new Error(`Ungültige Versionsnummer: ${version}`)

  const [, majorText, minorText, patchText] = match
  const major = Number(majorText)
  const minor = Number(minorText)
  const patch = Number(patchText)

  if (releaseType === 'major') return `${major + 1}.0.0`
  if (releaseType === 'minor') return `${major}.${minor + 1}.0`
  if (releaseType === 'patch') return `${major}.${minor}.${patch + 1}`
  throw new Error(`Ungültiger Release-Typ: ${releaseType}`)
}

export function formatChangelogEntry({ commits, previousTag, version, repositoryUrl, date }) {
  const nextTag = `v${version}`
  const sections = [
    ['Breaking Changes', commits.filter((commit) => isBreakingCommit(commit))],
    ['Features', commits.filter((commit) => commitType(commit) === 'feat' && !isBreakingCommit(commit))],
    ['Bug Fixes', commits.filter((commit) => ['fix', 'perf', 'revert'].includes(commitType(commit)) && !isBreakingCommit(commit))]
  ].filter(([, entries]) => entries.length > 0)

  const lines = [`## [${version}](${repositoryUrl}/compare/${previousTag}...${nextTag}) (${date})`]
  for (const [heading, entries] of sections) {
    lines.push('', `### ${heading}`, '')
    for (const commit of entries) {
      const shortHash = commit.hash.slice(0, 7)
      lines.push(`* ${commit.subject} ([${shortHash}](${repositoryUrl}/commit/${commit.hash}))`)
    }
  }

  return `${lines.join('\n')}\n\n`
}

function commitType(commit) {
  return commit.subject.match(CONVENTIONAL_COMMIT_PATTERN)?.groups?.type.toLowerCase() ?? ''
}

function isBreakingCommit(commit) {
  const match = commit.subject.match(CONVENTIONAL_COMMIT_PATTERN)
  return match?.groups?.breaking === '!' || /^BREAKING(?: |-)?CHANGE:/im.test(commit.body)
}
