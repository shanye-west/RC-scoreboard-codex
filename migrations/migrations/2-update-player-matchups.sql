-- Migration: Update player_matchups table for more detailed match tracking
-- Version: 1.2.0
-- Date: 2025-05-12

-- Drop the existing player_matchups table
DROP TABLE IF EXISTS player_matchups;

-- Create the revised player_matchups table
CREATE TABLE player_matchups (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  opponent_id INTEGER NOT NULL REFERENCES players(id),
  match_id INTEGER NOT NULL REFERENCES matches(id),
  tournament_id INTEGER REFERENCES tournament(id),
  result TEXT CHECK (result IN ('win', 'loss', 'tie')),
  match_type TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_player_matchups_player ON player_matchups(player_id);
CREATE INDEX idx_player_matchups_opponent ON player_matchups(opponent_id);
CREATE INDEX idx_player_matchups_match ON player_matchups(match_id);
CREATE INDEX idx_player_matchups_tournament ON player_matchups(tournament_id);

-- Update schema version
INSERT INTO schema_version (version) 
VALUES ('1.2.0');