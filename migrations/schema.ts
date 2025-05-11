import { pgTable, foreignKey, serial, integer, text, boolean, numeric, timestamp, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const holes = pgTable("holes", {
        id: serial().primaryKey().notNull(),
        number: integer().notNull(),
        par: integer().notNull(),
        courseId: integer("course_id").notNull(),
        handicapRank: integer("handicap_rank"),
}, (table) => [
        foreignKey({
                        columns: [table.courseId],
                        foreignColumns: [courses.id],
                        name: "holes_course_id_fk"
                }),
]);

export const rounds = pgTable("rounds", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        matchType: text("match_type").notNull(),
        date: text().notNull(),
        courseName: text("course_name").notNull(),
        startTime: text("start_time").notNull(),
        isComplete: boolean("is_complete").default(false),
        status: text(),
        aviatorScore: numeric("aviator_score"),
        producerScore: numeric("producer_score"),
        courseId: integer("course_id"),
        tournamentId: integer("tournament_id").notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.courseId],
                        foreignColumns: [courses.id],
                        name: "rounds_course_id_fk"
                }),
        foreignKey({
                        columns: [table.tournamentId],
                        foreignColumns: [tournament.id],
                        name: "rounds_tournament_id_fk"
                }),
]);

export const matches = pgTable("matches", {
        id: serial().primaryKey().notNull(),
        roundId: integer("round_id").notNull(),
        name: text().notNull(),
        status: text().notNull(),
        currentHole: integer("current_hole").default(1),
        leadingTeam: text("leading_team"),
        leadAmount: integer("lead_amount").default(0),
        result: text(),
        locked: boolean().default(false),
        tournamentId: integer("tournament_id"),
}, (table) => [
        foreignKey({
                        columns: [table.roundId],
                        foreignColumns: [rounds.id],
                        name: "matches_round_id_fk"
                }),
        foreignKey({
                        columns: [table.tournamentId],
                        foreignColumns: [tournament.id],
                        name: "matches_tournament_id_fk"
                }),
]);

export const players = pgTable("players", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        teamId: integer("team_id").notNull(),
        userId: integer("user_id"),
        wins: integer().default(0),
        losses: integer().default(0),
        ties: integer().default(0),
        status: text(),
}, (table) => [
        foreignKey({
                        columns: [table.teamId],
                        foreignColumns: [teams.id],
                        name: "players_team_id_fk"
                }),
]);

export const tournament = pgTable("tournament", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        aviatorScore: numeric("aviator_score"),
        producerScore: numeric("producer_score"),
        pendingAviatorScore: numeric("pending_aviator_score"),
        pendingProducerScore: numeric("pending_producer_score"),
        year: integer().notNull(),
        isActive: boolean("is_active").default(true),
        startDate: timestamp("start_date", { mode: 'string' }),
        endDate: timestamp("end_date", { mode: 'string' }),
});

export const courses = pgTable("courses", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        location: text(),
        description: text(),
        courseRating: numeric("course_rating"),
        slopeRating: integer("slope_rating"),
        par: integer(),
}, (table) => [
        unique("courses_name_unique").on(table.name),
]);

export const teams = pgTable("teams", {
        id: serial().primaryKey().notNull(),
        name: text().notNull(),
        shortName: text("short_name").notNull(),
        colorCode: text("color_code").notNull(),
});

export const users = pgTable("users", {
        id: serial().primaryKey().notNull(),
        username: text().notNull(),
        passcode: text().notNull(),
        isAdmin: boolean("is_admin").default(false).notNull(),
        playerId: integer("player_id"),
        needsPasswordChange: boolean("needs_password_change").default(true).notNull(),
}, (table) => [
        foreignKey({
                        columns: [table.playerId],
                        foreignColumns: [players.id],
                        name: "users_player_id_fk"
                }),
        unique("users_username_unique").on(table.username),
]);

export const tournamentPlayerStats = pgTable("tournament_player_stats", {
        id: serial().primaryKey().notNull(),
        tournamentId: integer("tournament_id").notNull(),
        playerId: integer("player_id").notNull(),
        wins: integer().default(0),
        losses: integer().default(0),
        ties: integer().default(0),
        points: numeric().default('0'),
        matchesPlayed: integer("matches_played").default(0),
}, (table) => [
        foreignKey({
                        columns: [table.tournamentId],
                        foreignColumns: [tournament.id],
                        name: "tournament_player_stats_tournament_id_fk"
                }),
        foreignKey({
                        columns: [table.playerId],
                        foreignColumns: [players.id],
                        name: "tournament_player_stats_player_id_fk"
                }),
]);

export const scores = pgTable("scores", {
        id: serial().primaryKey().notNull(),
        matchId: integer("match_id").notNull(),
        holeNumber: integer("hole_number").notNull(),
        aviatorScore: integer("aviator_score"),
        producerScore: integer("producer_score"),
        winningTeam: text("winning_team"),
        matchStatus: text("match_status"),
        tournamentId: integer("tournament_id"),
}, (table) => [
        foreignKey({
                        columns: [table.matchId],
                        foreignColumns: [matches.id],
                        name: "scores_match_id_fk"
                }),
        foreignKey({
                        columns: [table.tournamentId],
                        foreignColumns: [tournament.id],
                        name: "scores_tournament_id_fk"
                }),
]);

export const playerCourseHandicaps = pgTable("player_course_handicaps", {
        id: serial().primaryKey().notNull(),
        playerId: integer("player_id").notNull(),
        courseId: integer("course_id"),
        courseHandicap: integer("course_handicap").notNull(),
        roundId: integer("round_id"),
}, (table) => [
        foreignKey({
                        columns: [table.playerId],
                        foreignColumns: [players.id],
                        name: "player_course_handicaps_player_id_fk"
                }),
        foreignKey({
                        columns: [table.roundId],
                        foreignColumns: [rounds.id],
                        name: "player_course_handicaps_round_id_fk"
                }),
        foreignKey({
                        columns: [table.courseId],
                        foreignColumns: [courses.id],
                        name: "player_course_handicaps_course_id_fk"
                }),
]);

export const playerCareerStats = pgTable("player_career_stats", {
        id: serial().primaryKey().notNull(),
        playerId: integer("player_id").notNull(),
        totalWins: integer("total_wins").default(0),
        totalLosses: integer("total_losses").default(0),
        totalTies: integer("total_ties").default(0),
        totalPoints: numeric("total_points").default('0'),
        tournamentsPlayed: integer("tournaments_played").default(0),
        matchesPlayed: integer("matches_played").default(0),
        lastUpdated: timestamp("last_updated", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.playerId],
                        foreignColumns: [players.id],
                        name: "player_career_stats_player_id_fk"
                }),
]);

export const tournamentHistory = pgTable("tournament_history", {
        id: serial().primaryKey().notNull(),
        year: integer().notNull(),
        tournamentName: text("tournament_name").notNull(),
        winningTeam: text("winning_team"),
        aviatorScore: numeric("aviator_score"),
        producerScore: numeric("producer_score"),
        tournamentId: integer("tournament_id").notNull(),
        location: text(),
}, (table) => [
        foreignKey({
                        columns: [table.tournamentId],
                        foreignColumns: [tournament.id],
                        name: "tournament_history_tournament_id_fk"
                }),
]);

export const matchParticipants = pgTable("match_participants", {
        id: serial().primaryKey().notNull(),
        matchId: integer("match_id").notNull(),
        userId: integer("user_id").notNull(),
        team: text().notNull(),
        result: text(),
        tournamentId: integer("tournament_id"),
}, (table) => [
        foreignKey({
                        columns: [table.matchId],
                        foreignColumns: [matches.id],
                        name: "match_participants_match_id_fk"
                }),
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [players.id],
                        name: "match_participants_player_id_fk"
                }),
        foreignKey({
                        columns: [table.tournamentId],
                        foreignColumns: [tournament.id],
                        name: "match_participants_tournament_id_fk"
                }),
]);

export const playerMatchups = pgTable("player_matchups", {
        id: serial().primaryKey().notNull(),
        playerId1: integer("player_id_1").notNull(),
        playerId2: integer("player_id_2").notNull(),
        wins: integer().default(0),
        losses: integer().default(0),
        ties: integer().default(0),
        lastPlayed: timestamp("last_played", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.playerId1],
                        foreignColumns: [players.id],
                        name: "player_matchups_player_id_1_fk"
                }),
        foreignKey({
                        columns: [table.playerId2],
                        foreignColumns: [players.id],
                        name: "player_matchups_player_id_2_fk"
                }),
]);

export const playerMatchTypeStats = pgTable("player_match_type_stats", {
        id: serial().primaryKey().notNull(),
        playerId: integer("player_id").notNull(),
        matchType: text("match_type").notNull(),
        wins: integer().default(0),
        losses: integer().default(0),
        ties: integer().default(0),
        lastUpdated: timestamp("last_updated", { mode: 'string' }).defaultNow(),
}, (table) => [
        foreignKey({
                        columns: [table.playerId],
                        foreignColumns: [players.id],
                        name: "player_match_type_stats_player_id_fk"
                }),
]);

export const bets = pgTable("bets", {
        id: serial().primaryKey().notNull(),
        userId: integer("user_id").notNull(),
        matchId: integer("match_id").notNull(),
        betType: text("bet_type").notNull(),
        wagerAmount: numeric("wager_amount").notNull(),
        outcome: text(),
        payout: numeric(),
        created: timestamp("created", { mode: 'string' }).defaultNow(),
        resolved: timestamp("resolved", { mode: 'string' }),
}, (table) => [
        foreignKey({
                        columns: [table.userId],
                        foreignColumns: [users.id],
                        name: "bets_user_id_fk"
                }),
        foreignKey({
                        columns: [table.matchId],
                        foreignColumns: [matches.id],
                        name: "bets_match_id_fk"
                }),
]);
