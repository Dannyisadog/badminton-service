import { NextRequest, NextResponse } from 'next/server'
import { recalculate } from '@/lib/recalculate'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { session_id } = await req.json()
  if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  try {
    const result = await recalculate(session_id)
    return NextResponse.json({ success: true, promoted: result.promoted })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
