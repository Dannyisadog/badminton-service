import crypto from 'crypto'
import type { Session, SessionStatus } from '@/types'

const LINE_API = 'https://api.line.me/v2/bot'

interface Mentionee {
  index: number
  length: number
  userId: string
  type: 'user'
}

export interface LineMessage {
  type: 'text'
  text: string
  mention?: { mentionees: Mentionee[] }
}

function buildMentionMessage(text: string, mentionTag: string, userId: string): LineMessage {
  const index = text.indexOf(mentionTag)
  if (index === -1) return { type: 'text', text }
  return {
    type: 'text',
    text,
    mention: {
      mentionees: [{ index, length: mentionTag.length, userId, type: 'user' }],
    },
  }
}

async function push(to: string, message: LineMessage | string): Promise<void> {
  const msg: LineMessage = typeof message === 'string' ? { type: 'text', text: message } : message
  const res = await fetch(`${LINE_API}/message/push`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ to, messages: [msg] }),
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

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://badminton-service.dannyisadog.com'

function withLink(lines: string[]): string {
  return [...lines, ``, APP_URL].join('\n')
}

export function buildNewSessionNotification(session: Session): string {
  const [, m, d] = session.date.split('-').map(Number)
  const dayLabel = session.day_of_week === 'Mon' ? '週一' : '週五'
  const dateStr = `${m}月${d}日（${dayLabel}）`
  return withLink([
    `🏸 場次開放登記！`,
    ``,
    `📅 ${dateStr}`,
    `🕗 ${session.start_time.slice(0, 5)}${session.end_time ? ` ~ ${session.end_time.slice(0, 5)}` : ''}`,
    ``,
    `請至連結登記請假、候補或報名`,
  ])
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
  return withLink([
    `🏸 羽球場次提醒`,
    ``,
    `📅 日期：${dateStr}`,
    `📍 地點：${session.location}`,
    `🕗 時間：${session.start_time.slice(0, 5)}${session.end_time ? ` ~ ${session.end_time.slice(0, 5)}` : ''}`,
    ``,
    `固定成員：${session.regular_count} 人`,
    `請假 (${absent.length})：${absentNames}`,
    `代打 (${roster.length})：${rosterNames}`,
    `候補：${waitlist.length} 人`,
    `尚有 ${available_slots} 個名額`,
  ])
}

export function buildAbsentNotification(
  leaverName: string,
  promoted: { name: string; line_user_id: string } | null,
  availableSlots: number
): LineMessage {
  const lines = [`🔔 出席異動`, ``, `${leaverName} 請假`]
  if (promoted) {
    const mentionTag = `@${promoted.name}`
    lines.push(`✅ ${mentionTag} 從候補遞補上來`)
    return buildMentionMessage(withLink(lines), mentionTag, promoted.line_user_id)
  }
  if (availableSlots > 0) {
    lines.push(`還有 ${availableSlots} 個代打名額`)
  }
  return { type: 'text', text: withLink(lines) }
}

export function buildCancelAbsentNotification(
  playerName: string,
  newStatus: 'back' | 'waitlist' | 'returning'
): string {
  const detail = newStatus === 'back'
    ? `${playerName} 取消請假，已加回出席名單`
    : `${playerName} 取消請假，名額已滿，已加入候補等待遞補`
  return withLink([`🔔 出席異動`, ``, detail])
}

export function buildLeaveNotification(
  leaverName: string,
  promoted: { name: string; line_user_id: string } | null,
  availableSlots: number
): LineMessage {
  const lines = [`🔔 出席異動`, ``, `${leaverName} 取消代打`]
  if (promoted) {
    const mentionTag = `@${promoted.name}`
    lines.push(`✅ ${mentionTag} 從候補遞補上來`)
    return buildMentionMessage(withLink(lines), mentionTag, promoted.line_user_id)
  }
  if (availableSlots > 0) lines.push(`還有 ${availableSlots} 個代打名額`)
  return { type: 'text', text: withLink(lines) }
}

export function buildJoinNotification(
  playerName: string,
  status: 'roster' | 'waitlist',
  waitlistPosition?: number
): string {
  const detail = status === 'waitlist'
    ? `${playerName} 加入候補（第 ${waitlistPosition} 位）`
    : `${playerName} 加入代打`
  return withLink([`🔔 出席異動`, ``, detail])
}

export function buildPromotionNotification(playerName: string): string {
  return withLink([`🎉 恭喜！`, ``, `${playerName}，你從候補遞補成功！`])
}

export async function notifyGroups(
  groupIds: string[],
  message: LineMessage | string
): Promise<void> {
  await Promise.all(groupIds.map((id) => push(id, message)))
}

export async function notifyUser(lineUserId: string, message: string): Promise<void> {
  await push(lineUserId, message)
}
