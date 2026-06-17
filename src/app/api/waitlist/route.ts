import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyLineAccessToken, extractBearerToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const token = extractBearerToken(req.headers.get('Authorization'))
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 401 })

  const lineUserId = await verifyLineAccessToken(token)
  if (!lineUserId) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { session_id } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  const { data: player } = await supabaseAdmin
    .from('players')
    .select('*')
    .eq('line_user_id', lineUserId)
    .single()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  // Check for existing record
  const { data: existing } = await supabaseAdmin
    .from('session_players')
    .select('*')
    .eq('session_id', session_id)
    .eq('player_id', player.id)
    .single()

  if (existing) {
    // Return current position if already on waitlist
    if (existing.status === 'waitlist') {
      const position = await getWaitlistPosition(session_id, existing.created_at)
      return NextResponse.json({ success: true, position })
    }
    // Already on roster or absent — don't downgrade
    return NextResponse.json({ success: false, error: 'Already has status: ' + existing.status }, { status: 409 })
  }

  const { error: insertErr } = await supabaseAdmin
    .from('session_players')
    .insert({ session_id, player_id: player.id, status: 'waitlist' })

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const { count } = await supabaseAdmin
    .from('session_players')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session_id)
    .eq('status', 'waitlist')

  return NextResponse.json({ success: true, position: count ?? 1 })
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
