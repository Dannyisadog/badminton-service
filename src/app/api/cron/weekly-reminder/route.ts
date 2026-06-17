import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyCronSecret } from '@/lib/auth'
import { buildSessionSummary, notifyGroups } from '@/lib/line'
import type { SessionStatus, SessionPlayerWithPlayer } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Find next upcoming session (Mon or Fri)
  const today = new Date().toISOString().split('T')[0]
  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(1)
    .single()

  if (error || !session) {
    return NextResponse.json({ error: 'No upcoming session found' }, { status: 404 })
  }

  // Build session status
  const { data: rows } = await supabaseAdmin
    .from('session_players')
    .select('*, players(*)')
    .eq('session_id', session.id)
    .order('created_at', { ascending: true })

  const typedRows = (rows ?? []) as SessionPlayerWithPlayer[]
  const toEntry = (r: SessionPlayerWithPlayer) => ({
    id: r.players.id,
    name: r.players.name,
    line_user_id: r.players.line_user_id,
    status: r.status,
    joined_at: r.created_at,
  })

  const status: SessionStatus = {
    session,
    roster: typedRows.filter((r) => r.status === 'roster').map(toEntry),
    absent: typedRows.filter((r) => r.status === 'absent').map(toEntry),
    waitlist: typedRows.filter((r) => r.status === 'waitlist').map(toEntry),
    available_slots: session.capacity - typedRows.filter((r) => r.status === 'roster').length,
  }

  // Get all groups linked to this session
  const { data: groups } = await supabaseAdmin
    .from('groups')
    .select('line_group_id')
    .eq('session_id', session.id)

  const groupIds = (groups ?? []).map((g: { line_group_id: string }) => g.line_group_id)

  if (groupIds.length === 0) {
    return NextResponse.json({ message: 'No groups linked to session' })
  }

  const message = buildSessionSummary(status)
  await notifyGroups(groupIds, message)

  return NextResponse.json({ success: true, notified: groupIds.length })
}
