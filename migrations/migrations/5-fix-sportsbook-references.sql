-- Add parlay_id column to bets table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'bets' AND column_name = 'parlay_id') THEN
        ALTER TABLE bets ADD COLUMN parlay_id INTEGER;
    END IF;
END $$;

-- Add foreign key constraint
ALTER TABLE bets
DROP CONSTRAINT IF EXISTS bets_parlay_id_fkey;

ALTER TABLE bets
ADD CONSTRAINT bets_parlay_id_fkey
FOREIGN KEY (parlay_id) REFERENCES parlays(id);