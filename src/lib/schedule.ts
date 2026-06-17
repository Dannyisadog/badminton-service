const TZ_OFFSET_MS = 8 * 60 * 60 * 1000 // UTC+8

/**
 * Get current date string (YYYY-MM-DD) in Taiwan time (UTC+8).
 */
export function getTaiwanDateString(now: Date = new Date()): string {
  const twMs = now.getTime() + TZ_OFFSET_MS
  return new Date(twMs).toISOString().slice(0, 10)
}

/**
 * Get current hour (0-23) in Taiwan time.
 */
export function getTaiwanHour(now: Date = new Date()): number {
  const twMs = now.getTime() + TZ_OFFSET_MS
  return new Date(twMs).getUTCHours()
}

/**
 * Calculate the date string for the next badminton session (Mon or Fri).
 * If today is a game day and the game hasn't ended (before 21:00 Taiwan time),
 * returns today. Otherwise returns the next Mon or Fri.
 */
export function getNextSessionDate(now: Date = new Date()): { dateStr: string; dayOfWeek: 'Mon' | 'Fri' } {
  const twMs = now.getTime() + TZ_OFFSET_MS
  const twDate = new Date(twMs)

  const day = twDate.getUTCDay() // 0=Sun, 1=Mon, ..., 5=Fri, 6=Sat
  const hour = twDate.getUTCHours()

  // If today is a game day and game is not yet over (before 21:00), use today
  const isGameDay = day === 1 || day === 5
  const gameOver = hour >= 21
  const startFromToday = isGameDay && !gameOver

  const baseOffsetDays = startFromToday ? 0 : 1
  const baseTw = new Date(twMs + baseOffsetDays * 86400000)
  const baseDay = baseTw.getUTCDay()

  const daysUntilMon = (1 - baseDay + 7) % 7
  const daysUntilFri = (5 - baseDay + 7) % 7
  const offset = Math.min(
    daysUntilMon === 0 ? 0 : daysUntilMon,
    daysUntilFri === 0 ? 0 : daysUntilFri
  )

  const sessionTw = new Date(baseTw.getTime() + offset * 86400000)
  const dateStr = sessionTw.toISOString().slice(0, 10)
  const sessionDay = sessionTw.getUTCDay()
  const dayOfWeek: 'Mon' | 'Fri' = sessionDay === 1 ? 'Mon' : 'Fri'

  return { dateStr, dayOfWeek }
}
