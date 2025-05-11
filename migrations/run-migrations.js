// migrations/run-migrations.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get database connection details
const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

// Create a PostgreSQL client
const client = new pg.Client({
  connectionString: DATABASE_URL,
});

async function runMigrations() {
  try {
    await client.connect();
    console.log('Connected to database');

    // Create migrations table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of applied migrations
    const appliedMigrationsResult = await client.query('SELECT name FROM migrations');
    const appliedMigrations = new Set(appliedMigrationsResult.rows.map(row => row.name));

    // Get migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensure alphabetical order

    console.log('Found migration files:', migrationFiles);

    // Run pending migrations
    for (const file of migrationFiles) {
      if (!appliedMigrations.has(file)) {
        console.log(`Running migration: ${file}`);
        
        // Read and execute the SQL file
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        
        // Execute the migration within a transaction
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`Migration ${file} applied successfully`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`Error applying migration ${file}:`, err);
          process.exit(1);
        }
      } else {
        console.log(`Migration ${file} already applied, skipping`);
      }
    }

    console.log('All migrations applied successfully');
  } catch (err) {
    console.error('Error running migrations:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigrations();