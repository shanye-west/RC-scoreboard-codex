-- Migration: Add player matchup, match type stats and sportsbook tables
-- Version: 1.1.0
-- Date: 2025-05-11

-- Player Matchups table - tracks head-to-head history between pairs of players
CREATE TABLE IF NOT EXISTS player_matchups (
  id SERIAL PRIMARY KEY,
  player_id_1 INTEGER NOT NULL REFERENCES players(id),
  player_id_2 INTEGER NOT NULL REFERENCES players(id),
  wins INTEGER DEFAULT 0 NOT NULL,
  losses INTEGER DEFAULT 0 NOT NULL,
  ties INTEGER DEFAULT 0 NOT NULL,
  last_played TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Player Match Type Stats table - tracks player performance in different match types
CREATE TABLE IF NOT EXISTS player_match_type_stats (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  match_type TEXT NOT NULL,
  wins INTEGER DEFAULT 0 NOT NULL,
  losses INTEGER DEFAULT 0 NOT NULL,
  ties INTEGER DEFAULT 0 NOT NULL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Bets table (placeholder for future sportsbook integration)
CREATE TABLE IF NOT EXISTS bets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  match_id INTEGER NOT NULL REFERENCES matches(id),
  bet_type TEXT NOT NULL,
  wager_amount NUMERIC NOT NULL,
  outcome TEXT,
  payout NUMERIC,
  created TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
  resolved TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_player_matchups_player1 ON player_matchups(player_id_1);
CREATE INDEX IF NOT EXISTS idx_player_matchups_player2 ON player_matchups(player_id_2);
CREATE INDEX IF NOT EXISTS idx_player_match_type_stats_player ON player_match_type_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_player_match_type_stats_type ON player_match_type_stats(match_type);
CREATE INDEX IF NOT EXISTS idx_bets_user ON bets(user_id);
CREATE INDEX IF NOT EXISTS idx_bets_match ON bets(match_id);

-- Schema version tracking table
CREATE TABLE IF NOT EXISTS schema_version (
  id SERIAL PRIMARY KEY,
  version VARCHAR(20) NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Insert current schema version
INSERT INTO schema_version (version) 
VALUES ('1.1.0')
ON CONFLICT DO NOTHING;