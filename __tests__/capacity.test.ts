/**
 * Capacity invariant tests
 * ACTIVE = regular_count(24) - absent + roster
 * Invariant: ACTIVE <= 24 at all times
 */

const CAPACITY = 24

function calcActive(absent: number, roster: number): number {
  return CAPACITY - absent + roster
}

function cancelAbsent(absentCount: number, rosterCount: number): {
  action: 'back_direct' | 'back_demote_roster'
  activeAfter: number
  rosterAfter: number
  absentAfter: number
} {
  const absentAfter = absentCount - 1
  const remainingSlots = absentAfter - rosterCount

  if (remainingSlots >= 0) {
    return {
      action: 'back_direct',
      absentAfter,
      rosterAfter: rosterCount,
      activeAfter: calcActive(absentAfter, rosterCount),
    }
  } else {
    // Demote newest roster player to preserve capacity
    return {
      action: 'back_demote_roster',
      absentAfter,
      rosterAfter: rosterCount - 1,
      activeAfter: calcActive(absentAfter, rosterCount - 1),
    }
  }
}

// ─── T_FIX_1: No overflow after promotion + cancel ─────────────────────────
describe('T_FIX_1 — No overflow after promotion + cancel', () => {
  test('A on waitlist promoted, B cancels absence → ACTIVE stays 24, A stays active', () => {
    // Before B cancels: B absent(1), A roster(1)
    const result = cancelAbsent(1, 1)
    expect(result.activeAfter).toBe(24)
    expect(result.activeAfter).toBeLessThanOrEqual(CAPACITY)
    expect(result.action).toBe('back_demote_roster')
    // A (roster) was demoted; rosterAfter = 0
    expect(result.rosterAfter).toBe(0)
  })

  test('ACTIVE never exceeds 24 regardless of scenario', () => {
    // All possible combinations of absent/roster (roster <= absent by invariant)
    for (let absent = 1; absent <= 5; absent++) {
      for (let roster = 0; roster <= absent; roster++) {
        const result = cancelAbsent(absent, roster)
        expect(result.activeAfter).toBeLessThanOrEqual(CAPACITY)
        expect(result.activeAfter).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

// ─── T_FIX_2: Returning user respects capacity ──────────────────────────────
describe('T_FIX_2 — Returning user respects capacity', () => {
  test('B cancels absence when slot is free → B returns directly', () => {
    // absent=1 (B), roster=0 → slot not filled
    const result = cancelAbsent(1, 0)
    expect(result.action).toBe('back_direct')
    expect(result.activeAfter).toBe(24)
  })

  test('B cancels absence when slot is taken → newest roster demoted', () => {
    // absent=1 (B), roster=1 (A took B's slot)
    const result = cancelAbsent(1, 1)
    expect(result.action).toBe('back_demote_roster')
    expect(result.activeAfter).toBe(24)
  })

  test('B cancels, multiple absent but all filled → demote newest roster', () => {
    // absent=2, roster=2 (all slots filled)
    const result = cancelAbsent(2, 2)
    expect(result.action).toBe('back_demote_roster')
    expect(result.activeAfter).toBe(24)
  })

  test('B cancels, multiple absent not fully filled → B returns directly', () => {
    // absent=3, roster=1 (2 slots still open)
    const result = cancelAbsent(3, 1)
    expect(result.action).toBe('back_direct')
    expect(result.activeAfter).toBe(23) // 24 - 2 remaining absent + 1 roster
  })
})

// ─── T_FIX_3: Capacity invariant is always maintained ───────────────────────
describe('T_FIX_3 — ACTIVE <= 24 always true', () => {
  test('roster <= absent invariant holds before cancel', () => {
    // roster can never exceed absent (available_slots = absent - roster >= 0)
    const cases = [
      { absent: 1, roster: 0 },
      { absent: 1, roster: 1 },
      { absent: 2, roster: 0 },
      { absent: 2, roster: 1 },
      { absent: 2, roster: 2 },
    ]
    for (const { absent, roster } of cases) {
      expect(calcActive(absent, roster)).toBeLessThanOrEqual(CAPACITY)
    }
  })

  test('cancel-absent result always satisfies ACTIVE <= 24', () => {
    const cases = [
      { absent: 1, roster: 0 },
      { absent: 1, roster: 1 },
      { absent: 2, roster: 1 },
      { absent: 2, roster: 2 },
      { absent: 3, roster: 2 },
      { absent: 3, roster: 3 },
    ]
    for (const { absent, roster } of cases) {
      const result = cancelAbsent(absent, roster)
      expect(result.activeAfter).toBeLessThanOrEqual(CAPACITY)
    }
  })
})

// ─── Absence logic ────────────────────────────────────────────────────────────
describe('Absence logic', () => {
  test('T3 — Single absence reduces ACTIVE by 1', () => {
    expect(calcActive(1, 0)).toBe(23)
  })

  test('T4 — Multiple absences reduce ACTIVE proportionally', () => {
    expect(calcActive(2, 0)).toBe(22)
    expect(calcActive(5, 0)).toBe(19)
  })

  test('T10 — Absence triggers promotion: ACTIVE unchanged', () => {
    // absent=1, waitlist=[Kevin] → Kevin promoted to roster=1
    expect(calcActive(1, 1)).toBe(24)
  })

  test('T11 — Multiple promotions fill multiple slots', () => {
    // absent=2, roster=2 (A and B both promoted)
    expect(calcActive(2, 2)).toBe(24)
  })

  test('T12 — No waitlist: ACTIVE drops', () => {
    // absent=2, roster=0
    expect(calcActive(2, 0)).toBe(22)
  })

  test('T17 — Absence + promotion = ACTIVE unchanged', () => {
    const before = calcActive(0, 0)   // 24
    const after = calcActive(1, 1)    // 24 - 1 + 1
    expect(after).toBe(before)
  })
})

// ─── Promotion logic ─────────────────────────────────────────────────────────
describe('Promotion logic', () => {
  test('T7 — Waitlist entry when full: ACTIVE stays 24', () => {
    // No absent, full capacity — A waits
    expect(calcActive(0, 0)).toBe(24)
    // A is in waitlist, doesn't affect ACTIVE
  })

  test('T9 — Promoted from waitlist: ACTIVE increases', () => {
    const before = calcActive(1, 0) // 23 — slot open
    const after = calcActive(1, 1)  // 24 — slot filled
    expect(after).toBe(before + 1)
  })

  test('T16 — ACTIVE never exceeds capacity regardless of roster count', () => {
    // roster can never exceed absent
    for (let r = 0; r <= 10; r++) {
      // with absent = r (maximum valid roster = absent)
      expect(calcActive(r, r)).toBeLessThanOrEqual(CAPACITY)
    }
  })
})
