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
  const { session, roster, absent, waitlist, available_slots } = status
  const dateStr = new Date(session.date).toLocaleDateString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })
  const absentNames = absent.map((p) => p.name).join('、') || '無'
  const rosterNames = roster.map((p) => p.name).join('、') || '無'
  return [
    `🏸 羽球場次提醒`,
    ``,
    `📅 日期：${dateStr}`,
    `📍 地點：${session.location}`,
    `🕗 時間：${session.start_time.slice(0, 5)}`,
    ``,
    `固定成員：${session.regular_count} 人`,
    `請假 (${absent.length})：${absentNames}`,
    `代打 (${roster.length})：${rosterNames}`,
    `候補：${waitlist.length} 人`,
    `可報名：${available_slots} 個`,
    ``,
    `詳細名單：${process.env.NEXT_PUBLIC_APP_URL}`,
  ].join('\n')
}

export function buildAbsentNotification(
  leaverName: string,
  promotedName: string | null,
  availableSlots: number
): string {
  const lines = [`🔔 出席更新`, ``, `${leaverName} 已請假`]
  if (promotedName) {
    lines.push(`✅ ${promotedName} 從候補升為代打！`)
  } else if (availableSlots > 0) {
    lines.push(`目前有 ${availableSlots} 個代打名額`)
  }
  return lines.join('\n')
}

export function buildCancelAbsentNotification(
  playerName: string,
  newStatus: 'back' | 'waitlist'
): string {
  if (newStatus === 'back') {
    return `🔔 ${playerName} 取消請假，已回歸出席`
  }
  return `🔔 ${playerName} 取消請假，代打名額已滿，加入候補名單`
}

export function buildLeaveNotification(
  leaverName: string,
  promotedName: string | null,
  availableSlots: number
): string {
  const lines = [`🔔 出席更新`, ``, `${leaverName} 取消代打`]
  if (promotedName) lines.push(`✅ ${promotedName} 從候補升為代打！`)
  else if (availableSlots > 0) lines.push(`目前有 ${availableSlots} 個代打名額`)
  return lines.join('\n')
}

export function buildJoinNotification(
  playerName: string,
  status: 'roster' | 'waitlist',
  waitlistPosition?: number
): string {
  if (status === 'waitlist') {
    return `🔔 ${playerName} 加入候補名單（第 ${waitlistPosition} 位）`
  }
  return `🔔 ${playerName} 加入代打名單`
}

export function buildPromotionNotification(playerName: string): string {
  return `🎉 ${playerName}，您已從候補升為代打！`
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
