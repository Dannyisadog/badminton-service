import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getNextSessionDate } from '@/lib/schedule'
import type { SessionStatus, PlayerWithStatus, SessionPlayerWithPlayer } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST() {
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

  // Fetch session players with joined player data
  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from('session_players')
    .select('*, players!inner(*)')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 })
  }

  const typedRows = (rows ?? []) as SessionPlayerWithPlayer[]
  const toEntry = (r: SessionPlayerWithPlayer): PlayerWithStatus => ({
    id: r.players.id,
    name: r.players.name,
    line_user_id: r.players.line_user_id,
    status: r.status,
    joined_at: r.created_at,
  })

  const absent = typedRows.filter((r) => r.status === 'absent').map(toEntry)
  const roster = typedRows.filter((r) => r.status === 'roster').map(toEntry)
  const waitlist = typedRows.filter((r) => r.status === 'waitlist').map(toEntry)

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
