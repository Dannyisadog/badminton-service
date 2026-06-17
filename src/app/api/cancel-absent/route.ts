import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyLineAccessToken, extractBearerToken } from '@/lib/auth'
import { notifyGroups, buildCancelAbsentNotification } from '@/lib/line'

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

  // Check if their slot is still available
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

  const openSlots = (absentCount ?? 0) - (rosterCount ?? 0)

  let newStatus: 'back' | 'waitlist'

  if (openSlots > 0) {
    // Slot still open — just come back (delete absent record)
    await supabaseAdmin
      .from('session_players')
      .delete()
      .eq('session_id', session_id)
      .eq('player_id', player.id)
    newStatus = 'back'
  } else {
    // Slot taken — join waitlist
    await supabaseAdmin
      .from('session_players')
      .update({ status: 'waitlist' })
      .eq('session_id', session_id)
      .eq('player_id', player.id)
    newStatus = 'waitlist'
  }

  const groups = await getGroupIds(session_id)
  if (groups.length > 0) {
    const msg = buildCancelAbsentNotification(player.name, newStatus)
    await notifyGroups(groups, msg).catch(console.error)
  }

  return NextResponse.json({ success: true, status: newStatus })
}

async function getGroupIds(sessionId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('groups')
    .select('line_group_id')
    .eq('session_id', sessionId)
  return (data ?? []).map((g: { line_group_id: string }) => g.line_group_id)
}
