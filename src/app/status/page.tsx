'use client'

import { useEffect, useState, useCallback } from 'react'
import { useLiff } from '@/hooks/useLiff'
import type { PlayerWithStatus, Session } from '@/types'
import Link from 'next/link'

interface SessionData {
  session: Session
  roster: PlayerWithStatus[]
  absent: PlayerWithStatus[]
  waitlist: PlayerWithStatus[]
  returning: PlayerWithStatus[]
  available_slots: number
}

type Tab = 'roster' | 'absent' | 'waitlist'

const TAB_AVATAR_COLORS: Record<Tab, 'success' | 'danger' | 'warning'> = {
  roster: 'success',
  absent: 'danger',
  waitlist: 'warning',
}

export default function StatusPage() {
  const { isReady, profile } = useLiff()
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('roster')

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch('/api/session/upcoming', { method: 'POST', cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (data.error) throw new Error(data.error)
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

  if (!isReady || loading) {
    return (
      <div className="container">
        {/* Skeleton header card */}
        <div className="card-accent" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
          <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="skeleton" style={{ height: 20, width: '40%', marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 14, width: '65%' }} />
          </div>
        </div>
        {/* Skeleton badges card */}
        <div className="card">
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="skeleton" style={{ height: 26, width: 80, borderRadius: 'var(--radius-full)' }} />
            <div className="skeleton" style={{ height: 26, width: 70, borderRadius: 'var(--radius-full)' }} />
            <div className="skeleton" style={{ height: 26, width: 70, borderRadius: 'var(--radius-full)' }} />
          </div>
        </div>
        {/* Skeleton tabs */}
        <div className="skeleton" style={{ height: 44, borderRadius: 'var(--radius-md)', marginBottom: 12 }} />
        {/* Skeleton list card */}
        <div className="card">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '11px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
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
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-3)', fontSize: 14 }}>
          找不到場次
        </div>
      </div>
    )
  }

  const { session, roster, absent, waitlist, returning } = sessionData
  const dateObj = new Date(session.date + 'T00:00:00')
  const dateStr = dateObj.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })

  const currentList = activeTab === 'roster' ? roster : activeTab === 'absent' ? absent : [...returning, ...waitlist]
  const avatarColor = TAB_AVATAR_COLORS[activeTab]

  return (
    <div className="container">
      {/* Header card */}
      <div className="card-accent" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link
          href="/"
          style={{ color: 'var(--text-2)', textDecoration: 'none', fontSize: 22, lineHeight: 1, flexShrink: 0 }}
        >
          ←
        </Link>
        <div>
          <h1 style={{ fontSize: 18 }}>完整名單</h1>
          <div className="meta-row">
            📅 {dateStr} · {session.start_time.slice(0, 5)}{session.end_time ? ` ~ ${session.end_time.slice(0, 5)}` : ''}
          </div>
        </div>
      </div>

      {/* Summary badges */}
      <div className="card">
        <div className="badges" style={{ marginTop: 0 }}>
          <span className="badge badge-success">出席 {session.capacity - absent.length - returning.length + roster.length}/{session.capacity}</span>
          <span className="badge badge-danger">請假 {absent.length}</span>
          <span className="badge badge-warning">候補 {returning.length + waitlist.length}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {(['roster', 'absent', 'waitlist'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'roster' ? `出席 (${roster.length})` : tab === 'absent' ? `請假 (${absent.length})` : `候補 (${returning.length + waitlist.length})`}
          </button>
        ))}
      </div>

      {/* Player list */}
      <div className="card">
        {currentList.length === 0 ? (
          <p className="empty-state">
            {activeTab === 'roster' && '尚無出席名單'}
            {activeTab === 'absent' && '無人請假'}
            {activeTab === 'waitlist' && '候補名單為空'}
          </p>
        ) : (
          currentList.map((p, i) => (
            <div className="player-row" key={p.id}>
              <div className={`avatar avatar-${avatarColor}`}>
                {p.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="player-info">
                <span className="player-name">
                  {p.name}
                  {p.line_user_id === profile?.userId && (
                    <span className="player-me">（我）</span>
                  )}
                </span>
              </div>
              {activeTab === 'waitlist' && (
                <span className="player-rank">#{i + 1}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
