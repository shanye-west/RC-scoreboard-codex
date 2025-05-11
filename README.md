# Rowdy Cup Scoreboard v3

The Rowdy Cup Scoreboard is a web application for tracking a 12v12 Ryder Cup-style golf tournament between The Aviators and The Producers teams.

## Features

- Track rounds, matches, and scores in real-time
- Mobile-optimized PWA design
- Comprehensive player statistics
- Handicap system support
- Track player matchup history
- Performance analytics by match type
- Future sportsbook integration

## Tech Stack

- **Frontend**: React, TypeScript, TanStack Query, Shadcn UI components
- **Backend**: Express, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Deployment**: Frontend on Vercel, Backend on Render

## Database Schema Changes

This version introduces new tables to track player statistics:

1. **player_matchups**: Tracks head-to-head history between pairs of players
2. **player_match_type_stats**: Tracks player performance in different match types
3. **bets**: Placeholder table for future sportsbook integration

## Setup and Running

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Database Migrations

Use the following script to run SQL migrations:

```bash
# Run migrations
./run-migrations.sh
```

### Deployment

- Frontend is deployed to Vercel
- Backend is deployed to Render
- Set required environment variables:
  - `NODE_ENV` (production)
  - `DATABASE_URL` (PostgreSQL connection string)
  - `VITE_API_URL` (backend API URL)

## Authentication

The application uses PostgreSQL for session storage with cookies that work cross-domain between Vercel and Render.

## License

MIT
