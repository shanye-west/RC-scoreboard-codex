import { Router } from 'express';
import { authenticateUser } from '../middleware/auth';
import {
  getBestBallMatch,
  getBestBallScores,
  saveBestBallScore,
  updateBestBallMatchScores,
  createBestBallMatch,
  getBestBallMatchesByRound,
  updateBestBallMatchStatus
} from '../db/queries/bestBall';

const router = Router();

// Create a new best ball match
router.post('/matches', authenticateUser, async (req, res) => {
  try {
    const { roundId, team1Id, team2Id } = req.body;

    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const match = await createBestBallMatch(roundId, team1Id, team2Id);
    res.status(201).json(match);
  } catch (error) {
    console.error('Error creating best ball match:', error);
    res.status(500).json({ error: 'Failed to create match' });
  }
});

// Get all best ball matches for a round
router.get('/matches/round/:roundId', async (req, res) => {
  try {
    const roundId = parseInt(req.params.roundId);
    const matches = await getBestBallMatchesByRound(roundId);
    res.json(matches);
  } catch (error) {
    console.error('Error fetching best ball matches:', error);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// Update match status
router.patch('/matches/:matchId/status', authenticateUser, async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId);
    const { status } = req.body;

    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const match = await updateBestBallMatchStatus(matchId, status);
    res.json(match);
  } catch (error) {
    console.error('Error updating match status:', error);
    res.status(500).json({ error: 'Failed to update match status' });
  }
});

// Get best ball match details
router.get('/matches/:matchId', async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId);
    const match = await getBestBallMatch(matchId);
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    res.json(match);
  } catch (error) {
    console.error('Error fetching best ball match:', error);
    res.status(500).json({ error: 'Failed to fetch match details' });
  }
});

// Get best ball scores for a match
router.get('/best-ball-scores/:matchId', async (req, res) => {
  try {
    const matchId = parseInt(req.params.matchId);
    const scores = await getBestBallScores(matchId);
    res.json(scores);
  } catch (error) {
    console.error('Error fetching best ball scores:', error);
    res.status(500).json({ error: 'Failed to fetch scores' });
  }
});

// Save a best ball score
router.post('/best-ball-scores', authenticateUser, async (req, res) => {
  try {
    const { matchId, playerId, holeNumber, score, handicapStrokes, netScore } = req.body;

    // Check if user is admin
    if (!req.user?.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const savedScore = await saveBestBallScore(
      matchId,
      playerId,
      holeNumber,
      score,
      handicapStrokes,
      netScore
    );

    // Update match scores
    await updateBestBallMatchScores(matchId);

    res.json(savedScore);
  } catch (error) {
    console.error('Error saving best ball score:', error);
    res.status(500).json({ error: 'Failed to save score' });
  }
});

// Get player handicaps for a round
router.get('/round-handicaps/:roundId', async (req, res) => {
  try {
    const { roundId } = req.params;

    const { data, error } = await supabase
      .from('player_handicaps')
      .select('*')
      .eq('round_id', roundId);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching player handicaps:', error);
    res.status(500).json({ error: 'Failed to fetch player handicaps' });
  }
});

export default router; 