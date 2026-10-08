import { describe, expect, it } from 'vitest'
import { determineReleaseType, formatChangelogEntry, incrementVersion } from './releasePlan.mjs'

const commit = (subject, body = '', hash = '1234567890abcdef') => ({ subject, body, hash })

describe('determineReleaseType', () => {
  it('erzeugt für Fixes ein Patch-Release', () => {
    expect(determineReleaseType([commit('fix(player): correct seeking')])).toBe('patch')
  })

  it('priorisiert Features vor Fixes', () => {
    expect(determineReleaseType([commit('fix: repair export'), commit('feat: add updater')])).toBe('minor')
  })

  it('priorisiert Breaking Changes vor Features', () => {
    expect(determineReleaseType([commit('feat: add setting'), commit('refactor!: replace settings')])).toBe('major')
    expect(determineReleaseType([commit('refactor: replace settings', 'BREAKING CHANGE: old settings are invalid')])).toBe('major')
  })

  it('ignoriert Release- und nicht release-relevante Commits', () => {
    expect(determineReleaseType([commit('chore(release): 2.9.1 [skip ci]'), commit('docs: update readme')])).toBeNull()
  })
})

describe('incrementVersion', () => {
  it.each([
    ['patch', '2.9.2'],
    ['minor', '2.10.0'],
    ['major', '3.0.0']
  ])('erhöht %s korrekt', (releaseType, expected) => {
    expect(incrementVersion('2.9.1', releaseType)).toBe(expected)
  })
})

describe('formatChangelogEntry', () => {
  it('gruppiert Änderungen und verwendet den vorhandenen Tag als Vergleich', () => {
    const result = formatChangelogEntry({
      commits: [commit('feat: add updater'), commit('fix: repair export', '', 'abcdef1234567890')],
      previousTag: 'v2.9.1',
      version: '2.10.0',
      repositoryUrl: 'https://github.com/example/project',
      date: '2026-10-08'
    })

    expect(result).toContain('compare/v2.9.1...v2.10.0')
    expect(result).toContain('### Features')
    expect(result).toContain('### Bug Fixes')
    expect(result).toContain('/commit/abcdef1234567890')
  })
})
