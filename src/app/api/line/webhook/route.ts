import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifySignature } from '@/lib/line'

export const dynamic = 'force-dynamic'

// LINE webhook events
interface LineEvent {
  type: string
  replyToken?: string
  source: { type: string; userId?: string; groupId?: string; roomId?: string }
  message?: { type: string; text?: string }
  joinEvent?: unknown
  memberJoined?: { members: Array<{ type: string; userId: string }> }
  deliveryContext?: { isRedelivery: boolean }
}

interface WebhookBody {
  destination: string
  events: LineEvent[]
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const body: WebhookBody = JSON.parse(rawBody)

  // Process each event (non-blocking — LINE requires 200 within 1s)
  for (const event of body.events) {
    // Skip redeliveries to prevent duplicate processing
    if (event.deliveryContext?.isRedelivery) continue

    try {
      if (event.type === 'join' && event.source.groupId) {
        await handleGroupJoin(event.source.groupId)
      } else if (event.type === 'message' && event.message?.type === 'text') {
        await handleTextMessage(event)
      }
    } catch (err) {
      console.error('Webhook event error:', err)
    }
  }

  return NextResponse.json({ ok: true })
}

async function handleGroupJoin(groupId: string) {
  // Store the group — link to next upcoming session
  const { data: upcoming } = await supabaseAdmin
    .from('sessions')
    .select('id')
    .gte('date', new Date().toISOString().split('T')[0])
    .order('date', { ascending: true })
    .limit(1)
    .single()

  await supabaseAdmin
    .from('groups')
    .upsert(
      { line_group_id: groupId, session_id: upcoming?.id ?? null },
      { onConflict: 'line_group_id' }
    )
}

async function handleTextMessage(event: LineEvent) {
  const text = event.message?.text?.trim().toLowerCase() ?? ''
  const userId = event.source.userId
  if (!userId) return

  // Auto-register group if message comes from a group (fallback for missed join events)
  if (event.source.groupId) {
    await handleGroupJoin(event.source.groupId)
  }

  // Simple command handling — full interaction is via LIFF
  if (text === 'status' || text === '狀態') {
    await replyStatus(event.replyToken!, event.source.groupId)
  }
}

async function replyStatus(replyToken: string, groupId?: string) {
  let sessionId: string | null = null

  if (groupId) {
    const { data: group } = await supabaseAdmin
      .from('groups')
      .select('session_id')
      .eq('line_group_id', groupId)
      .single()
    sessionId = group?.session_id ?? null
  }

  if (!sessionId) {
    await lineReply(replyToken, '目前沒有綁定的場次。')
    return
  }

  const { data: session } = await supabaseAdmin
    .from('sessions')
    .select('capacity')
    .eq('id', sessionId)
    .single()

  const { count: rosterCount } = await supabaseAdmin
    .from('session_players')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'roster')

  const { count: waitlistCount } = await supabaseAdmin
    .from('session_players')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('status', 'waitlist')

  const msg = [
    `🏸 目前場次狀況`,
    `出席：${rosterCount ?? 0}/${session?.capacity ?? 16}`,
    `候補：${waitlistCount ?? 0}`,
    ``,
    `出席管理：${process.env.NEXT_PUBLIC_APP_URL}`,
  ].join('\n')

  await lineReply(replyToken, msg)
}

async function lineReply(replyToken: string, text: string) {
  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  })
}
