import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyLineAccessToken, extractBearerToken } from '@/lib/auth'
import { recalculate } from '@/lib/recalculate'
import { notifyGroups, buildLeaveNotification } from '@/lib/line'
import { getGroupIds } from '@/lib/groups'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 })

  const { session_id } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const lineUserId = await verifyLineAccessToken(token)
  if (!lineUserId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { data: player } = await supabaseAdmin
    .from('players')
    .select('*')
    .eq('line_user_id', lineUserId)
    .single()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const { data: sp } = await supabaseAdmin
    .from('session_players')
    .select('*')
    .eq('session_id', session_id)
    .eq('player_id', player.id)
    .single()

  // Already absent or not in any list — nothing to do
  if (!sp || sp.status === 'absent') {
    return NextResponse.json({ success: true, promoted_player: null })
  }

  // Waitlist (substitute): just remove from queue, no slot freed
  if (sp.status === 'waitlist') {
    await supabaseAdmin
      .from('session_players')
      .delete()
      .eq('session_id', session_id)
      .eq('player_id', player.id)
    return NextResponse.json({ success: true, promoted_player: null })
  }

  // Returning (regular giving up their re-entry queue): go back to absent
  // A (roster) keeps their slot; ACTIVE = 24 - 1(absent) - 0(returning) + 1(roster) = 24
  if (sp.status === 'returning') {
    await supabaseAdmin
      .from('session_players')
      .update({ status: 'absent' })
      .eq('session_id', session_id)
      .eq('player_id', player.id)
    return NextResponse.json({ success: true, promoted_player: null })
  }

  // Roster (substitute) leaves: delete record and open 1 slot for recalculate
  const { error: deleteErr } = await supabaseAdmin
    .from('session_players')
    .delete()
    .eq('session_id', session_id)
    .eq('player_id', player.id)

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  const { promoted } = await recalculate(session_id)
  const promotedPlayer = promoted[0] ?? null

  const [absentResult, rosterResult, groups] = await Promise.all([
    supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', session_id).eq('status', 'absent'),
    supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', session_id).eq('status', 'roster'),
    getGroupIds(),
  ])

  const availableSlots = Math.max(0, (absentResult.count ?? 0) - (rosterResult.count ?? 0))

  if (groups.length > 0) {
    const msg = buildLeaveNotification(player.name, promotedPlayer?.name ?? null, availableSlots)
    notifyGroups(groups, msg).catch(console.error)
  }

  return NextResponse.json({ success: true, promoted_player: promotedPlayer })
}
