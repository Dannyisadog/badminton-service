import { getNextSessionDate } from '../schedule'

// Helper: create a Date at a specific Taiwan local time
// e.g. tw(2026, 6, 19, 20) = Friday 2026-06-19 20:00 Taiwan
function tw(year: number, month: number, day: number, hour = 0): Date {
  // Taiwan is UTC+8, so subtract 8h to get UTC equivalent
  return new Date(Date.UTC(year, month - 1, day, hour - 8))
}

describe('getNextSessionDate', () => {
  test('Wednesday → next Friday', () => {
    // 2026-06-17 is Wednesday
    const result = getNextSessionDate(tw(2026, 6, 17, 10))
    expect(result.dateStr).toBe('2026-06-19')
    expect(result.dayOfWeek).toBe('Fri')
  })

  test('Friday before 21:00 → today (Friday)', () => {
    // 2026-06-19 is Friday, game in progress at 20:00
    const result = getNextSessionDate(tw(2026, 6, 19, 20))
    expect(result.dateStr).toBe('2026-06-19')
    expect(result.dayOfWeek).toBe('Fri')
  })

  test('Friday at exactly 21:00 → next Monday', () => {
    // Game is over at 21:00, should show next session
    const result = getNextSessionDate(tw(2026, 6, 19, 21))
    expect(result.dateStr).toBe('2026-06-22')
    expect(result.dayOfWeek).toBe('Mon')
  })

  test('Friday after 21:00 → next Monday', () => {
    const result = getNextSessionDate(tw(2026, 6, 19, 22))
    expect(result.dateStr).toBe('2026-06-22')
    expect(result.dayOfWeek).toBe('Mon')
  })

  test('Saturday → next Monday', () => {
    const result = getNextSessionDate(tw(2026, 6, 20, 10))
    expect(result.dateStr).toBe('2026-06-22')
    expect(result.dayOfWeek).toBe('Mon')
  })

  test('Sunday → next Monday', () => {
    const result = getNextSessionDate(tw(2026, 6, 21, 10))
    expect(result.dateStr).toBe('2026-06-22')
    expect(result.dayOfWeek).toBe('Mon')
  })

  test('Monday before 21:00 → today (Monday)', () => {
    const result = getNextSessionDate(tw(2026, 6, 22, 10))
    expect(result.dateStr).toBe('2026-06-22')
    expect(result.dayOfWeek).toBe('Mon')
  })

  test('Monday at 21:00 → next Friday', () => {
    const result = getNextSessionDate(tw(2026, 6, 22, 21))
    expect(result.dateStr).toBe('2026-06-26')
    expect(result.dayOfWeek).toBe('Fri')
  })

  test('Tuesday → next Friday', () => {
    const result = getNextSessionDate(tw(2026, 6, 23, 10))
    expect(result.dateStr).toBe('2026-06-26')
    expect(result.dayOfWeek).toBe('Fri')
  })

  test('Thursday → next Friday', () => {
    const result = getNextSessionDate(tw(2026, 6, 25, 10))
    expect(result.dateStr).toBe('2026-06-26')
    expect(result.dayOfWeek).toBe('Fri')
  })
})
