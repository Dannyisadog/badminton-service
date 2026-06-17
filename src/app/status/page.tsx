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
  available_slots: number
}

type Tab = 'roster' | 'absent' | 'waitlist'

const TAB_COLORS: Record<Tab, 'green' | 'red' | 'yellow'> = {
  roster: 'green',
  absent: 'red',
  waitlist: 'yellow',
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
        <div className="loading">
          <span className="spinner" style={{ borderTopColor: '#06c755', borderColor: '#e8edf2' }} />
          載入中...
        </div>
      </div>
    )
  }

  if (!sessionData) {
    return (
      <div className="container">
        <div className="loading">找不到場次</div>
      </div>
    )
  }

  const { session, roster, absent, waitlist } = sessionData
  const dateObj = new Date(session.date + 'T00:00:00')
  const dateStr = dateObj.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' })

  const currentList = activeTab === 'roster' ? roster : activeTab === 'absent' ? absent : waitlist
  const color = TAB_COLORS[activeTab]

  return (
    <div className="container">
      <div className="card card-hero" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Link href="/" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'none', fontSize: 22, lineHeight: 1 }}>
          ←
        </Link>
        <div>
          <h1 style={{ fontSize: 18 }}>完整名單</h1>
          <div className="meta-row">
            📅 {dateStr} · {session.start_time.slice(0, 5)}{session.end_time ? ` ~ ${session.end_time.slice(0, 5)}` : ''}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="badges">
          <span className="badge badge-green">出席 {roster.length}/{session.capacity}</span>
          <span className="badge badge-red">請假 {absent.length}</span>
          <span className="badge badge-yellow">候補 {waitlist.length}</span>
        </div>
      </div>

      <div className="tabs">
        {(['roster', 'absent', 'waitlist'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'roster' ? `出席 (${roster.length})` : tab === 'absent' ? `請假 (${absent.length})` : `候補 (${waitlist.length})`}
          </button>
        ))}
      </div>

      <div className="card">
        {currentList.length === 0 ? (
          <p className="empty">
            {activeTab === 'roster' && '尚無出席名單'}
            {activeTab === 'absent' && '無人請假'}
            {activeTab === 'waitlist' && '候補名單為空'}
          </p>
        ) : (
          currentList.map((p, i) => (
            <div className="player-row" key={p.id}>
              <div className={`player-avatar player-avatar-${color}`}>
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
