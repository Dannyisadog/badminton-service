import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyCronSecret } from '@/lib/auth'
import { notifyGroups } from '@/lib/line'
import type { SessionPlayerWithPlayer } from '@/types'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]
  const { data: session, error } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('date', today)
    .single()

  if (error || !session) {
    return NextResponse.json({ message: 'No session today' })
  }

  const { data: rows } = await supabaseAdmin
    .from('session_players')
    .select('*, players(name)')
    .eq('session_id', session.id)
    .eq('status', 'roster')
    .order('created_at', { ascending: true })

  const rosterNames = (rows ?? []).map((r: { players: { name: string } }) => r.players.name)

  const message = [
    `🏸 今日羽球開打！`,
    ``,
    `📍 地點：${session.location}`,
    `🕗 時間：${session.start_time.slice(0, 5)}`,
    ``,
    `出席名單 (${rosterNames.length}/${session.capacity})：`,
    rosterNames.map((n: string, i: number) => `${i + 1}. ${n}`).join('\n'),
    ``,
    `詳情：${process.env.NEXT_PUBLIC_APP_URL}`,
  ].join('\n')

  const { data: groups } = await supabaseAdmin
    .from('groups')
    .select('line_group_id')
    .eq('session_id', session.id)

  const groupIds = (groups ?? []).map((g: { line_group_id: string }) => g.line_group_id)

  if (groupIds.length > 0) {
    await notifyGroups(groupIds, message)
  }

  return NextResponse.json({ success: true, notified: groupIds.length })
}
