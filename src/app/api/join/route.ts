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

  const [lineUserId, sessionResult] = await Promise.all([
    verifyLineAccessToken(token),
    supabaseAdmin.from('sessions').select('id').eq('id', session_id).single(),
  ])

  if (!lineUserId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  if (!sessionResult.data) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const player = await getOrCreatePlayer(lineUserId, display_name)

  const { data: existing } = await supabaseAdmin
    .from('session_players')
    .select('*')
    .eq('session_id', session_id)
    .eq('player_id', player.id)
    .single()

  if (existing?.status === 'absent') {
    return NextResponse.json({ error: 'Please cancel absence first' }, { status: 409 })
  }

  if (existing) {
    return NextResponse.json({ success: true, status: existing.status })
  }

  const [absentResult, rosterResult] = await Promise.all([
    supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', session_id).eq('status', 'absent'),
    supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', session_id).eq('status', 'roster'),
  ])

  const openSlots = (absentResult.count ?? 0) - (rosterResult.count ?? 0)
  const status = openSlots > 0 ? 'roster' : 'waitlist'

  const { error: upsertErr } = await supabaseAdmin
    .from('session_players')
    .upsert({ session_id, player_id: player.id, status }, { onConflict: 'session_id,player_id' })

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  const [waitlistResult, groups] = await Promise.all([
    status === 'waitlist'
      ? supabaseAdmin.from('session_players').select('*', { count: 'exact', head: true }).eq('session_id', session_id).eq('status', 'waitlist')
      : Promise.resolve({ count: undefined }),
    getGroupIds(),
  ])

  if (groups.length > 0) {
    const msg = buildJoinNotification(player.name, status, waitlistResult.count ?? undefined)
    notifyGroups(groups, msg).catch(console.error)
  }

  return NextResponse.json({ success: true, status })
}
