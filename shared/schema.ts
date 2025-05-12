import {
  pgTable,
  text,
  serial,
  integer,
  boolean,
  numeric,
  foreignKey,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Courses table
export const courses = pgTable("courses", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  location: text("location"),
  description: text("description"),
  courseRating: numeric("course_rating"), // Course rating (e.g., 72.4)
  slopeRating: integer("slope_rating"), // Slope rating (e.g., 135)
  par: integer("par"), // Par for the course (typically 72)
});
export const insertCourseSchema = createInsertSchema(courses);
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof courses.$inferSelect;

// Teams table
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  colorCode: text("color_code").notNull(),
});
export const insertTeamSchema = createInsertSchema(teams);
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

// Players table
export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    teamId: integer("team_id").notNull(),
    userId: integer("user_id"), // Reference to user in the users table
    wins: integer("wins").default(0),
    losses: integer("losses").default(0),
    ties: integer("ties").default(0),
    status: text("status"),
    // handicapIndex removed - now using player_course_handicaps table
  },
  (table) => {
    return {
      teamIdFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: "players_team_id_fk",
      }),
    };
  },
);
// Create a custom schema for players
export const insertPlayerSchema = z.object({
  id: z.number().optional(),
  name: z.string(),
  teamId: z.number(),
  userId: z.number().optional(),
  wins: z.number().optional().default(0),
  losses: z.number().optional().default(0),
  ties: z.number().optional().default(0),
  status: z.string().optional(),
  // handicapIndex removed - now using player_course_handicaps table
});
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;
export type Player = typeof players.$inferSelect;

// Users table (updated to New Schema)
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    username: text("username").notNull().unique(),
    passcode: text("passcode").notNull(),
    isAdmin: boolean("is_admin").default(false).notNull(),
    playerId: integer("player_id"),
    needsPasswordChange: boolean("needs_password_change")
      .default(true)
      .notNull(),
  },
  (table) => {
    return {
      playerIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: "users_player_id_fk",
      }),
    };
  },
);
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  passcode: true,
  isAdmin: true,
  playerId: true,
  needsPasswordChange: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Holes table (with course_id foreign key)
export const holes = pgTable(
  "holes",
  {
    id: serial("id").primaryKey(),
    courseId: integer("course_id").notNull(),
    number: integer("number").notNull(),
    par: integer("par").notNull(),
    handicapRank: integer("handicap_rank"), // Handicap ranking (1-18), 1 is hardest hole
  },
  (table) => {
    return {
      courseIdFk: foreignKey({
        columns: [table.courseId],
        foreignColumns: [courses.id],
        name: "holes_course_id_fk",
      }),
    };
  },
);
export const insertHoleSchema = createInsertSchema(holes);
export type InsertHole = z.infer<typeof insertHoleSchema>;
export type Hole = typeof holes.$inferSelect;

// Tournament table (multiple tournaments over time)
export const tournament = pgTable("tournament", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  aviatorScore: numeric("aviator_score"),
  producerScore: numeric("producer_score"),
  pendingAviatorScore: numeric("pending_aviator_score"),
  pendingProducerScore: numeric("pending_producer_score"),
  year: integer("year").notNull(), // Keep for backward compatibility
  isActive: boolean("is_active").default(true),
  startDate: timestamp("start_date", { mode: 'string' }),
  endDate: timestamp("end_date", { mode: 'string' }),
});
export const insertTournamentSchema = createInsertSchema(tournament);
export type InsertTournament = z.infer<typeof insertTournamentSchema>;
export type Tournament = typeof tournament.$inferSelect;

// Rounds table
export const rounds = pgTable(
  "rounds",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    matchType: text("match_type").notNull(),
    date: text("date").notNull(),
    courseName: text("course_name").notNull(),
    startTime: text("start_time").notNull(),
    isComplete: boolean("is_complete").default(false),
    status: text("status"),
    aviatorScore: numeric("aviator_score"),
    producerScore: numeric("producer_score"),
    courseId: integer("course_id"),
    tournamentId: integer("tournament_id").notNull(),
  },
  (table) => {
    return {
      courseIdFk: foreignKey({
        columns: [table.courseId],
        foreignColumns: [courses.id],
        name: "rounds_course_id_fk",
      }),
      tournamentIdFk: foreignKey({
        columns: [table.tournamentId],
        foreignColumns: [tournament.id],
        name: "rounds_tournament_id_fk",
      }),
    };
  },
);
export const insertRoundSchema = createInsertSchema(rounds);
export type InsertRound = z.infer<typeof insertRoundSchema>;
export type Round = typeof rounds.$inferSelect;

// Matches table
export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    roundId: integer("round_id").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    currentHole: integer("current_hole").default(1),
    leadingTeam: text("leading_team"),
    leadAmount: integer("lead_amount").default(0),
    result: text("result"),
    locked: boolean("locked").default(false),
    tournamentId: integer("tournament_id"),
  },
  (table) => {
    return {
      roundIdFk: foreignKey({
        columns: [table.roundId],
        foreignColumns: [rounds.id],
        name: "matches_round_id_fk",
      }),
      tournamentIdFk: foreignKey({
        columns: [table.tournamentId],
        foreignColumns: [tournament.id],
        name: "matches_tournament_id_fk",
      }),
    };
  },
);
export const insertMatchSchema = createInsertSchema(matches);
export type InsertMatch = z.infer<typeof insertMatchSchema>;
export type Match = typeof matches.$inferSelect;

// Match Players table
export const match_players = pgTable(
  "match_participants",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id").notNull(),
    playerId: integer("user_id").notNull(),
    team: text("team").notNull(),
    result: text("result"),
    tournamentId: integer("tournament_id"),
  },
  (table) => {
    return {
      matchIdFk: foreignKey({
        columns: [table.matchId],
        foreignColumns: [matches.id],
        name: "match_participants_match_id_fk",
      }),
      playerIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: "match_participants_player_id_fk",
      }),
      tournamentIdFk: foreignKey({
        columns: [table.tournamentId],
        foreignColumns: [tournament.id],
        name: "match_participants_tournament_id_fk",
      }),
    };
  },
);
export const insertMatchPlayerSchema = createInsertSchema(match_players);
export type InsertMatchPlayer = z.infer<typeof insertMatchPlayerSchema>;
export type MatchPlayer = typeof match_players.$inferSelect;

// Scores table
export const scores = pgTable(
  "scores",
  {
    id: serial("id").primaryKey(),
    matchId: integer("match_id").notNull(),
    holeNumber: integer("hole_number").notNull(),
    aviatorScore: integer("aviator_score"),
    producerScore: integer("producer_score"),
    winningTeam: text("winning_team"),
    matchStatus: text("match_status"),
    tournamentId: integer("tournament_id"),
  },
  (table) => {
    return {
      matchIdFk: foreignKey({
        columns: [table.matchId],
        foreignColumns: [matches.id],
        name: "scores_match_id_fk",
      }),
      tournamentIdFk: foreignKey({
        columns: [table.tournamentId],
        foreignColumns: [tournament.id],
        name: "scores_tournament_id_fk",
      }),
    };
  },
);
export const insertScoreSchema = createInsertSchema(scores);
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Score = typeof scores.$inferSelect;

// Player Course Handicaps table - stores calculated course handicaps for players in specific rounds
export const player_course_handicaps = pgTable(
  "player_course_handicaps",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").notNull(),
    roundId: integer("round_id"),
    courseId: integer("course_id"),
    courseHandicap: integer("course_handicap").notNull(), // Calculated course handicap (rounded)
  },
  (table) => {
    return {
      playerIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: "player_course_handicaps_player_id_fk",
      }),
      roundIdFk: foreignKey({
        columns: [table.roundId],
        foreignColumns: [rounds.id],
        name: "player_course_handicaps_round_id_fk",
      }),
      courseIdFk: foreignKey({
        columns: [table.courseId],
        foreignColumns: [courses.id],
        name: "player_course_handicaps_course_id_fk",
      }),
    };
  },
);
export const insertPlayerCourseHandicapSchema = createInsertSchema(
  player_course_handicaps,
);
export type InsertPlayerCourseHandicap = z.infer<
  typeof insertPlayerCourseHandicapSchema
>;
export type PlayerCourseHandicap = typeof player_course_handicaps.$inferSelect;

// Tournament Player Stats table - stores player statistics for each tournament
export const tournament_player_stats = pgTable(
  "tournament_player_stats",
  {
    id: serial("id").primaryKey(),
    tournamentId: integer("tournament_id").notNull(),
    playerId: integer("player_id").notNull(),
    wins: integer("wins").default(0),
    losses: integer("losses").default(0),
    ties: integer("ties").default(0),
    points: numeric("points").default("0"),
    matchesPlayed: integer("matches_played").default(0),
  },
  (table) => {
    return {
      tournamentIdFk: foreignKey({
        columns: [table.tournamentId],
        foreignColumns: [tournament.id],
        name: "tournament_player_stats_tournament_id_fk",
      }),
      playerIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: "tournament_player_stats_player_id_fk",
      }),
    };
  },
);
export const insertTournamentPlayerStatSchema = createInsertSchema(
  tournament_player_stats,
);
export type InsertTournamentPlayerStat = z.infer<
  typeof insertTournamentPlayerStatSchema
>;
export type TournamentPlayerStat = typeof tournament_player_stats.$inferSelect;

// Tournament history table - tracks tournament results over time
export const tournament_history = pgTable(
  "tournament_history",
  {
    id: serial("id").primaryKey(),
    year: integer("year").notNull(),
    tournamentName: text("tournament_name").notNull(),
    winningTeam: text("winning_team"),
    aviatorScore: numeric("aviator_score"),
    producerScore: numeric("producer_score"),
    tournamentId: integer("tournament_id").notNull(),
    location: text("location"),
  },
  (table) => {
    return {
      tournamentIdFk: foreignKey({
        columns: [table.tournamentId],
        foreignColumns: [tournament.id],
        name: "tournament_history_tournament_id_fk",
      }),
    };
  },
);
export const insertTournamentHistorySchema =
  createInsertSchema(tournament_history);
export type InsertTournamentHistory = z.infer<
  typeof insertTournamentHistorySchema
>;
export type TournamentHistory = typeof tournament_history.$inferSelect;

// Player career stats table - tracks cumulative stats across all tournaments
export const player_career_stats = pgTable(
  "player_career_stats",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").notNull(),
    totalWins: integer("total_wins").default(0),
    totalLosses: integer("total_losses").default(0),
    totalTies: integer("total_ties").default(0),
    totalPoints: numeric("total_points").default("0"),
    tournamentsPlayed: integer("tournaments_played").default(0),
    matchesPlayed: integer("matches_played").default(0),
    lastUpdated: timestamp("last_updated", { mode: 'string' }).defaultNow(),
  },
  (table) => {
    return {
      playerIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: "player_career_stats_player_id_fk",
      }),
    };
  },
);
export const insertPlayerCareerStatSchema =
  createInsertSchema(player_career_stats);
export type InsertPlayerCareerStat = z.infer<
  typeof insertPlayerCareerStatSchema
>;
export type PlayerCareerStat = typeof player_career_stats.$inferSelect;

// Player Matchups table - tracks individual matchup results between players
export const player_matchups = pgTable(
  "player_matchups",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").notNull(),
    opponentId: integer("opponent_id").notNull(),
    matchId: integer("match_id").notNull(),
    tournamentId: integer("tournament_id"),
    result: text("result").$type<'win' | 'loss' | 'tie'>(),
    matchType: text("match_type").notNull(),
    createdAt: timestamp("created_at", { mode: 'string' }).defaultNow(),
  },
  (table) => {
    return {
      playerIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: "player_matchups_player_id_fk",
      }),
      opponentIdFk: foreignKey({
        columns: [table.opponentId],
        foreignColumns: [players.id],
        name: "player_matchups_opponent_id_fk",
      }),
      matchIdFk: foreignKey({
        columns: [table.matchId],
        foreignColumns: [matches.id],
        name: "player_matchups_match_id_fk",
      }),
      tournamentIdFk: foreignKey({
        columns: [table.tournamentId],
        foreignColumns: [tournament.id],
        name: "player_matchups_tournament_id_fk",
      }),
    };
  },
);
export const insertPlayerMatchupSchema = createInsertSchema(player_matchups);
export type InsertPlayerMatchup = z.infer<typeof insertPlayerMatchupSchema>;
export type PlayerMatchup = typeof player_matchups.$inferSelect;

// Player Match Type Stats table - tracks player performance in different match types
export const player_match_type_stats = pgTable(
  "player_match_type_stats",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").notNull(),
    matchType: text("match_type").notNull(),
    wins: integer("wins").default(0),
    losses: integer("losses").default(0),
    ties: integer("ties").default(0),
    lastUpdated: timestamp("last_updated", { mode: 'string' }).defaultNow(),
  },
  (table) => {
    return {
      playerIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: "player_match_type_stats_player_id_fk",
      }),
    };
  },
);
export const insertPlayerMatchTypeStatSchema = createInsertSchema(player_match_type_stats);
export type InsertPlayerMatchTypeStat = z.infer<typeof insertPlayerMatchTypeStatSchema>;
export type PlayerMatchTypeStat = typeof player_match_type_stats.$inferSelect;

// Bets table - for future sportsbook integration
export const bets = pgTable(
  "bets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    matchId: integer("match_id").notNull(),
    betType: text("bet_type").notNull(),
    wagerAmount: numeric("wager_amount").notNull(),
    outcome: text("outcome"),
    payout: numeric("payout"),
    created: timestamp("created", { mode: 'string' }).defaultNow(),
    resolved: timestamp("resolved", { mode: 'string' }),
  },
  (table) => {
    return {
      userIdFk: foreignKey({
        columns: [table.userId],
        foreignColumns: [users.id],
        name: "bets_user_id_fk",
      }),
      matchIdFk: foreignKey({
        columns: [table.matchId],
        foreignColumns: [matches.id],
        name: "bets_match_id_fk",
      }),
    };
  },
);
export const insertBetSchema = createInsertSchema(bets);
export type InsertBet = z.infer<typeof insertBetSchema>;
export type Bet = typeof bets.$inferSelect;
