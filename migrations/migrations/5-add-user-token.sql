-- Add token column to users table
ALTER TABLE users ADD COLUMN token TEXT UNIQUE;

-- Create index for faster token lookups
CREATE INDEX idx_users_token ON users(token); 