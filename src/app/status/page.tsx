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

export default function StatusPage() {
  const { isReady, profile } = useLiff()
  const [sessionData, setSessionData] = useState<SessionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('roster')

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
        <div className="loading">找不到場次</div>
      </div>
    )
  }

  const { session, roster, absent, waitlist } = sessionData
  const dateObj = new Date(session.date + 'T00:00:00')
  const dateStr = dateObj.toLocaleDateString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })

  const currentList = activeTab === 'roster' ? roster : activeTab === 'absent' ? absent : waitlist

  return (
    <div className="container">
      <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/" style={{ color: '#06c755', textDecoration: 'none', fontSize: 20 }}>
          ←
        </Link>
        <div>
          <h1>完整名單</h1>
          <div className="meta-row">
            📅 {dateStr} · {session.start_time.slice(0, 5)} ~ {session.end_time.slice(0, 5)} · {session.location}
          </div>
        </div>
      </div>

      {/* Summary badges */}
      <div className="card">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className="badge badge-green">出席 {roster.length}/{session.capacity}</span>
          <span className="badge badge-red">請假 {absent.length}</span>
          <span className="badge badge-yellow">候補 {waitlist.length}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'roster' ? 'active' : ''}`}
          onClick={() => setActiveTab('roster')}
        >
          出席 ({roster.length})
        </button>
        <button
          className={`tab ${activeTab === 'absent' ? 'active' : ''}`}
          onClick={() => setActiveTab('absent')}
        >
          請假 ({absent.length})
        </button>
        <button
          className={`tab ${activeTab === 'waitlist' ? 'active' : ''}`}
          onClick={() => setActiveTab('waitlist')}
        >
          候補 ({waitlist.length})
        </button>
      </div>

      {/* Player list */}
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#6b7280', fontSize: 13, minWidth: 20 }}>{i + 1}</span>
                <span style={{ fontSize: 15 }}>
                  {p.name}
                  {p.line_user_id === profile?.userId && (
                    <span style={{ color: '#06c755', marginLeft: 6, fontSize: 12 }}>（我）</span>
                  )}
                </span>
              </div>
              {activeTab === 'waitlist' && (
                <span className="badge badge-yellow">#{i + 1}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
