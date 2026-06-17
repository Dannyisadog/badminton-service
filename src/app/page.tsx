'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLiff } from '@/hooks/useLiff'
import type { Session, PlayerWithStatus, PlayerStatus } from '@/types'
import Link from 'next/link'

interface SessionData {
  session: Session
  roster: PlayerWithStatus[]
  absent: PlayerWithStatus[]
  waitlist: PlayerWithStatus[]
  available_slots: number
}

export default function SessionPage() {
  const { isReady, profile, idToken, error: liffError } = useLiff()
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const myStatus: PlayerStatus | null = sessionData
    ? (() => {
        const id = profile?.userId
        const inRoster = sessionData.roster.find((p) => p.line_user_id === id)
        const inAbsent = sessionData.absent.find((p) => p.line_user_id === id)
        const inWaitlist = sessionData.waitlist.find((p) => p.line_user_id === id)
        if (inRoster) return 'roster'
        if (inAbsent) return 'absent'
        if (inWaitlist) return 'waitlist'
        return null
      })()
    : null

  const fetchSession = useCallback(async () => {
    try {
      const upcoming = await fetch('/api/session/upcoming').then((r) => r.json())
      if (upcoming.error) throw new Error(upcoming.error)
      const data = await fetch(`/api/session/${upcoming.id}`).then((r) => r.json())
      setSessionData(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isReady) fetchSession()
  }, [isReady, fetchSession])

  const callApi = async (endpoint: string) => {
    if (!idToken || !sessionData) return
    setActionLoading(true)
    setMessage(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ session_id: sessionData.session.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setMessage({ text: getSuccessMessage(endpoint, data), type: 'success' })
      await fetchSession()
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Error', type: 'error' })
    } finally {
      setActionLoading(false)
    }
  }

  if (liffError) {
    return (
      <div className="container">
        <div className="loading">LIFF 初始化失敗，請在 LINE 中開啟此頁面</div>
      </div>
    )
  }

  if (!isReady || loading) {
    return (
      <div className="container">
        <div className="loading">載入中...</div>
      </div>
    )
  }

  if (!sessionData) {
    return (
      <div className="container">
        <div className="loading">找不到即將到來的場次</div>
      </div>
    )
  }

  const { session, roster, waitlist } = sessionData
  const dateObj = new Date(session.date + 'T00:00:00')
  const dateStr = dateObj.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })

  return (
    <div className="container">
      {/* Session Info */}
      <div className="card">
        <h1>🏸 羽球場次</h1>
        <div className="meta-row">📅 {dateStr}</div>
        <div className="meta-row">📍 {session.location}</div>
        <div className="meta-row">🕗 {session.start_time.slice(0, 5)}</div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <span className="badge badge-green">出席 {roster.length}/{session.capacity}</span>
          {waitlist.length > 0 && (
            <span className="badge badge-yellow">候補 {waitlist.length}</span>
          )}
          {myStatus && (
            <span className={`badge ${statusBadge(myStatus)}`}>{statusLabel(myStatus)}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="card">
        <p className="section-title">我的操作</p>
        {message && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              marginBottom: 12,
              background: message.type === 'success' ? '#dcfce7' : '#fee2e2',
              color: message.type === 'success' ? '#166534' : '#991b1b',
              fontSize: 14,
            }}
          >
            {message.text}
          </div>
        )}
        <div className="actions">
          <button
            className="btn btn-green"
            disabled={actionLoading || myStatus === 'roster'}
            onClick={() => callApi('/api/join')}
          >
            {myStatus === 'roster' ? '已出席' : '加入出席'}
          </button>
          <button
            className="btn btn-red"
            disabled={actionLoading || myStatus === 'absent'}
            onClick={() => callApi('/api/leave')}
          >
            {myStatus === 'absent' ? '已請假' : '請假'}
          </button>
          <button
            className="btn btn-yellow"
            disabled={
              actionLoading ||
              myStatus === 'waitlist' ||
              myStatus === 'roster' ||
              session.capacity - roster.length > 0
            }
            onClick={() => callApi('/api/waitlist')}
          >
            {myStatus === 'waitlist' ? '已在候補名單' : '加入候補'}
          </button>
        </div>
      </div>

      {/* Quick roster preview */}
      <div className="card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <p className="section-title">出席名單</p>
          <Link
            href="/status"
            style={{ fontSize: 13, color: '#06c755', textDecoration: 'none' }}
          >
            查看完整名單 →
          </Link>
        </div>
        {roster.length === 0 ? (
          <p className="empty">尚無人出席</p>
        ) : (
          roster.slice(0, 5).map((p, i) => (
            <div className="player-row" key={p.id}>
              <span style={{ fontSize: 14 }}>
                {i + 1}. {p.name}
                {p.line_user_id === profile?.userId && (
                  <span style={{ color: '#06c755', marginLeft: 6, fontSize: 12 }}>（我）</span>
                )}
              </span>
            </div>
          ))
        )}
        {roster.length > 5 && (
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 8 }}>
            還有 {roster.length - 5} 人...
          </p>
        )}
      </div>
    </div>
  )
}

function statusLabel(status: PlayerStatus): string {
  const map: Record<PlayerStatus, string> = {
    roster: '出席',
    absent: '請假',
    waitlist: '候補',
  }
  return map[status]
}

function statusBadge(status: PlayerStatus): string {
  const map: Record<PlayerStatus, string> = {
    roster: 'badge-green',
    absent: 'badge-red',
    waitlist: 'badge-yellow',
  }
  return map[status]
}

function getSuccessMessage(endpoint: string, data: Record<string, unknown>): string {
  if (endpoint === '/api/join') {
    return data.status === 'waitlist' ? `已加入候補名單（第 ${data.waitlistPosition ?? ''} 位）` : '成功加入出席！'
  }
  if (endpoint === '/api/leave') {
    const promoted = data.promoted_player as { name: string } | null
    return promoted ? `已請假，${promoted.name} 從候補晉升！` : '已成功請假'
  }
  if (endpoint === '/api/waitlist') return '已加入候補名單'
  return '操作成功'
}
