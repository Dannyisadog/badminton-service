import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyLineAccessToken, extractBearerToken } from '@/lib/auth'
import { notifyGroups, buildCancelAbsentNotification } from '@/lib/line'
import { getGroupIds } from '@/lib/groups'
import { recalculate } from '@/lib/recalculate'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 })

  const lineUserId = await verifyLineAccessToken(token)
  if (!lineUserId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { session_id } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

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

  if (!sp || sp.status !== 'absent') {
    return NextResponse.json({ error: 'Not currently absent' }, { status: 400 })
  }

  const [absentResult, rosterResult] = await Promise.all([
    supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', session_id).eq('status', 'absent'),
    supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', session_id).eq('status', 'roster'),
  ])

  const absentCount = absentResult.count ?? 0
  const rosterCount = rosterResult.count ?? 0

  // B always comes back as a regular player — delete absent record
  await supabaseAdmin
    .from('session_players')
    .delete()
    .eq('session_id', session_id)
    .eq('player_id', player.id)

  // remainingSlots = slots still available after B returns
  // (absent - 1) = remaining absences, roster = substitutes currently active
  // If negative, there are more substitutes than remaining absent slots → overflow
  const remainingSlots = (absentCount - 1) - rosterCount

  if (remainingSlots < 0) {
    // ACTIVE would be 25 — demote the newest substitute back to waitlist
    const { data: newestRoster } = await supabaseAdmin
      .from('session_players')
      .select('id')
      .eq('session_id', session_id)
      .eq('status', 'roster')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (newestRoster) {
      await supabaseAdmin
        .from('session_players')
        .update({ status: 'waitlist' })
        .eq('id', newestRoster.id)
    }
  } else if (remainingSlots > 0) {
    // Open slots exist — try to fill from waitlist
    await recalculate(session_id)
  }

  const groups = await getGroupIds()
  if (groups.length > 0) {
    // B always comes back as regular
    const msg = buildCancelAbsentNotification(player.name, 'back')
    notifyGroups(groups, msg).catch(console.error)
  }

  return NextResponse.json({ success: true, status: 'back' })
}
