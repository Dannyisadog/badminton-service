import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getNextSessionDate } from '@/lib/schedule'
import type { SessionStatus, PlayerWithStatus } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { dateStr, dayOfWeek: dayOfWeekStr } = getNextSessionDate()

  // Find or create session
  let session = await findSession(dateStr)

  if (!session) {
    const { data, error } = await supabaseAdmin
      .from('sessions')
      .insert({
        date: dateStr,
        day_of_week: dayOfWeekStr,
        capacity: 24,
        regular_count: 24,
        start_time: '19:00:00',
        end_time: '21:00:00',
        location: 'https://maps.app.goo.gl/uvrTdwJoDpj9xkev8',
      })
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message ?? 'Failed to create session' },
        { status: 500 }
      )
    }
    session = data
  }

  // Fetch session players
  const { data: spRows, error: spErr } = await supabaseAdmin
    .from('session_players')
    .select('id, session_id, player_id, status, created_at')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })

  if (spErr) {
    return NextResponse.json({ error: spErr.message }, { status: 500 })
  }

  const playerIds = (spRows ?? []).map((r) => r.player_id)

  let playersMap: Record<string, { id: string; name: string; line_user_id: string }> = {}
  if (playerIds.length > 0) {
    const { data: playersData } = await supabaseAdmin
      .from('players')
      .select('id, name, line_user_id')
      .in('id', playerIds)
    for (const p of playersData ?? []) {
      playersMap[p.id] = p
    }
  }

  const toEntry = (r: { player_id: string; status: string; created_at: string }) => {
    const p = playersMap[r.player_id]
    return p ? { id: p.id, name: p.name, line_user_id: p.line_user_id, status: r.status, joined_at: r.created_at } : null
  }

  const absent = (spRows ?? []).filter((r) => r.status === 'absent').map(toEntry).filter(Boolean) as PlayerWithStatus[]
  const roster = (spRows ?? []).filter((r) => r.status === 'roster').map(toEntry).filter(Boolean) as PlayerWithStatus[]
  const waitlist = (spRows ?? []).filter((r) => r.status === 'waitlist').map(toEntry).filter(Boolean) as PlayerWithStatus[]

  const result: SessionStatus = {
    session,
    regular_count: session.regular_count,
    roster,
    absent,
    waitlist,
    available_slots: Math.max(0, absent.length - roster.length),
  }

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}

async function findSession(dateStr: string) {
  const { data } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('date', dateStr)
    .single()
  return data ?? null
}
