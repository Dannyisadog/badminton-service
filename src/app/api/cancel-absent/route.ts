import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyLineAccessToken, extractBearerToken } from '@/lib/auth'
import { notifyGroups, buildCancelAbsentNotification } from '@/lib/line'
import { getGroupIds } from '@/lib/groups'

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

  // Slots remaining after A cancels = (absent - 1) - roster
  // If >= 0: A can come back directly (there's still an unfilled absence slot)
  // If < 0: all slots are taken by substitutes — A joins waitlist instead
  const remainingSlots = (absentCount - 1) - rosterCount
  const newStatus: 'back' | 'waitlist' = remainingSlots >= 0 ? 'back' : 'waitlist'

  if (newStatus === 'back') {
    // Room available — delete absent record, A returns as regular
    await supabaseAdmin
      .from('session_players')
      .delete()
      .eq('session_id', session_id)
      .eq('player_id', player.id)
  } else {
    // No room — B keeps their spot, A joins waitlist
    await supabaseAdmin
      .from('session_players')
      .update({ status: 'waitlist' })
      .eq('session_id', session_id)
      .eq('player_id', player.id)
  }

  const groups = await getGroupIds()
  if (groups.length > 0) {
    const msg = buildCancelAbsentNotification(player.name, newStatus)
    notifyGroups(groups, msg).catch(console.error)
  }

  return NextResponse.json({ success: true, status: newStatus })
}
