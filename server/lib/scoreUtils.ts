/**
 * Utility functions for handling score data between the different tables
 */
import { db } from "../db";
import { 
  best_ball_player_scores, 
  player_scores, 
  scores,
  players
} from "@shared/schema";
import { and, eq, sql, desc, asc } from "drizzle-orm";

/**
 * Sync handicap strokes between best_ball_player_scores and player_scores tables
 * This ensures that both tables have consistent data
 */
export async function syncHandicapStrokes(matchId: number) {
  try {
    // Get all best_ball_player_scores for this match
    const bestBallScores = await db
      .select()
      .from(best_ball_player_scores)
      .where(eq(best_ball_player_scores.matchId, matchId));
    
    // For each score, ensure data consistency with player_scores
    for (const score of bestBallScores) {
      // Find matching player_score
      const [playerScore] = await db
        .select()
        .from(player_scores)
        .where(
          and(
            eq(player_scores.matchId, score.matchId),
            eq(player_scores.playerId, score.playerId),
            eq(player_scores.holeNumber, score.holeNumber)
          )
        );
      
      // Only sync if player_score exists and score is set
      if (playerScore && score.score !== null) {
        // Apply handicap strokes to player_scores table for completeness
        await db
          .update(player_scores)
          .set({
            score: score.score,
            updatedAt: new Date().toISOString()
          })
          .where(eq(player_scores.id, playerScore.id));
      }
    }
  } catch (error) {
    console.error("Error syncing handicap strokes:", error);
  }
}

/**
 * Calculate and update team scores for a match based on player scores
 */
export async function updateTeamScores(matchId: number, holeNumber: number) {
  try {
    // Get match participants
    const matchParticipants = await db
      .select()
      .from(players)
      .leftJoin(
        "match_participants",
        and(
          eq("match_participants.playerId", players.id),
          eq("match_participants.matchId", matchId)
        )
      )
      .where(eq("match_participants.matchId", matchId));
    
    // Get player scores for this hole and match
    const playerScores = await db
      .select()
      .from(player_scores)
      .where(
        and(
          eq(player_scores.matchId, matchId),
          eq(player_scores.holeNumber, holeNumber)
        )
      );
    
    // Get best ball player scores for this hole and match
    const bestBallScores = await db
      .select()
      .from(best_ball_player_scores)
      .where(
        and(
          eq(best_ball_player_scores.matchId, matchId),
          eq(best_ball_player_scores.holeNumber, holeNumber)
        )
      );
    
    // Calculate team scores using the most complete data available
    let aviatorScore = null;
    let producerScore = null;
    
    if (bestBallScores.length > 0) {
      // Use best ball scores with handicap
      // Group players by team
      const aviatorPlayers = matchParticipants.filter(mp => mp.team === "aviator");
      const producerPlayers = matchParticipants.filter(mp => mp.team === "producer");
      
      // Find best score for Aviator team (lowest net score)
      const aviatorBestScore = bestBallScores
        .filter(s => aviatorPlayers.some(p => p.id === s.playerId))
        .sort((a, b) => (a.netScore || 999) - (b.netScore || 999))[0];
      
      // Find best score for Producer team
      const producerBestScore = bestBallScores
        .filter(s => producerPlayers.some(p => p.id === s.playerId))
        .sort((a, b) => (a.netScore || 999) - (b.netScore || 999))[0];
      
      aviatorScore = aviatorBestScore?.score || null;
      producerScore = producerBestScore?.score || null;
    } else if (playerScores.length > 0) {
      // Fall back to plain player scores
      // Logic depends on match type and requires more context
      // This is a simplified approach
      const aviatorScores = playerScores.filter(s => 
        matchParticipants.some(mp => mp.id === s.playerId && mp.team === "aviator")
      );
      
      const producerScores = playerScores.filter(s => 
        matchParticipants.some(mp => mp.id === s.playerId && mp.team === "producer")
      );
      
      // Calculate team score based on match type
      // For simplicity, using lowest score for now
      aviatorScore = aviatorScores.length > 0 
        ? Math.min(...aviatorScores.map(s => s.score)) 
        : null;
        
      producerScore = producerScores.length > 0 
        ? Math.min(...producerScores.map(s => s.score)) 
        : null;
    }
    
    // Determine winning team
    let winningTeam = null;
    if (aviatorScore !== null && producerScore !== null) {
      winningTeam = aviatorScore < producerScore 
        ? "aviator" 
        : (producerScore < aviatorScore ? "producer" : "tie");
    }
    
    // Check if score record exists
    const [existingScore] = await db
      .select()
      .from(scores)
      .where(
        and(
          eq(scores.matchId, matchId),
          eq(scores.holeNumber, holeNumber)
        )
      );
    
    // Update or insert team scores
    if (existingScore) {
      await db
        .update(scores)
        .set({
          aviatorScore,
          producerScore,
          winningTeam
        })
        .where(eq(scores.id, existingScore.id));
    } else if (aviatorScore !== null || producerScore !== null) {
      await db
        .insert(scores)
        .values({
          matchId,
          holeNumber,
          aviatorScore,
          producerScore,
          winningTeam
        });
    }
  } catch (error) {
    console.error("Error updating team scores:", error);
  }
}