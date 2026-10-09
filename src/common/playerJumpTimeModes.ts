import type { PlayerJumpTimeMode } from './types'

export interface PlayerJumpTimeModeOption {
  value: PlayerJumpTimeMode
  title: string
  description: string
}

export const PLAYER_JUMP_TIME_MODE_OPTIONS: PlayerJumpTimeModeOption[] = [
  { value: 'video-per-file', title: 'Videozeit – je Video', description: 'Die Zeit bezeichnet die direkte Position im aktuell geöffneten Video.' },
  { value: 'video-cumulative', title: 'Videozeit – fortlaufend', description: 'Die Zeit läuft über die geladenen Videos dieses Spiels hinweg weiter.' },
  { value: 'match-per-part', title: 'Spielzeit – je Halbzeit/Teil', description: 'Die Zeit beginnt in jeder Halbzeit beziehungsweise jedem Spielabschnitt wieder bei 00:00.' },
  { value: 'match-cumulative', title: 'Spielzeit – fortlaufend', description: 'Die Zeit entspricht der Spieluhr und läuft über alle Spielabschnitte hinweg weiter.' }
]

export const getPlayerJumpTimeModeOption = (mode: PlayerJumpTimeMode): PlayerJumpTimeModeOption => (
  PLAYER_JUMP_TIME_MODE_OPTIONS.find((option) => option.value === mode) ?? PLAYER_JUMP_TIME_MODE_OPTIONS[3]
)
