import { pool } from '../index';
import { BestBallMatch, BestBallPlayerScore } from '../../types/bestBall';

export const getBestBallMatch = async (matchId: number): Promise<BestBallMatch | null> => {
  const result = await pool.query(
    'SELECT * FROM best_ball_matches WHERE id = $1',
    [matchId]
  );
  return result.rows[0] || null;
};

export const getBestBallScores = async (matchId: number): Promise<BestBallPlayerScore[]> => {
  const result = await pool.query(
    `SELECT 
      bbps.*,
      p.name as player_name,
      p.team_id
    FROM best_ball_player_scores bbps
    JOIN players p ON p.id = bbps.player_id
    WHERE bbps.match_id = $1
    ORDER BY bbps.hole_number, p.team_id`,
    [matchId]
  );
  return result.rows;
};

export const saveBestBallScore = async (
  matchId: number,
  playerId: number,
  holeNumber: number,
  score: number | null,
  handicapStrokes: number,
  netScore: number | null
): Promise<BestBallPlayerScore> => {
  const result = await pool.query(
    `INSERT INTO best_ball_player_scores 
      (match_id, player_id, hole_number, score, handicap_strokes, net_score)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (match_id, player_id, hole_number)
    DO UPDATE SET
      score = $4,
      handicap_strokes = $5,
      net_score = $6,
      updated_at = NOW()
    RETURNING *`,
    [matchId, playerId, holeNumber, score, handicapStrokes, netScore]
  );
  return result.rows[0];
};

export const updateBestBallMatchScores = async (matchId: number): Promise<void> => {
  await pool.query(
    `UPDATE best_ball_matches
    SET 
      team1_score = (
        SELECT COALESCE(SUM(min_score), 0)
        FROM (
          SELECT MIN(score) as min_score
          FROM best_ball_player_scores bbps
          JOIN players p ON p.id = bbps.player_id
          WHERE bbps.match_id = $1 AND p.team_id = 1
          GROUP BY hole_number
        ) subq
      ),
      team2_score = (
        SELECT COALESCE(SUM(min_score), 0)
        FROM (
          SELECT MIN(score) as min_score
          FROM best_ball_player_scores bbps
          JOIN players p ON p.id = bbps.player_id
          WHERE bbps.match_id = $1 AND p.team_id = 2
          GROUP BY hole_number
        ) subq
      ),
      updated_at = NOW()
    WHERE id = $1`,
    [matchId]
  );
};

export const createBestBallMatch = async (
  roundId: number,
  team1Id: number,
  team2Id: number
): Promise<BestBallMatch> => {
  const result = await pool.query(
    `INSERT INTO best_ball_matches 
      (round_id, team1_id, team2_id, status)
    VALUES ($1, $2, $3, 'pending')
    RETURNING *`,
    [roundId, team1Id, team2Id]
  );
  return result.rows[0];
};

export const getBestBallMatchesByRound = async (roundId: number): Promise<BestBallMatch[]> => {
  const result = await pool.query(
    `SELECT 
      bbm.*,
      t1.name as team1_name,
      t2.name as team2_name
    FROM best_ball_matches bbm
    JOIN teams t1 ON t1.id = bbm.team1_id
    JOIN teams t2 ON t2.id = bbm.team2_id
    WHERE bbm.round_id = $1
    ORDER BY bbm.created_at DESC`,
    [roundId]
  );
  return result.rows;
};

export const updateBestBallMatchStatus = async (
  matchId: number,
  status: 'pending' | 'in_progress' | 'completed'
): Promise<BestBallMatch> => {
  const result = await pool.query(
    `UPDATE best_ball_matches
    SET status = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING *`,
    [matchId, status]
  );
  return result.rows[0];
}; 