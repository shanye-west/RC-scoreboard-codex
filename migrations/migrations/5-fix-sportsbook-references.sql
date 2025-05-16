
-- Migration: Fix sportsbook table references
-- Version: 1.5.0
-- Date: 2025-05-12

-- Drop existing bets table
DROP TABLE IF EXISTS bets CASCADE;

-- Recreate bets table with correct structure
CREATE TABLE IF NOT EXISTS bets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  match_id INTEGER REFERENCES matches(id),
  round_id INTEGER REFERENCES rounds(id),
  player_id INTEGER REFERENCES players(id),
  bet_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending',
  result TEXT,
  payout NUMERIC,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  settled_at TIMESTAMP,
  settled_by INTEGER REFERENCES users(id)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bets_user_id ON bets(user_id);
