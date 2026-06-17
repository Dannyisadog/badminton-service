export type PlayerStatus = 'roster' | 'absent' | 'waitlist' | 'returning'

export interface Player {
  id: string
  name: string
  line_user_id: string
  created_at: string
}

export interface Session {
  id: string
  date: string
  day_of_week: 'Mon' | 'Fri'
  capacity: number
  regular_count: number
  start_time: string
  end_time: string | null
  location: string
  created_at: string
}

export interface SessionPlayer {
  id: string
  session_id: string
  player_id: string
  status: PlayerStatus
  created_at: string
  updated_at: string
}

export interface SessionPlayerWithPlayer extends SessionPlayer {
  players: Player
}

export interface Group {
  id: string
  line_group_id: string
  session_id: string | null
  label: string | null
  created_at: string
}

export interface SessionStatus {
  session: Session
  regular_count: number
  roster: PlayerWithStatus[]
  absent: PlayerWithStatus[]
  waitlist: PlayerWithStatus[]
  returning: PlayerWithStatus[]
  available_slots: number
}

export interface PlayerWithStatus {
  id: string
  name: string
  line_user_id: string
  status: PlayerStatus
  joined_at: string
}
