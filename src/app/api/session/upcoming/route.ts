import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getNextSessionDate } from '@/lib/schedule'

export const dynamic = 'force-dynamic'

// Returns the next upcoming Mon or Fri session (Taiwan time).
// Auto-creates the session if it doesn't exist yet.
export async function GET() {
  const { dateStr, dayOfWeek: dayOfWeekStr } = getNextSessionDate()

  // Try to find existing session
  const { data: existing } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('date', dateStr)
    .single()

  if (existing) return NextResponse.json(existing, { headers: { 'Cache-Control': 'no-store' } })

  const { data: created, error } = await supabaseAdmin
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(created, { headers: { 'Cache-Control': 'no-store' } })
}
