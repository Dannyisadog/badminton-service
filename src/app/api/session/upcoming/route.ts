import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getNextSessionDate } from '@/lib/schedule'
import type { SessionStatus, PlayerWithStatus, SessionPlayerWithPlayer } from '@/types'

export const dynamic = 'force-dynamic'

export async function POST() {
  const { dateStr } = getNextSessionDate()

  const session = await findSession(dateStr)

  if (!session) {
    return NextResponse.json({ error: 'No upcoming session found' }, { status: 404 })
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
  const returning = typedRows.filter((r) => r.status === 'returning').map(toEntry)

  const result: SessionStatus = {
    session,
    regular_count: session.regular_count,
    roster,
    absent,
    waitlist,
    returning,
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
