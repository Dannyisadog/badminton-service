-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Players
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  line_user_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sessions
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Mon', 'Fri')),
  capacity INT NOT NULL DEFAULT 16,
  start_time TIME NOT NULL DEFAULT '19:00:00',
  location TEXT NOT NULL DEFAULT 'TBD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Session Players (join table with status)
CREATE TABLE session_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('roster', 'absent', 'waitlist')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, player_id)
);

-- Groups (LINE group to session mapping)
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  line_group_id TEXT UNIQUE NOT NULL,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_session_players_session ON session_players(session_id);
CREATE INDEX idx_session_players_player ON session_players(player_id);
CREATE INDEX idx_session_players_status ON session_players(session_id, status);
CREATE INDEX idx_sessions_date ON sessions(date);

-- Auto-update updated_at on session_players
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER session_players_updated_at
  BEFORE UPDATE ON session_players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically.
-- Anon key is blocked from all direct writes (API handles all mutations).
-- Allow anon to read sessions and session_players for LIFF display.
CREATE POLICY "anon_read_sessions" ON sessions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_session_players" ON session_players FOR SELECT TO anon USING (true);
CREATE POLICY "anon_read_players" ON players FOR SELECT TO anon USING (true);
