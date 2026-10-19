export function haptic(pattern: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') {
  if (!('vibrate' in navigator)) return;
  const patterns: Record<string, number | number[]> = {
    light: 10,
    medium: 20,
    heavy: 40,
    success: [10, 30, 10],
    error: [60, 30, 60],
  };
  try {
    navigator.vibrate(patterns[pattern]);
  } catch {
    // ignore
  }
}
