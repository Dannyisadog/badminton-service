import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { SessionStatus, SessionPlayerWithPlayer } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params

  const { data: session, error: sessionErr } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (sessionErr || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from('session_players')
    .select('*, players(*)')
    .eq('session_id', id)
    .order('created_at', { ascending: true })

  if (rowsErr) {
    return NextResponse.json({ error: rowsErr.message }, { status: 500 })
  }

  const typedRows = (rows ?? []) as SessionPlayerWithPlayer[]

  const toEntry = (r: SessionPlayerWithPlayer) => ({
    id: r.players.id,
    name: r.players.name,
    line_user_id: r.players.line_user_id,
    status: r.status,
    joined_at: r.created_at,
  })

  const roster = typedRows.filter((r) => r.status === 'roster').map(toEntry)
  const absent = typedRows.filter((r) => r.status === 'absent').map(toEntry)
  const waitlist = typedRows.filter((r) => r.status === 'waitlist').map(toEntry)

  const result: SessionStatus = {
    session,
    regular_count: session.regular_count,
    roster,
    absent,
    waitlist,
    returning: typedRows.filter((r) => r.status === 'returning').map(toEntry),
    available_slots: Math.max(0, absent.length - roster.length),
  }

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
