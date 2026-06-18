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

  const groupIds = await getGroupIds()
  let notifySession = null

  for (const { dateStr, dayOfWeek, offset } of dates) {
    const { data: existing } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('date', dateStr)
      .single()

    let session = existing

    if (existing) {
      skipped.push(dateStr)
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
      created.push(dateStr)
    }

    // Only notify for the closest upcoming session; skip today (offset=0, game already ended)
    if (!notifySession && offset > 0) {
      notifySession = session
    }
  }

  if (notifySession && groupIds.length > 0) {
    await notifyGroups(groupIds, buildNewSessionNotification(notifySession))
  }

  return NextResponse.json({ success: true, created, skipped })
}

// Returns the upcoming Monday and Friday dates sorted by closeness (Taiwan time)
function getUpcomingGameDates(): { dateStr: string; dayOfWeek: 'Mon' | 'Fri'; offset: number }[] {
  const TZ_OFFSET_MS = 8 * 60 * 60 * 1000
  const twNow = Date.now() + TZ_OFFSET_MS
  const today = new Date(twNow).getUTCDay() // 0=Sun … 6=Sat

  const targets: [number, 'Mon' | 'Fri'][] = [
    [1, 'Mon'],
    [5, 'Fri'],
  ]

  return targets
    .map(([target, dayOfWeek]) => {
      const offset = (target - today + 7) % 7
      const d = new Date(twNow + offset * 86400000)
      return { dateStr: d.toISOString().slice(0, 10), dayOfWeek, offset }
    })
    .sort((a, b) => a.offset - b.offset)
}
