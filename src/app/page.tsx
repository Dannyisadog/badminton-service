'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLiff } from '@/hooks/useLiff'
import type { Session, PlayerWithStatus, PlayerStatus } from '@/types'

interface SessionData {
  session: Session
  regular_count: number
  roster: PlayerWithStatus[]
  absent: PlayerWithStatus[]
  waitlist: PlayerWithStatus[]
  available_slots: number
}

export default function SessionPage() {
  const { isReady, profile, getIdToken, error: liffError } = useLiff()
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

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
      const res = await fetch('/api/session/upcoming', { cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setSessionData(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(msg)
      setLoadError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isReady) fetchSession()
  }, [isReady, fetchSession])

  const callApi = async (endpoint: string) => {
    const idToken = getIdToken()
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
        <div className="loading">
          找不到即將到來的場次
          {loadError && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#991b1b', wordBreak: 'break-all' }}>
              {loadError}
            </div>
          )}
        </div>
      </div>
    )
  }

  const { session, roster, absent, waitlist, regular_count, available_slots } = sessionData
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
        <div className="meta-row">
          📍{' '}
          {session.location.startsWith('http') ? (
            <a href={session.location} target="_blank" rel="noopener noreferrer" style={{ color: '#06c755' }}>
              查看地圖
            </a>
          ) : (
            session.location
          )}
        </div>
        <div className="meta-row">🕗 {session.start_time.slice(0, 5)}{session.end_time ? ` ~ ${session.end_time.slice(0, 5)}` : ''}</div>

        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <span className="badge badge-green">出席 {regular_count - absent.length}/{regular_count}</span>
          {available_slots > 0 && (
            <span className="badge badge-red">請假 {absent.length} 人，可報名 {available_slots} 個</span>
          )}
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
            disabled={actionLoading || myStatus === 'roster' || available_slots === 0}
            onClick={() => callApi('/api/join')}
          >
            {myStatus === 'roster' ? '已出席' : available_slots === 0 ? '名額已滿' : '加入出席'}
          </button>
          <button
            className="btn btn-red"
            disabled={actionLoading || myStatus === 'absent'}
            onClick={() => callApi(myStatus === 'absent' ? '/api/cancel-absent' : '/api/absent')}
          >
            {myStatus === 'absent' ? '取消請假' : '請假'}
          </button>
          <button
            className="btn btn-yellow"
            disabled={
              actionLoading ||
              myStatus === 'waitlist' ||
              myStatus === 'roster' ||
              available_slots > 0
            }
            onClick={() => callApi('/api/waitlist')}
          >
            {myStatus === 'waitlist' ? '已在候補名單' : '加入候補'}
          </button>
        </div>
      </div>

      {/* 請假名單 */}
      {absent.length > 0 && (
        <div className="card">
          <p className="section-title">請假名單（{absent.length} 人）</p>
          {absent.map((p, i) => (
            <div className="player-row" key={p.id}>
              <span style={{ fontSize: 14 }}>
                {i + 1}. {p.name}
                {p.line_user_id === profile?.userId && (
                  <span style={{ color: '#e53e3e', marginLeft: 6, fontSize: 12 }}>（我）</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 代打名單 */}
      {roster.length > 0 && (
        <div className="card">
          <p className="section-title">代打名單（{roster.length} 人）</p>
          {roster.map((p, i) => (
            <div className="player-row" key={p.id}>
              <span style={{ fontSize: 14 }}>
                {i + 1}. {p.name}
                {p.line_user_id === profile?.userId && (
                  <span style={{ color: '#06c755', marginLeft: 6, fontSize: 12 }}>（我）</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 候補名單 */}
      {waitlist.length > 0 && (
        <div className="card">
          <p className="section-title">候補名單（{waitlist.length} 人）</p>
          {waitlist.map((p, i) => (
            <div className="player-row" key={p.id}>
              <span style={{ fontSize: 14 }}>
                #{i + 1} {p.name}
                {p.line_user_id === profile?.userId && (
                  <span style={{ color: '#d97706', marginLeft: 6, fontSize: 12 }}>（我）</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
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
