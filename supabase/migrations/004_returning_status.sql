-- Add 'returning' status for regular players who cancel absence
-- when their slot has already been filled by a substitute.
-- They queue to reclaim their spot when the substitute leaves.

ALTER TABLE session_players
  DROP CONSTRAINT IF EXISTS session_players_status_check;

ALTER TABLE session_players
  ADD CONSTRAINT session_players_status_check
  CHECK (status IN ('roster', 'absent', 'waitlist', 'returning'));
