import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyLineIdToken, extractBearerToken } from '@/lib/auth'
import { recalculate } from '@/lib/recalculate'
import { notifyGroups, buildAbsentNotification } from '@/lib/line'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 })

  const lineUserId = await verifyLineIdToken(token)
  if (!lineUserId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { session_id } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('id')
    .eq('id', session_id)
    .single()
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // Get or create player
  let player = await getOrCreatePlayer(lineUserId)

  // Check existing record
  const { data: existing } = await supabaseAdmin
    .from('session_players')
    .select('status')
    .eq('session_id', session_id)
    .eq('player_id', player.id)
    .single()

  if (existing?.status === 'absent') {
    return NextResponse.json({ success: true, already_absent: true })
  }

  // Upsert as absent
  const { error } = await supabaseAdmin
    .from('session_players')
    .upsert(
      { session_id, player_id: player.id, status: 'absent' },
      { onConflict: 'session_id,player_id' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Promote waitlist if any
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
    const msg = buildAbsentNotification(player.name, promotedPlayer?.name ?? null, availableSlots)
    await notifyGroups(groups, msg).catch(console.error)
  }

  return NextResponse.json({ success: true, promoted_player: promotedPlayer })
}

async function getOrCreatePlayer(lineUserId: string) {
  const { data: existing } = await supabaseAdmin
    .from('players')
    .select('*')
    .eq('line_user_id', lineUserId)
    .single()

  const profileRes = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
    headers: { Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
  })
  const profile = profileRes.ok ? await profileRes.json() : null
  const name = profile?.displayName ?? `User-${lineUserId.slice(-4)}`

  if (existing) {
    if (existing.name.startsWith('User-') && name !== existing.name) {
      await supabaseAdmin.from('players').update({ name }).eq('id', existing.id)
      return { ...existing, name }
    }
    return existing
  }

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
