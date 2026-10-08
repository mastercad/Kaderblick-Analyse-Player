export const formatClockTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00'
  }

  const totalSeconds = Math.floor(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return [hours, minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
  }

  return [minutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}

/** Formats fixed segment values as total minutes so 63:30 stays 63:30. */
export const formatSegmentTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const totalSeconds = Math.floor(seconds)
  const totalMinutes = Math.floor(totalSeconds / 60)
  const remainingSeconds = totalSeconds % 60
  return [totalMinutes, remainingSeconds].map((value) => String(value).padStart(2, '0')).join(':')
}
