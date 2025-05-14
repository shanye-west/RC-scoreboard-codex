-- Add best_ball_player_scores table for storing individual player scores in Best Ball matches
CREATE TABLE IF NOT EXISTS best_ball_player_scores (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  hole_number INTEGER NOT NULL,
  score INTEGER,
  handicap_strokes INTEGER DEFAULT 0,
  net_score INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_best_ball_scores_match ON best_ball_player_scores(match_id);
CREATE INDEX IF NOT EXISTS idx_best_ball_scores_player ON best_ball_player_scores(player_id);
CREATE INDEX IF NOT EXISTS idx_best_ball_scores_hole ON best_ball_player_scores(hole_number);

-- Add unique constraint to prevent duplicate scores
ALTER TABLE best_ball_player_scores
ADD CONSTRAINT unique_player_hole_match UNIQUE (match_id, player_id, hole_number); 