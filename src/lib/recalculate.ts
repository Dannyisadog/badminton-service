import { supabaseAdmin } from './supabase'
import { notifyUser, buildPromotionNotification, buildCancelAbsentNotification } from './line'
import type { Player } from '@/types'

export interface RecalculateResult {
  promoted: Player[]
}

export async function recalculate(sessionId: string): Promise<RecalculateResult> {
  const [absentResult, rosterResult, returningResult] = await Promise.all([
    supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', sessionId).eq('status', 'absent'),
    supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', sessionId).eq('status', 'roster'),
    supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', sessionId).eq('status', 'returning'),
  ])

  const absent = absentResult.count ?? 0
  const roster = rosterResult.count ?? 0
  const returning = returningResult.count ?? 0

  const promoted: Player[] = []

  // Phase 1: Bring back 'returning' regulars when ACTIVE < 24
  // A returning player can come back when (absent + returning) > roster
  const returningOpenSlots = (absent + returning) - roster
  if (returningOpenSlots > 0 && returning > 0) {
    type Row = { id: string; player_id: string; players: Player | Player[] | null }

    const { data: returningList } = await supabaseAdmin
      .from('session_players')
      .select('id, player_id, players(id, name, line_user_id)')
      .eq('session_id', sessionId)
      .eq('status', 'returning')
      .order('created_at', { ascending: true })
      .limit(returningOpenSlots)

    if (returningList && returningList.length > 0) {
      const rows = returningList as unknown as Row[]
      const ids = rows.map((r) => r.id)
      await supabaseAdmin.from('session_players').delete().in('id', ids)

      const returningPlayers = rows
        .map((r) => (Array.isArray(r.players) ? r.players[0] : r.players))
        .filter((p): p is Player => p != null)

      await Promise.all(
        returningPlayers.map((p) =>
          notifyUser(p.line_user_id, buildCancelAbsentNotification(p.name, 'back')).catch(console.error)
        )
      )
    }
  }

  // Phase 2: Fill remaining absent slots from waitlist (promote to roster)
  const openSlots = absent - roster
  if (openSlots <= 0) return { promoted }

  const { data: waitlist, error: waitlistErr } = await supabaseAdmin
    .from('session_players')
    .select('id, player_id, players(id, name, line_user_id)')
    .eq('session_id', sessionId)
    .eq('status', 'waitlist')
    .order('created_at', { ascending: true })
    .limit(openSlots)

  if (waitlistErr) throw waitlistErr
  if (!waitlist || waitlist.length === 0) return { promoted }

  type WaitlistRow = { id: string; player_id: string; players: Player | Player[] | null }
  const toPromote = waitlist as unknown as WaitlistRow[]

  const ids = toPromote.map((row) => row.id)
  const { error: updateErr } = await supabaseAdmin
    .from('session_players')
    .update({ status: 'roster' })
    .in('id', ids)

  if (updateErr) throw updateErr

  const promotedPlayers = toPromote
    .map((row) => (Array.isArray(row.players) ? row.players[0] : row.players))
    .filter((p): p is Player => p != null)

  promoted.push(...promotedPlayers)

  await Promise.all(
    promotedPlayers.map((p) =>
      notifyUser(p.line_user_id, buildPromotionNotification(p.name)).catch(console.error)
    )
  )

  return { promoted }
}
