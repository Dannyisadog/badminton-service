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

  const { dateStr, dayOfWeek } = getNextGameDate()

  const { data: existing } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('date', dateStr)
    .single()

  let session = existing

  if (existing) {
    // Session already exists — still notify
  } else {
    const { data: inserted, error } = await supabaseAdmin
      .from('sessions')
      .insert({ date: dateStr, day_of_week: dayOfWeek, ...SESSION_DEFAULTS })
      .select()
      .single()

    if (error || !inserted) {
      return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 })
    }

    session = inserted
  }

  const groupIds = await getGroupIds()
  if (groupIds.length > 0) {
    await notifyGroups(groupIds, buildNewSessionNotification(session))
  }

  return NextResponse.json({ success: true, date: dateStr, existed: !!existing })
}

// Returns the next upcoming game day (Mon or Fri) that hasn't started yet, Taiwan time
function getNextGameDate(): { dateStr: string; dayOfWeek: 'Mon' | 'Fri' } {
  const TZ_OFFSET_MS = 8 * 60 * 60 * 1000
  const twNow = Date.now() + TZ_OFFSET_MS
  const today = new Date(twNow).getUTCDay() // 0=Sun … 6=Sat

  const targets: [number, 'Mon' | 'Fri'][] = [
    [1, 'Mon'],
    [5, 'Fri'],
  ]

  const next = targets
    .map(([target, dayOfWeek]) => {
      let offset = (target - today + 7) % 7
      if (offset === 0) offset = 7 // skip today, take next week
      return { offset, dayOfWeek, dateStr: new Date(twNow + offset * 86400000).toISOString().slice(0, 10) }
    })
    .sort((a, b) => a.offset - b.offset)[0]

  return { dateStr: next.dateStr, dayOfWeek: next.dayOfWeek }
}
