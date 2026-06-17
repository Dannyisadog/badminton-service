import { supabaseAdmin } from './supabase'
import { notifyUser, buildPromotionNotification } from './line'
import type { Player } from '@/types'

export interface RecalculateResult {
  promoted: Player[]
}

export async function recalculate(sessionId: string): Promise<RecalculateResult> {
  // Get session capacity
  const { data: session, error: sessionErr } = await supabaseAdmin
    .from('sessions')
    .select('capacity')
    .eq('id', sessionId)
    .single()

  if (sessionErr || !session) throw new Error('Session not found')

  // Count current roster
  const { count: rosterCount, error: countErr } = await supabaseAdmin
    .from('session_players')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'roster')

  if (countErr) throw countErr

  const openSlots = session.capacity - (rosterCount ?? 0)
  if (openSlots <= 0) return { promoted: [] }

  // Get waitlist in FIFO order
  const { data: waitlist, error: waitlistErr } = await supabaseAdmin
    .from('session_players')
    .select('id, player_id, players(id, name, line_user_id)')
    .eq('session_id', sessionId)
    .eq('status', 'waitlist')
    .order('created_at', { ascending: true })
    .limit(openSlots)

  if (waitlistErr) throw waitlistErr
  if (!waitlist || waitlist.length === 0) return { promoted: [] }

  type WaitlistRow = { id: string; player_id: string; players: Player | Player[] | null }
  const toPromote = waitlist as unknown as WaitlistRow[]

  // Promote waitlist players
  const ids = toPromote.map((row) => row.id)
  const { error: updateErr } = await supabaseAdmin
    .from('session_players')
    .update({ status: 'roster' })
    .in('id', ids)

  if (updateErr) throw updateErr

  const promotedPlayers = toPromote
    .map((row) => (Array.isArray(row.players) ? row.players[0] : row.players))
    .filter((p): p is Player => p != null)

  // Notify each promoted player via LINE DM
  await Promise.all(
    promotedPlayers.map((p) =>
      notifyUser(p.line_user_id, buildPromotionNotification(p.name)).catch(console.error)
    )
  )

  return { promoted: promotedPlayers }
}
