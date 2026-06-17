import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyLineAccessToken, extractBearerToken } from '@/lib/auth'
import { recalculate } from '@/lib/recalculate'
import { notifyGroups, buildLeaveNotification } from '@/lib/line'


export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 })

  const lineUserId = await verifyLineAccessToken(token)
  if (!lineUserId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { session_id } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  // Look up player
  const { data: player } = await supabaseAdmin
    .from('players')
    .select('*')
    .eq('line_user_id', lineUserId)
    .single()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  // Check current status
  const { data: sp } = await supabaseAdmin
    .from('session_players')
    .select('*')
    .eq('session_id', session_id)
    .eq('player_id', player.id)
    .single()

  // Idempotent: already absent
  if (sp?.status === 'absent') {
    return NextResponse.json({ success: true, promoted_player: null })
  }

  if (!sp || sp.status === 'waitlist') {
    // Leaving from waitlist = remove the record
    await supabaseAdmin
      .from('session_players')
      .delete()
      .eq('session_id', session_id)
      .eq('player_id', player.id)
    return NextResponse.json({ success: true, promoted_player: null })
  }

  // Mark as absent
  const { error: updateErr } = await supabaseAdmin
    .from('session_players')
    .update({ status: 'absent' })
    .eq('session_id', session_id)
    .eq('player_id', player.id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Trigger reallocation
  const { promoted } = await recalculate(session_id)
  const promotedPlayer = promoted[0] ?? null

  const { count: absentCount } = await supabaseAdmin
    .from('session_players')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session_id)
    .eq('status', 'absent')

  const { count: rosterCount } = await supabaseAdmin
    .from('session_players')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session_id)
    .eq('status', 'roster')

  const availableSlots = Math.max(0, (absentCount ?? 0) - (rosterCount ?? 0))

  const groups = await getGroupIds(session_id)
  if (groups.length > 0) {
    const msg = buildLeaveNotification(player.name, promotedPlayer?.name ?? null, availableSlots)
    await notifyGroups(groups, msg).catch(console.error)
  }

  return NextResponse.json({ success: true, promoted_player: promotedPlayer })
}

async function getGroupIds(sessionId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('groups')
    .select('line_group_id')
    .eq('session_id', sessionId)
  return (data ?? []).map((g: { line_group_id: string }) => g.line_group_id)
}
