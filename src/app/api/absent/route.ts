import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyLineAccessToken, extractBearerToken } from '@/lib/auth'
import { getOrCreatePlayer } from '@/lib/player'
import { recalculate } from '@/lib/recalculate'
import { notifyGroups, buildAbsentNotification } from '@/lib/line'
import { getGroupIds } from '@/lib/groups'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 })

  const { session_id } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const [lineUserId, sessionResult] = await Promise.all([
    verifyLineAccessToken(token),
    supabaseAdmin.from('sessions').select('id').eq('id', session_id).single(),
  ])

  if (!lineUserId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  if (!sessionResult.data) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const player = await getOrCreatePlayer(lineUserId)

  const { data: existing } = await supabaseAdmin
    .from('session_players')
    .select('status')
    .eq('session_id', session_id)
    .eq('player_id', player.id)
    .single()

  if (existing?.status === 'absent') {
    return NextResponse.json({ success: true, already_absent: true })
  }

  const { error } = await supabaseAdmin
    .from('session_players')
    .upsert(
      { session_id, player_id: player.id, status: 'absent' },
      { onConflict: 'session_id,player_id' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { promoted } = await recalculate(session_id)
  const promotedPlayer = promoted[0] ?? null

  const [absentResult, rosterResult, groups] = await Promise.all([
    supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', session_id).eq('status', 'absent'),
    supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', session_id).eq('status', 'roster'),
    getGroupIds(),
  ])

  const availableSlots = Math.max(0, (absentResult.count ?? 0) - (rosterResult.count ?? 0))

  if (groups.length > 0) {
    const msg = buildAbsentNotification(player.name, promotedPlayer?.name ?? null, availableSlots)
    notifyGroups(groups, msg).catch(console.error)
  }

  return NextResponse.json({ success: true, promoted_player: promotedPlayer })
}
