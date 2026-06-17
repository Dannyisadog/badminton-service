import crypto from 'crypto'
import type { SessionStatus } from '@/types'

const LINE_API = 'https://api.line.me/v2/bot'

async function push(to: string, text: string): Promise<void> {
  const res = await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`LINE push failed (${res.status}):`, body)
  }
}

export function verifySignature(rawBody: string, signature: string): boolean {
  const hash = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET!)
    .update(rawBody)
    .digest('base64')
  return hash === signature
}

export function buildSessionSummary(status: SessionStatus): string {
  const { session, roster, absent, waitlist } = status
  const dateStr = new Date(session.date).toLocaleDateString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })
  return [
    `🏸 羽球場次提醒`,
    ``,
    `📅 日期：${dateStr}`,
    `📍 地點：${session.location}`,
    `🕗 時間：${session.start_time.slice(0, 5)}`,
    ``,
    `出席：${roster.length}/${session.capacity}`,
    `請假：${absent.length}`,
    `候補：${waitlist.length}`,
    ``,
    `出席 / 請假 / 候補：`,
    `${process.env.NEXT_PUBLIC_APP_URL}`,
  ].join('\n')
}

export function buildLeaveNotification(
  leaverName: string,
  promotedName: string | null,
  roster: number,
  capacity: number
): string {
  const lines = [`🔔 出席更新`, ``, `${leaverName} 已請假`]
  if (promotedName) lines.push(`${promotedName} 從候補晉升為出席！`)
  lines.push(``, `目前出席：${roster}/${capacity}`)
  return lines.join('\n')
}

export function buildJoinNotification(
  playerName: string,
  status: 'roster' | 'waitlist',
  roster: number,
  capacity: number,
  waitlistPosition?: number
): string {
  if (status === 'waitlist') {
    return `🔔 ${playerName} 加入候補名單（第 ${waitlistPosition} 位）`
  }
  return [`🔔 出席更新`, ``, `${playerName} 加入出席`, ``, `目前出席：${roster}/${capacity}`].join('\n')
}

export function buildPromotionNotification(playerName: string): string {
  return `🎉 ${playerName}，您已從候補晉升為出席！`
}

export async function notifyGroups(
  groupIds: string[],
  message: string
): Promise<void> {
  await Promise.all(groupIds.map((id) => push(id, message)))
}

export async function notifyUser(lineUserId: string, message: string): Promise<void> {
  await push(lineUserId, message)
}
