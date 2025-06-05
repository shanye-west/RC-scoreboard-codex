-- Complete SQL schema for RC Scoreboard Codex database
-- This matches the schema defined in shared/schema.ts

-- Enable UUID extension if needed
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Courses table
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    location TEXT,
    description TEXT,
    course_rating NUMERIC, -- Course rating (e.g., 72.4)
    slope_rating INTEGER, -- Slope rating (e.g., 135)
    par INTEGER -- Par for the course (typically 72)
);

-- Teams table
CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    color_code TEXT NOT NULL
);

-- Players table
CREATE TABLE players (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    team_id INTEGER NOT NULL REFERENCES teams(id),
    user_id INTEGER, -- Reference to user in the users table
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    ties INTEGER DEFAULT 0,
    status TEXT
);

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    passcode TEXT NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE NOT NULL,
    player_id INTEGER REFERENCES players(id),
    needs_password_change BOOLEAN DEFAULT TRUE NOT NULL
);

-- Holes table (with course_id foreign key)
CREATE TABLE holes (
    id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES courses(id),
    number INTEGER NOT NULL,
    par INTEGER NOT NULL,
    handicap_rank INTEGER -- Handicap ranking (1-18), 1 is hardest hole
);

-- Tournament table (multiple tournaments over time)
CREATE TABLE tournament (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    aviator_score NUMERIC,
    producer_score NUMERIC,
    pending_aviator_score NUMERIC,
    pending_producer_score NUMERIC,
    year INTEGER NOT NULL, -- Keep for backward compatibility
    is_active BOOLEAN DEFAULT TRUE,
    start_date TIMESTAMP,
    end_date TIMESTAMP
);

-- Rounds table
CREATE TABLE rounds (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    match_type TEXT NOT NULL,
    date TEXT NOT NULL,
    course_name TEXT NOT NULL,
    start_time TEXT NOT NULL,
    is_complete BOOLEAN DEFAULT FALSE,
    status TEXT,
    aviator_score NUMERIC,
    producer_score NUMERIC,
    course_id INTEGER REFERENCES courses(id),
    tournament_id INTEGER NOT NULL REFERENCES tournament(id)
);

-- Matches table
CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    round_id INTEGER NOT NULL REFERENCES rounds(id),
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    current_hole INTEGER DEFAULT 1,
    leading_team TEXT,
    lead_amount INTEGER DEFAULT 0,
    result TEXT,
    locked BOOLEAN DEFAULT FALSE,
    tournament_id INTEGER REFERENCES tournament(id)
);

-- Match Players table (note: table name is match_participants but aliased as match_players in code)
CREATE TABLE match_participants (
    id SERIAL PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id),
    user_id INTEGER NOT NULL REFERENCES players(id), -- Note: column name is user_id but references players
    team TEXT NOT NULL,
    result TEXT,
    tournament_id INTEGER REFERENCES tournament(id)
);

-- Scores table
CREATE TABLE scores (
    id SERIAL PRIMARY KEY,
    match_id INTEGER NOT NULL REFERENCES matches(id),
    hole_number INTEGER NOT NULL,
    aviator_score INTEGER,
    producer_score INTEGER,
    winning_team TEXT,
    match_status TEXT,
    tournament_id INTEGER REFERENCES tournament(id)
);

-- Player Course Handicaps table - stores calculated course handicaps for players in specific rounds
CREATE TABLE player_course_handicaps (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    round_id INTEGER REFERENCES rounds(id),
    course_id INTEGER REFERENCES courses(id),
    course_handicap INTEGER NOT NULL -- Calculated course handicap (rounded)
);

-- Tournament Player Stats table - stores player statistics for each tournament
CREATE TABLE tournament_player_stats (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER NOT NULL REFERENCES tournament(id),
    player_id INTEGER NOT NULL REFERENCES players(id),
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    ties INTEGER DEFAULT 0,
    points NUMERIC DEFAULT 0,
    matches_played INTEGER DEFAULT 0,
    UNIQUE(tournament_id, player_id)
);

-- Tournament history table - tracks tournament results over time
CREATE TABLE tournament_history (
    id SERIAL PRIMARY KEY,
    year INTEGER NOT NULL,
    tournament_name TEXT NOT NULL,
    winning_team TEXT,
    aviator_score NUMERIC,
    producer_score NUMERIC,
    tournament_id INTEGER NOT NULL REFERENCES tournament(id),
    location TEXT,
    UNIQUE(tournament_id)
);

-- Player career stats table - tracks cumulative stats across all tournaments
CREATE TABLE player_career_stats (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    total_ties INTEGER DEFAULT 0,
    total_points NUMERIC DEFAULT 0,
    tournaments_played INTEGER DEFAULT 0,
    matches_played INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id)
);

-- Player Matchups table - tracks individual matchup results between players
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

-- Player Match Type Stats table - tracks player performance in different match types
CREATE TABLE player_match_type_stats (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    match_type TEXT NOT NULL,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    ties INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(player_id, match_type)
);

-- Player Scores table - tracks individual player scores for each hole
CREATE TABLE player_scores (
    id SERIAL PRIMARY KEY,
    player_id INTEGER NOT NULL REFERENCES players(id),
    match_id INTEGER NOT NULL REFERENCES matches(id),
    hole_number INTEGER NOT NULL,
    score INTEGER NOT NULL,
    tournament_id INTEGER REFERENCES tournament(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bet Types Table - defines the different types of bets available
CREATE TABLE bet_types (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE, -- 'match_winner', 'player_prop', 'round_winner', 'over_under', etc.
    description TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- Enhanced Bets table - supports all bet types
CREATE TABLE bets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    bet_type_id INTEGER NOT NULL REFERENCES bet_types(id),
    description TEXT NOT NULL, -- Human-readable description of the bet
    amount NUMERIC NOT NULL, -- Wager amount
    odds NUMERIC DEFAULT 1.0, -- Multiplier for payout calculation
    potential_payout NUMERIC, -- Potential payout if bet wins
    is_parlay BOOLEAN DEFAULT FALSE, -- Whether this is a parlay bet
    parlay_id INTEGER, -- Reference to parent parlay bet if this is part of a parlay
    status TEXT NOT NULL CHECK (status IN ('pending', 'won', 'lost', 'push', 'cancelled')) DEFAULT 'pending',
    settled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tournament_id INTEGER REFERENCES tournament(id),
    round_id INTEGER REFERENCES rounds(id), -- For round-based bets
    match_id INTEGER REFERENCES matches(id), -- For match-based bets
    player_id INTEGER REFERENCES players(id), -- For player prop bets
    -- Store bet parameters in standardized fields
    selected_option TEXT NOT NULL, -- 'aviators', 'producers', 'tie', 'over', 'under', etc.
    line NUMERIC, -- For over/under bets (e.g., 2.5 matches)
    actual_result TEXT -- Actual outcome when bet is settled
);

-- Parlay Bets table - for tracking parlays
CREATE TABLE parlays (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    description TEXT NOT NULL,
    total_amount NUMERIC NOT NULL,
    total_odds NUMERIC NOT NULL, -- Aggregate odds for the entire parlay
    potential_payout NUMERIC NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'won', 'lost', 'partial', 'cancelled')) DEFAULT 'pending',
    settled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    tournament_id INTEGER REFERENCES tournament(id)
);

-- Bet Settlement History - for audit/tracking of bet outcomes
CREATE TABLE bet_settlements (
    id SERIAL PRIMARY KEY,
    bet_id INTEGER NOT NULL REFERENCES bets(id),
    previous_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    settled_by INTEGER NOT NULL REFERENCES users(id), -- User ID of admin who settled the bet
    reason TEXT,
    settled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    payout NUMERIC
);

-- Ledger table - tracks money owed between users
CREATE TABLE betting_ledger (
    id SERIAL PRIMARY KEY,
    creditor_id INTEGER NOT NULL REFERENCES users(id), -- User who is owed money
    debtor_id INTEGER NOT NULL REFERENCES users(id), -- User who owes money
    amount NUMERIC NOT NULL, -- Amount owed
    bet_id INTEGER NOT NULL REFERENCES bets(id), -- Related bet
    status TEXT CHECK (status IN ('pending', 'paid', 'disputed')) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    settled_at TIMESTAMP
);

-- Best Ball Player Scores table
CREATE TABLE best_ball_player_scores (
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

-- Create indexes for better performance
CREATE INDEX idx_players_team_id ON players(team_id);
CREATE INDEX idx_users_player_id ON users(player_id);
CREATE INDEX idx_holes_course_id ON holes(course_id);
CREATE INDEX idx_rounds_course_id ON rounds(course_id);
CREATE INDEX idx_rounds_tournament_id ON rounds(tournament_id);
CREATE INDEX idx_matches_round_id ON matches(round_id);
CREATE INDEX idx_matches_tournament_id ON matches(tournament_id);
CREATE INDEX idx_match_participants_match_id ON match_participants(match_id);
CREATE INDEX idx_match_participants_user_id ON match_participants(user_id);
CREATE INDEX idx_scores_match_id ON scores(match_id);
CREATE INDEX idx_player_course_handicaps_player_id ON player_course_handicaps(player_id);
CREATE INDEX idx_player_course_handicaps_round_id ON player_course_handicaps(round_id);
CREATE INDEX idx_tournament_player_stats_tournament_id ON tournament_player_stats(tournament_id);
CREATE INDEX idx_tournament_player_stats_player_id ON tournament_player_stats(player_id);
CREATE INDEX idx_player_matchups_player_id ON player_matchups(player_id);
CREATE INDEX idx_player_matchups_opponent_id ON player_matchups(opponent_id);
CREATE INDEX idx_player_matchups_match_id ON player_matchups(match_id);
CREATE INDEX idx_player_scores_player_id ON player_scores(player_id);
CREATE INDEX idx_player_scores_match_id ON player_scores(match_id);
CREATE INDEX idx_bets_user_id ON bets(user_id);
CREATE INDEX idx_bets_match_id ON bets(match_id);
CREATE INDEX idx_bets_tournament_id ON bets(tournament_id);
CREATE INDEX idx_best_ball_scores_match_id ON best_ball_player_scores(match_id);
CREATE INDEX idx_best_ball_scores_player_id ON best_ball_player_scores(player_id);

-- Add foreign key constraints that reference parlay table
ALTER TABLE bets ADD CONSTRAINT bets_parlay_id_fk FOREIGN KEY (parlay_id) REFERENCES parlays(id);

-- Comments for documentation
COMMENT ON TABLE courses IS 'Golf courses where tournaments are played';
COMMENT ON TABLE teams IS 'Tournament teams (Aviators and Producers)';
COMMENT ON TABLE players IS 'Individual players participating in tournaments';
COMMENT ON TABLE users IS 'User accounts for accessing the system';
COMMENT ON TABLE holes IS 'Individual holes for each course with par and handicap info';
COMMENT ON TABLE tournament IS 'Tournament instances over time';
COMMENT ON TABLE rounds IS 'Individual rounds within tournaments';
COMMENT ON TABLE matches IS 'Individual matches within rounds';
COMMENT ON TABLE match_participants IS 'Players participating in specific matches';
COMMENT ON TABLE scores IS 'Team scores for each hole in matches';
COMMENT ON TABLE player_course_handicaps IS 'Calculated course handicaps for players';
COMMENT ON TABLE tournament_player_stats IS 'Player statistics for specific tournaments';
COMMENT ON TABLE tournament_history IS 'Historical tournament results';
COMMENT ON TABLE player_career_stats IS 'Cumulative career statistics for players';
COMMENT ON TABLE player_matchups IS 'Head-to-head matchup results between players';
COMMENT ON TABLE player_match_type_stats IS 'Player performance by match type';
COMMENT ON TABLE player_scores IS 'Individual player scores for each hole';
COMMENT ON TABLE bet_types IS 'Types of bets available in the sportsbook';
COMMENT ON TABLE bets IS 'Individual betting transactions';
COMMENT ON TABLE parlays IS 'Parlay betting combinations';
COMMENT ON TABLE bet_settlements IS 'Audit trail for bet settlements';
COMMENT ON TABLE betting_ledger IS 'Money owed between users from betting';
COMMENT ON TABLE best_ball_player_scores IS 'Individual scores for best ball format matches';
