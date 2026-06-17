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
  const { isReady, profile, getAccessToken, error: liffError } = useLiff()
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const myStatus: PlayerStatus | null = sessionData
    ? (() => {
        const id = profile?.userId
        if (sessionData.roster.find((p) => p.line_user_id === id)) return 'roster'
        if (sessionData.absent.find((p) => p.line_user_id === id)) return 'absent'
        if (sessionData.waitlist.find((p) => p.line_user_id === id)) return 'waitlist'
        return null
      })()
    : null

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session/upcoming', { method: 'POST', cache: 'no-store' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      console.log('fetchSession got waitlist:', data.waitlist?.length, 'absent:', data.absent?.length)
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
    const accessToken = getAccessToken()
    if (!accessToken || !sessionData) return
    setLoadingAction(endpoint)
    setMessage(null)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ session_id: sessionData.session.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Request failed')
      setMessage({ text: getSuccessMessage(endpoint, data), type: 'success' })
      await fetchSession()
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : 'Error', type: 'error' })
    } finally {
      setLoadingAction(null)
    }
  }

  if (liffError) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)', fontSize: 14 }}>
          LIFF 初始化失敗，請在 LINE 中開啟
        </div>
      </div>
    )
  }

  if (!isReady || loading) {
    return (
      <div className="container">
        {/* Skeleton hero card */}
        <div className="card-accent" style={{ marginBottom: 12 }}>
          <div className="skeleton" style={{ height: 24, width: '60%', marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 16, width: '80%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 16, width: '70%', marginBottom: 8 }} />
          <div className="skeleton" style={{ height: 16, width: '50%', marginBottom: 16 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="skeleton" style={{ height: 26, width: 80, borderRadius: 'var(--radius-full)' }} />
            <div className="skeleton" style={{ height: 26, width: 80, borderRadius: 'var(--radius-full)' }} />
          </div>
        </div>
        {/* Skeleton actions card */}
        <div className="card">
          <div className="skeleton" style={{ height: 12, width: '30%', marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 48, borderRadius: 'var(--radius-lg)', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 48, borderRadius: 'var(--radius-lg)', marginBottom: 10 }} />
          <div className="skeleton" style={{ height: 48, borderRadius: 'var(--radius-lg)' }} />
        </div>
        {/* Skeleton list card */}
        <div className="card">
          <div className="skeleton" style={{ height: 12, width: '25%', marginBottom: 16 }} />
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
              <div className="skeleton" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
              <div className="skeleton" style={{ height: 14, flex: 1 }} />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!sessionData) {
    return (
      <div className="container">
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <p style={{ color: 'var(--text-3)', fontSize: 14, marginBottom: loadError ? 8 : 0 }}>找不到即將到來的場次</p>
          {loadError && (
            <p style={{ fontSize: 12, color: 'var(--danger-text)', wordBreak: 'break-all', marginTop: 4 }}>{loadError}</p>
          )}
        </div>
      </div>
    )
  }

  const { session, roster, absent, waitlist, regular_count, available_slots } = sessionData
  const dateObj = new Date(session.date + 'T00:00:00')
  const dateStr = dateObj.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })

  const isLoading = loadingAction !== null
  const redAction =
    myStatus === 'absent' ? '/api/cancel-absent' :
    myStatus === 'waitlist' || myStatus === 'roster' ? '/api/leave' :
    '/api/absent'
  const redLabel =
    myStatus === 'absent' ? '取消請假' :
    myStatus === 'waitlist' ? '取消候補' :
    myStatus === 'roster' ? '取消代打' : '請假'

  return (
    <div className="container">
      {/* Hero info card */}
      <div className="card-accent">
        <h1>🏸 羽球場次</h1>
        <div className="meta-row">📅 {dateStr}</div>
        <div className="meta-row">
          📍{' '}
          {session.location.startsWith('http') ? (
            <a href={session.location} target="_blank" rel="noopener noreferrer">查看地圖</a>
          ) : session.location}
        </div>
        <div className="meta-row">
          🕗 {session.start_time.slice(0, 5)}{session.end_time ? ` ~ ${session.end_time.slice(0, 5)}` : ''}
        </div>
        <div className="badges">
          <span className="badge badge-success">出席 {regular_count - absent.length}/{regular_count}</span>
          {available_slots > 0 && (
            <span className="badge badge-warning">可報名 {available_slots} 個</span>
          )}
          {waitlist.length > 0 && (
            <span className="badge badge-warning">候補 {waitlist.length}</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="card">
        <p className="section-label">我的操作</p>
        {message && (
          <div className={`toast ${message.type === 'success' ? 'toast-success' : 'toast-error'}`}>
            {message.type === 'success' ? '✓' : '✕'} {message.text}
          </div>
        )}
        <div className="actions">
          <button
            className="btn btn-primary"
            disabled={isLoading || myStatus !== null || available_slots === 0}
            onClick={() => callApi('/api/join')}
          >
            {loadingAction === '/api/join' && <span className="spinner" />}
            {myStatus === 'roster' ? '✓ 已出席' : available_slots === 0 ? '名額已滿' : '加入出席'}
          </button>
          <button
            className="btn btn-danger"
            disabled={isLoading}
            onClick={() => callApi(redAction)}
          >
            {loadingAction === redAction && <span className="spinner" />}
            {redLabel}
          </button>
          <button
            className="btn btn-accent"
            disabled={isLoading || myStatus !== null || available_slots > 0}
            onClick={() => callApi('/api/waitlist')}
          >
            {loadingAction === '/api/waitlist' && <span className="spinner" />}
            {myStatus === 'waitlist' ? '✓ 已在候補名單' : '加入候補'}
          </button>
        </div>
      </div>

      {/* 請假名單 */}
      <div className="card">
        <p className="section-label">請假名單 {absent.length > 0 && `· ${absent.length} 人`}</p>
        {absent.length === 0 ? (
          <p className="empty-state">無人請假</p>
        ) : (
          absent.map((p) => (
            <PlayerRow key={p.id} player={p} isMe={p.line_user_id === profile?.userId} color="danger" />
          ))
        )}
      </div>

      {/* 代打名單 */}
      {roster.length > 0 && (
        <div className="card">
          <p className="section-label">代打名單 · {roster.length} 人</p>
          {roster.map((p) => (
            <PlayerRow key={p.id} player={p} isMe={p.line_user_id === profile?.userId} color="success" />
          ))}
        </div>
      )}

      {/* 候補名單 */}
      <div className="card">
        <p className="section-label">候補名單 {waitlist.length > 0 && `· ${waitlist.length} 人`}</p>
        {waitlist.length === 0 ? (
          <p className="empty-state">候補名單為空</p>
        ) : (
          waitlist.map((p, i) => (
            <PlayerRow key={p.id} player={p} isMe={p.line_user_id === profile?.userId} color="warning" rank={i + 1} />
          ))
        )}
      </div>
    </div>
  )
}

function PlayerRow({
  player,
  isMe,
  color,
  rank,
}: {
  player: PlayerWithStatus
  isMe: boolean
  color: 'success' | 'danger' | 'warning'
  rank?: number
}) {
  const initials = player.name.slice(0, 1).toUpperCase()
  return (
    <div className="player-row">
      <div className={`avatar avatar-${color}`}>{initials}</div>
      <div className="player-info">
        <span className="player-name">
          {player.name}
          {isMe && <span className="player-me">（我）</span>}
        </span>
      </div>
      {rank !== undefined && <span className="player-rank">#{rank}</span>}
    </div>
  )
}

function getSuccessMessage(endpoint: string, data: Record<string, unknown>): string {
  if (endpoint === '/api/join') {
    return data.status === 'waitlist' ? '已加入候補名單' : '成功加入出席！'
  }
  if (endpoint === '/api/absent') {
    const promoted = data.promoted_player as { name: string } | null
    return promoted ? `請假成功，${promoted.name} 從候補晉升！` : '請假成功'
  }
  if (endpoint === '/api/cancel-absent') {
    return (data.status as string) === 'waitlist' ? '取消請假，已加入候補名單' : '取消請假，歡迎回來！'
  }
  if (endpoint === '/api/leave') return '已取消'
  if (endpoint === '/api/waitlist') return '已加入候補名單'
  return '操作成功'
}
