import { relations } from "drizzle-orm/relations";
import { 
  courses, 
  holes, 
  rounds, 
  tournament, 
  matches, 
  teams, 
  players, 
  users, 
  tournamentPlayerStats, 
  scores, 
  playerCourseHandicaps, 
  playerCareerStats, 
  tournamentHistory, 
  matchParticipants,
  playerMatchups,
  playerMatchTypeStats,
  bets
} from "./schema";

export const holesRelations = relations(holes, ({one}) => ({
        course: one(courses, {
                fields: [holes.courseId],
                references: [courses.id]
        }),
}));

export const coursesRelations = relations(courses, ({many}) => ({
        holes: many(holes),
        rounds: many(rounds),
        playerCourseHandicaps: many(playerCourseHandicaps),
}));

export const roundsRelations = relations(rounds, ({one, many}) => ({
        course: one(courses, {
                fields: [rounds.courseId],
                references: [courses.id]
        }),
        tournament: one(tournament, {
                fields: [rounds.tournamentId],
                references: [tournament.id]
        }),
        matches: many(matches),
        playerCourseHandicaps: many(playerCourseHandicaps),
}));

export const tournamentRelations = relations(tournament, ({many}) => ({
        rounds: many(rounds),
        matches: many(matches),
        tournamentPlayerStats: many(tournamentPlayerStats),
        scores: many(scores),
        tournamentHistories: many(tournamentHistory),
        matchParticipants: many(matchParticipants),
}));

export const matchesRelations = relations(matches, ({one, many}) => ({
        round: one(rounds, {
                fields: [matches.roundId],
                references: [rounds.id]
        }),
        tournament: one(tournament, {
                fields: [matches.tournamentId],
                references: [tournament.id]
        }),
        scores: many(scores),
        matchParticipants: many(matchParticipants),
}));

export const playersRelations = relations(players, ({one, many}) => ({
        team: one(teams, {
                fields: [players.teamId],
                references: [teams.id]
        }),
        users: many(users),
        tournamentPlayerStats: many(tournamentPlayerStats),
        playerCourseHandicaps: many(playerCourseHandicaps),
        playerCareerStats: many(playerCareerStats),
        matchParticipants: many(matchParticipants),
        playerMatchTypeStats: many(playerMatchTypeStats),
        // Player matchups
        playerMatchups: many(playerMatchups, { relationName: "playerMatchups" }),
        // Opponent matchups
        opponentMatchups: many(playerMatchups, { relationName: "opponentMatchups" }),
}));

export const teamsRelations = relations(teams, ({many}) => ({
        players: many(players),
}));

export const usersRelations = relations(users, ({one}) => ({
        player: one(players, {
                fields: [users.playerId],
                references: [players.id]
        }),
}));

export const tournamentPlayerStatsRelations = relations(tournamentPlayerStats, ({one}) => ({
        tournament: one(tournament, {
                fields: [tournamentPlayerStats.tournamentId],
                references: [tournament.id]
        }),
        player: one(players, {
                fields: [tournamentPlayerStats.playerId],
                references: [players.id]
        }),
}));

export const scoresRelations = relations(scores, ({one}) => ({
        match: one(matches, {
                fields: [scores.matchId],
                references: [matches.id]
        }),
        tournament: one(tournament, {
                fields: [scores.tournamentId],
                references: [tournament.id]
        }),
}));

export const playerCourseHandicapsRelations = relations(playerCourseHandicaps, ({one}) => ({
        player: one(players, {
                fields: [playerCourseHandicaps.playerId],
                references: [players.id]
        }),
        round: one(rounds, {
                fields: [playerCourseHandicaps.roundId],
                references: [rounds.id]
        }),
        course: one(courses, {
                fields: [playerCourseHandicaps.courseId],
                references: [courses.id]
        }),
}));

export const playerCareerStatsRelations = relations(playerCareerStats, ({one}) => ({
        player: one(players, {
                fields: [playerCareerStats.playerId],
                references: [players.id]
        }),
}));

export const tournamentHistoryRelations = relations(tournamentHistory, ({one}) => ({
        tournament: one(tournament, {
                fields: [tournamentHistory.tournamentId],
                references: [tournament.id]
        }),
}));

export const matchParticipantsRelations = relations(matchParticipants, ({one}) => ({
        match: one(matches, {
                fields: [matchParticipants.matchId],
                references: [matches.id]
        }),
        player: one(players, {
                fields: [matchParticipants.userId],
                references: [players.id]
        }),
        tournament: one(tournament, {
                fields: [matchParticipants.tournamentId],
                references: [tournament.id]
        }),
}));

export const playerMatchupsRelations = relations(playerMatchups, ({one}) => ({
        player: one(players, {
                fields: [playerMatchups.playerId],
                references: [players.id]
        }),
        opponent: one(players, {
                fields: [playerMatchups.opponentId],
                references: [players.id]
        }),
        match: one(matches, {
                fields: [playerMatchups.matchId],
                references: [matches.id]
        }),
        tournament: one(tournament, {
                fields: [playerMatchups.tournamentId],
                references: [tournament.id]
        }),
}));

export const playerMatchTypeStatsRelations = relations(playerMatchTypeStats, ({one}) => ({
        player: one(players, {
                fields: [playerMatchTypeStats.playerId],
                references: [players.id]
        }),
}));

export const betsRelations = relations(bets, ({one}) => ({
        user: one(users, {
                fields: [bets.userId],
                references: [users.id]
        }),
        match: one(matches, {
                fields: [bets.matchId],
                references: [matches.id]
        }),
}));