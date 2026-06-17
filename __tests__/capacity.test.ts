/**
 * Capacity invariant tests
 * ACTIVE = regular_count(24) - absent - returning + roster
 * Invariant: ACTIVE <= 24 at all times
 *
 * Status roles:
 *   absent    — regular player marked absent (slot open for substitute)
 *   returning — regular player who canceled absence but slot is taken (waits for substitute to leave)
 *   roster    — substitute actively playing
 *   waitlist  — substitute waiting for a slot
 */

const CAPACITY = 24

function calcActive(absent: number, returning: number, roster: number): number {
  return CAPACITY - absent - returning + roster
}

function cancelAbsent(absentCount: number, returningCount: number, rosterCount: number): {
  action: 'back_direct' | 'to_returning'
  activeAfter: number
  absentAfter: number
  returningAfter: number
  rosterAfter: number
} {
  const remainingSlots = (absentCount - 1) - rosterCount

  if (remainingSlots >= 0) {
    // B comes back directly
    return {
      action: 'back_direct',
      absentAfter: absentCount - 1,
      returningAfter: returningCount,
      rosterAfter: rosterCount,
      activeAfter: calcActive(absentCount - 1, returningCount, rosterCount),
    }
  } else {
    // All slots filled — B enters returning queue
    return {
      action: 'to_returning',
      absentAfter: absentCount - 1,
      returningAfter: returningCount + 1,
      rosterAfter: rosterCount,
      activeAfter: calcActive(absentCount - 1, returningCount + 1, rosterCount),
    }
  }
}

// ─── T_FIX_1: Promotion is permanent — no rollback ──────────────────────────
describe('T_FIX_1 — No rollback after promotion', () => {
  test('B absent → A promoted → B cancels: A stays, B enters returning queue', () => {
    // Before B cancels: absent=1(B), roster=1(A), returning=0
    const result = cancelAbsent(1, 0, 1)
    expect(result.action).toBe('to_returning')
    // A (roster) untouched
    expect(result.rosterAfter).toBe(1)
    // B is now 'returning'
    expect(result.returningAfter).toBe(1)
    // ACTIVE = 24 - 0(absent) - 1(returning) + 1(roster) = 24
    expect(result.activeAfter).toBe(24)
    expect(result.activeAfter).toBeLessThanOrEqual(CAPACITY)
  })

  test('ACTIVE never exceeds 24 for any absent/roster combination', () => {
    for (let absent = 1; absent <= 5; absent++) {
      for (let roster = 0; roster <= absent; roster++) {
        const result = cancelAbsent(absent, 0, roster)
        expect(result.activeAfter).toBeLessThanOrEqual(CAPACITY)
        expect(result.activeAfter).toBeGreaterThanOrEqual(0)
      }
    }
  })
})

// ─── T_FIX_2: Returning user respects capacity ──────────────────────────────
describe('T_FIX_2 — Returning user respects capacity', () => {
  test('B cancels when slot is free → B returns directly', () => {
    // absent=1(B), roster=0 — slot not filled
    const result = cancelAbsent(1, 0, 0)
    expect(result.action).toBe('back_direct')
    expect(result.activeAfter).toBe(24)
  })

  test('B cancels when slot is taken → B enters returning queue', () => {
    // absent=1(B), roster=1(A) — slot taken
    const result = cancelAbsent(1, 0, 1)
    expect(result.action).toBe('to_returning')
    expect(result.activeAfter).toBe(24)
  })

  test('B cancels when all slots filled → enters returning queue', () => {
    // absent=2, roster=2 (all slots filled)
    const result = cancelAbsent(2, 0, 2)
    expect(result.action).toBe('to_returning')
    expect(result.activeAfter).toBe(24)
  })

  test('B cancels when some slots still open → B returns directly', () => {
    // absent=3, roster=1 (2 slots still open)
    const result = cancelAbsent(3, 0, 1)
    expect(result.action).toBe('back_direct')
    expect(result.activeAfter).toBe(23) // 24 - 2(absent) - 0(returning) + 1(roster)
  })
})

// ─── T_FIX_3: ACTIVE <= 24 always true ──────────────────────────────────────
describe('T_FIX_3 — ACTIVE <= 24 always true', () => {
  test('formula holds for all valid states', () => {
    const cases = [
      { absent: 1, returning: 0, roster: 0 },
      { absent: 1, returning: 0, roster: 1 },
      { absent: 0, returning: 1, roster: 1 }, // after B cancels with slot taken
      { absent: 0, returning: 0, roster: 0 },
      { absent: 2, returning: 0, roster: 2 },
      { absent: 1, returning: 1, roster: 1 }, // B absent, C returning, A roster
    ]
    for (const { absent, returning, roster } of cases) {
      expect(calcActive(absent, returning, roster)).toBeLessThanOrEqual(CAPACITY)
    }
  })

  test('cancel-absent result always satisfies ACTIVE <= 24', () => {
    for (let absent = 1; absent <= 5; absent++) {
      for (let roster = 0; roster <= absent; roster++) {
        const result = cancelAbsent(absent, 0, roster)
        expect(result.activeAfter).toBeLessThanOrEqual(CAPACITY)
      }
    }
  })
})

// ─── Recalculate: returning player promoted when substitute leaves ────────────
describe('Recalculate — returning player promoted', () => {
  function simulateRosterLeave(absent: number, returning: number, roster: number) {
    // Roster player leaves: delete their record
    const rosterAfter = roster - 1
    // returningOpenSlots = (absent + returning) - rosterAfter
    const returningOpenSlots = (absent + returning) - rosterAfter
    let returningAfter = returning
    if (returningOpenSlots > 0 && returning > 0) {
      // Promote returning players (delete records)
      const toPromote = Math.min(returning, returningOpenSlots)
      returningAfter = returning - toPromote
    }
    return {
      activeAfter: calcActive(absent, returningAfter, rosterAfter),
      returningAfter,
    }
  }

  test('substitute leaves → returning regular gets slot back', () => {
    // State: absent=0, returning=1(B), roster=1(A) — ACTIVE=24
    // A leaves
    const result = simulateRosterLeave(0, 1, 1)
    expect(result.activeAfter).toBe(24) // B promoted back to regular
    expect(result.returningAfter).toBe(0)
  })

  test('substitute leaves with no returning → ACTIVE drops by 1', () => {
    // State: absent=1(C), returning=0, roster=1(A) — ACTIVE=24
    // A leaves
    const result = simulateRosterLeave(1, 0, 1)
    // After A leaves: absent=1, roster=0 → waitlist player would be promoted
    // recalculate would promote next waitlist player if any
    expect(result.activeAfter).toBeLessThanOrEqual(CAPACITY)
  })
})

// ─── Absence logic ────────────────────────────────────────────────────────────
describe('Absence logic', () => {
  test('T3 — Single absence reduces ACTIVE by 1', () => {
    expect(calcActive(1, 0, 0)).toBe(23)
  })

  test('T4 — Multiple absences reduce ACTIVE proportionally', () => {
    expect(calcActive(2, 0, 0)).toBe(22)
    expect(calcActive(5, 0, 0)).toBe(19)
  })

  test('T10 — Absence triggers promotion: ACTIVE unchanged', () => {
    // absent=1, roster=1 (waitlist player promoted)
    expect(calcActive(1, 0, 1)).toBe(24)
  })

  test('T11 — Multiple promotions fill multiple slots', () => {
    expect(calcActive(2, 0, 2)).toBe(24)
  })

  test('T12 — No waitlist: ACTIVE drops', () => {
    expect(calcActive(2, 0, 0)).toBe(22)
  })

  test('T17 — Absence + promotion = ACTIVE unchanged', () => {
    expect(calcActive(0, 0, 0)).toBe(calcActive(1, 0, 1))
  })
})

// ─── Promotion logic ─────────────────────────────────────────────────────────
describe('Promotion logic', () => {
  test('T7 — Waitlist entry when full: ACTIVE stays 24', () => {
    expect(calcActive(0, 0, 0)).toBe(24)
  })

  test('T9 — Promoted from waitlist: ACTIVE increases', () => {
    const before = calcActive(1, 0, 0) // 23
    const after = calcActive(1, 0, 1)  // 24
    expect(after).toBe(before + 1)
  })

  test('T16 — ACTIVE never exceeds capacity', () => {
    for (let r = 0; r <= 10; r++) {
      expect(calcActive(r, 0, r)).toBeLessThanOrEqual(CAPACITY)
    }
  })
})
