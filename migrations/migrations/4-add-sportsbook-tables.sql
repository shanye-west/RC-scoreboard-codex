-- Create bet types table
CREATE TABLE IF NOT EXISTS bet_types (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- Create bets table
CREATE TABLE IF NOT EXISTS bets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  bet_type_id INTEGER NOT NULL REFERENCES bet_types(id),
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  odds NUMERIC DEFAULT 1.0,
  potential_payout NUMERIC,
  is_parlay BOOLEAN DEFAULT FALSE,
  parlay_id INTEGER REFERENCES parlays(id),
  status TEXT NOT NULL DEFAULT 'pending',
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tournament_id INTEGER REFERENCES tournament(id),
  round_id INTEGER REFERENCES rounds(id),
  match_id INTEGER REFERENCES matches(id),
  player_id INTEGER REFERENCES players(id),
  selected_option TEXT NOT NULL,
  line NUMERIC,
  actual_result TEXT
);

-- Create parlays table
CREATE TABLE IF NOT EXISTS parlays (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  description TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  total_odds NUMERIC NOT NULL,
  potential_payout NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tournament_id INTEGER REFERENCES tournament(id)
);

-- Create bet settlements table
CREATE TABLE IF NOT EXISTS bet_settlements (
  id SERIAL PRIMARY KEY,
  bet_id INTEGER NOT NULL REFERENCES bets(id),
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  settled_by INTEGER NOT NULL REFERENCES users(id),
  reason TEXT,
  settled_at TIMESTAMPTZ DEFAULT NOW(),
  payout NUMERIC
);

-- Create betting ledger table
CREATE TABLE IF NOT EXISTS betting_ledger (
  id SERIAL PRIMARY KEY,
  creditor_id INTEGER NOT NULL REFERENCES users(id),
  debtor_id INTEGER NOT NULL REFERENCES users(id),
  amount NUMERIC NOT NULL,
  bet_id INTEGER NOT NULL REFERENCES bets(id),
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

-- Add reference for parlay_id in bets table
-- This needs to be added after both tables are created due to the circular reference
ALTER TABLE bets
ADD CONSTRAINT bets_parlay_id_fkey
FOREIGN KEY (parlay_id) REFERENCES parlays(id);

-- Insert default bet types
INSERT INTO bet_types (name, description, is_active)
VALUES 
  ('match_winner', 'Bet on which team wins a specific match', true),
  ('player_prop', 'Bet on whether a specific player will win, tie, or lose their match', true),
  ('round_winner', 'Bet on which team wins the most matches in a given round', true),
  ('over_under', 'Bet on whether a statistic will be over or under a specified value', true),
  ('parlay', 'Combine multiple bets for higher risk/reward', true)
ON CONFLICT (name) DO NOTHING;