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

  // remainingSlots = (absent - 1) - roster
  // >= 0: B comes back directly (unfilled slots still exist)
  // < 0: all slots filled by substitutes — B queues as 'returning'
  const remainingSlots = (absentCount - 1) - rosterCount

  if (remainingSlots >= 0) {
    // Slot still available — B returns as regular immediately
    await supabaseAdmin
      .from('session_players')
      .delete()
      .eq('session_id', session_id)
      .eq('player_id', player.id)

    // Other absent slots may still need filling
    if (remainingSlots > 0) {
      await recalculate(session_id)
    }

    const groups = await getGroupIds()
    if (groups.length > 0) {
      notifyGroups(groups, buildCancelAbsentNotification(player.name, 'back')).catch(console.error)
    }
    return NextResponse.json({ success: true, status: 'back' })
  } else {
    // All slots filled by substitutes — B enters the 'returning' queue
    // A (roster) keeps their spot; ACTIVE = 24 - 0(absent) - 1(returning) + 1(roster) = 24
    await supabaseAdmin
      .from('session_players')
      .update({ status: 'returning' })
      .eq('session_id', session_id)
      .eq('player_id', player.id)

    const groups = await getGroupIds()
    if (groups.length > 0) {
      notifyGroups(groups, buildCancelAbsentNotification(player.name, 'returning')).catch(console.error)
    }
    return NextResponse.json({ success: true, status: 'returning' })
  }
}
