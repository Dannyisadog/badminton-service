import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyCronSecret } from '@/lib/auth'
import { buildNewSessionNotification, notifyGroups } from '@/lib/line'
import { getGroupIds } from '@/lib/groups'

export const dynamic = 'force-dynamic'

const SESSION_DEFAULTS = {
  capacity: 24,
  regular_count: 24,
  start_time: '19:00:00',
  end_time: '21:00:00',
  location: 'https://maps.app.goo.gl/uvrTdwJoDpj9xkev8',
}

export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dates = getUpcomingGameDates()
  const created: string[] = []
  const skipped: string[] = []

  for (const { dateStr, dayOfWeek } of dates) {
    const { data: existing } = await supabaseAdmin
      .from('sessions')
      .select('id')
      .eq('date', dateStr)
      .single()

    if (existing) {
      skipped.push(dateStr)
      continue
    }

    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .insert({ date: dateStr, day_of_week: dayOfWeek, ...SESSION_DEFAULTS })
      .select()
      .single()

    if (error || !session) {
      return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
    }

    created.push(dateStr)

    const groupIds = await getGroupIds()
    if (groupIds.length > 0) {
      await notifyGroups(groupIds, buildNewSessionNotification(session))
    }
  }

  return NextResponse.json({ success: true, created, skipped })
}

// Returns the upcoming Monday and Friday dates (0–6 days from today, Taiwan time)
function getUpcomingGameDates(): { dateStr: string; dayOfWeek: 'Mon' | 'Fri' }[] {
  const TZ_OFFSET_MS = 8 * 60 * 60 * 1000
  const twNow = Date.now() + TZ_OFFSET_MS
  const today = new Date(twNow).getUTCDay() // 0=Sun … 6=Sat

  const targets: [number, 'Mon' | 'Fri'][] = [
    [1, 'Mon'],
    [5, 'Fri'],
  ]

  return targets.map(([target, dayOfWeek]) => {
    const offset = (target - today + 7) % 7
    const d = new Date(twNow + offset * 86400000)
    return { dateStr: d.toISOString().slice(0, 10), dayOfWeek }
  })
}
