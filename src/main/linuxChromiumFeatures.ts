export const disabledLinuxChromiumFeatures = (
  platform: NodeJS.Platform,
  sessionType: string | undefined
): string[] => {
  if (platform !== 'linux') return []

  const features: string[] = []
  if (sessionType === 'wayland') features.push('WaylandWpColorManagerV1')
  return features
}

export const shouldDisableAcceleratedVideoDecode = (
  platform: NodeJS.Platform,
  hasNvidiaDriver: boolean
): boolean => platform === 'linux' && hasNvidiaDriver
