-- Migration: Initial database setup
-- Version: 1.0.0
-- Date: 2025-05-12

-- Schema version tracking table
CREATE TABLE IF NOT EXISTS schema_version (
  id SERIAL PRIMARY KEY,
  version VARCHAR(20) NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Courses table
CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  location TEXT,
  description TEXT,
  course_rating NUMERIC,
  slope_rating INTEGER,
  par INTEGER
);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  color_code TEXT NOT NULL
);

-- Tournament table (multiple tournaments over time)
CREATE TABLE IF NOT EXISTS tournament (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  aviator_score NUMERIC,
  producer_score NUMERIC,
  pending_aviator_score NUMERIC,
  pending_producer_score NUMERIC,
  year INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  start_date TIMESTAMP,
  end_date TIMESTAMP
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  user_id INTEGER,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  status TEXT
);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  passcode TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE NOT NULL,
  player_id INTEGER REFERENCES players(id),
  needs_password_change BOOLEAN DEFAULT TRUE NOT NULL
);

-- Rounds table
CREATE TABLE IF NOT EXISTS rounds (
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
CREATE TABLE IF NOT EXISTS matches (
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

-- Holes table
CREATE TABLE IF NOT EXISTS holes (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  number INTEGER NOT NULL,
  par INTEGER NOT NULL,
  handicap_rank INTEGER
);

-- Match Players table
CREATE TABLE IF NOT EXISTS match_participants (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  team TEXT NOT NULL,
  result TEXT,
  tournament_id INTEGER REFERENCES tournament(id)
);

-- Scores table
CREATE TABLE IF NOT EXISTS scores (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id),
  hole_number INTEGER NOT NULL,
  aviator_score INTEGER,
  producer_score INTEGER,
  winning_team TEXT,
  match_status TEXT,
  tournament_id INTEGER REFERENCES tournament(id)
);

-- Player Course Handicaps table
CREATE TABLE IF NOT EXISTS player_course_handicaps (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  round_id INTEGER REFERENCES rounds(id),
  course_id INTEGER REFERENCES courses(id),
  course_handicap INTEGER NOT NULL
);

-- Tournament Player Stats table
CREATE TABLE IF NOT EXISTS tournament_player_stats (
  id SERIAL PRIMARY KEY,
  tournament_id INTEGER NOT NULL REFERENCES tournament(id),
  player_id INTEGER NOT NULL REFERENCES players(id),
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  points NUMERIC DEFAULT 0,
  matches_played INTEGER DEFAULT 0
);

-- Player Career Stats table
CREATE TABLE IF NOT EXISTS player_career_stats (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id),
  total_wins INTEGER DEFAULT 0,
  total_losses INTEGER DEFAULT 0,
  total_ties INTEGER DEFAULT 0,
  total_points NUMERIC DEFAULT 0,
  tournaments_played INTEGER DEFAULT 0,
  matches_played INTEGER DEFAULT 0,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tournament History table
CREATE TABLE IF NOT EXISTS tournament_history (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  tournament_name TEXT NOT NULL,
  winning_team TEXT,
  aviator_score NUMERIC,
  producer_score NUMERIC,
  tournament_id INTEGER NOT NULL REFERENCES tournament(id),
  location TEXT
);

-- Migrations tracking table
CREATE TABLE IF NOT EXISTS migrations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Insert current schema version
INSERT INTO schema_version (version) VALUES ('1.0.0');