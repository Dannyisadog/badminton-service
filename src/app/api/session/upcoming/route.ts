import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Returns the next upcoming Mon or Fri session.
// Auto-creates the session if it doesn't exist yet.
export async function GET() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Find next Mon or Fri on or after today
  const dayOfWeek = today.getDay() // 0=Sun, 1=Mon, ..., 5=Fri
  const daysUntilMon = (1 - dayOfWeek + 7) % 7
  const daysUntilFri = (5 - dayOfWeek + 7) % 7

  const nextSessionOffset = Math.min(
    daysUntilMon === 0 ? 0 : daysUntilMon,
    daysUntilFri === 0 ? 0 : daysUntilFri
  )
  const nextDate = new Date(today)
  nextDate.setDate(today.getDate() + nextSessionOffset)
  const dateStr = nextDate.toISOString().split('T')[0]

  // Try to find existing session
  const { data: existing } = await supabaseAdmin
    .from('sessions')
    .select('*')
    .eq('date', dateStr)
    .single()

  if (existing) return NextResponse.json(existing)

  // Auto-create session for that date
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dayOfWeekStr = dayNames[nextDate.getDay()] === 'Mon' ? 'Mon' : 'Fri'

  const { data: created, error } = await supabaseAdmin
    .from('sessions')
    .insert({
      date: dateStr,
      day_of_week: dayOfWeekStr,
      capacity: 16,
      start_time: '19:00:00',
      location: 'TBD',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(created)
}
