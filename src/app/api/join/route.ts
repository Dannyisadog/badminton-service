import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyLineIdToken, extractBearerToken } from '@/lib/auth'
import { recalculate } from '@/lib/recalculate'
import { notifyGroups, buildJoinNotification } from '@/lib/line'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 })

  const lineUserId = await verifyLineIdToken(token)
  if (!lineUserId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { session_id } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  // Get session capacity
  const { data: session, error: sessionErr } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('id', session_id)
    .single()

  if (sessionErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // Get or create player
  let player = await getOrCreatePlayer(lineUserId)

  // Check existing session_player record
  const { data: existing } = await supabaseAdmin
    .from('session_players')
    .select('*')
    .eq('session_id', session_id)
    .eq('player_id', player.id)
    .single()

  if (existing && existing.status !== 'absent') {
    return NextResponse.json({ success: true, status: existing.status })
  }

  // Determine if roster slot available
  const { count: rosterCount } = await supabaseAdmin
    .from('session_players')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session_id)
    .eq('status', 'roster')

  const status = (rosterCount ?? 0) < session.capacity ? 'roster' : 'waitlist'

  const { error: upsertErr } = await supabaseAdmin
    .from('session_players')
    .upsert(
      { session_id, player_id: player.id, status },
      { onConflict: 'session_id,player_id' }
    )

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  // Get waitlist position if needed
  let waitlistPosition: number | undefined
  if (status === 'waitlist') {
    const { count } = await supabaseAdmin
      .from('session_players')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session_id)
      .eq('status', 'waitlist')
    waitlistPosition = count ?? 1
  }

  // Notify LINE group
  const { count: newRosterCount } = await supabaseAdmin
    .from('session_players')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session_id)
    .eq('status', 'roster')

  const groups = await getGroupIds(session_id)
  if (groups.length > 0) {
    const msg = buildJoinNotification(
      player.name,
      status,
      newRosterCount ?? 0,
      session.capacity,
      waitlistPosition
    )
    await notifyGroups(groups, msg).catch(console.error)
  }

  return NextResponse.json({ success: true, status })
}

async function getOrCreatePlayer(lineUserId: string) {
  const { data: existing } = await supabaseAdmin
    .from('players')
    .select('*')
    .eq('line_user_id', lineUserId)
    .single()

  if (existing) return existing

  // Fetch display name from LINE
  const profileRes = await fetch('https://api.line.me/v2/profile', {
    headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
  })
  const profile = profileRes.ok ? await profileRes.json() : null
  const name = profile?.displayName ?? `User-${lineUserId.slice(-4)}`

  const { data: created } = await supabaseAdmin
    .from('players')
    .insert({ line_user_id: lineUserId, name })
    .select()
    .single()

  return created!
}

async function getGroupIds(sessionId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from('groups')
    .select('line_group_id')
    .eq('session_id', sessionId)
  return (data ?? []).map((g: { line_group_id: string }) => g.line_group_id)
}
