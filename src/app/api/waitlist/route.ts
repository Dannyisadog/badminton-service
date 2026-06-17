import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyLineAccessToken, extractBearerToken } from '@/lib/auth'
import { getOrCreatePlayer } from '@/lib/player'
import { notifyGroups, buildJoinNotification } from '@/lib/line'
import { getGroupIds } from '@/lib/groups'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 })

  const { session_id, display_name } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const lineUserId = await verifyLineAccessToken(token)
  if (!lineUserId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const player = await getOrCreatePlayer(lineUserId, display_name)

  const { data: existing } = await supabaseAdmin
    .from('session_players')
    .select('*')
    .eq('session_id', session_id)
    .eq('player_id', player.id)
    .single()

  if (existing) {
    if (existing.status === 'waitlist') {
      const position = await getWaitlistPosition(session_id, existing.created_at)
      return NextResponse.json({ success: true, position })
    }
    return NextResponse.json({ error: 'Already has status: ' + existing.status }, { status: 409 })
  }

  // Server-side slot check: if slots are available, use /api/join instead
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
  if (openSlots > 0) {
    return NextResponse.json({ error: 'Slots available, use /api/join instead' }, { status: 409 })
  }

  const { error: insertErr } = await supabaseAdmin
    .from('session_players')
    .insert({ session_id, player_id: player.id, status: 'waitlist' })

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const [countResult, groups] = await Promise.all([
    supabaseAdmin
      .from('session_players')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session_id)
      .eq('status', 'waitlist'),
    getGroupIds(),
  ])

  const position = countResult.count ?? 1

  if (groups.length > 0) {
    const msg = buildJoinNotification(player.name, 'waitlist', position)
    notifyGroups(groups, msg).catch(console.error)
  }

  return NextResponse.json({ success: true, position })
}

async function getWaitlistPosition(sessionId: string, createdAt: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from('session_players')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'waitlist')
    .lte('created_at', createdAt)
  return count ?? 1
}
