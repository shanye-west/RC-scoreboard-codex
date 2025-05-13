-- Create player_scores table
CREATE TABLE IF NOT EXISTS player_scores (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL,
  match_id INTEGER NOT NULL,
  hole_number INTEGER NOT NULL,
  score INTEGER NOT NULL,
  tournament_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT player_scores_player_id_fk
    FOREIGN KEY (player_id)
    REFERENCES players(id)
    ON DELETE CASCADE,
    
  CONSTRAINT player_scores_match_id_fk
    FOREIGN KEY (match_id)
    REFERENCES matches(id)
    ON DELETE CASCADE,
    
  CONSTRAINT player_scores_tournament_id_fk
    FOREIGN KEY (tournament_id)
    REFERENCES tournament(id)
    ON DELETE SET NULL,
    
  -- Add a unique constraint to ensure only one score per player per hole per match
  CONSTRAINT player_scores_unique_entry
    UNIQUE (player_id, match_id, hole_number)
);

-- Add an index to improve query performance when looking up by match_id
CREATE INDEX IF NOT EXISTS idx_player_scores_match_id
  ON player_scores(match_id);

-- Add an index to improve query performance when looking up by player_id
CREATE INDEX IF NOT EXISTS idx_player_scores_player_id
  ON player_scores(player_id);

-- Add a combined index for match and hole queries
CREATE INDEX IF NOT EXISTS idx_player_scores_match_hole
  ON player_scores(match_id, hole_number);

-- Add a combined index for player and match queries
CREATE INDEX IF NOT EXISTS idx_player_scores_player_match
  ON player_scores(player_id, match_id);

-- Log that this migration has run
INSERT INTO schema_version (version)
VALUES ('3.0.0');