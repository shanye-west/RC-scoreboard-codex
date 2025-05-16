import { Router } from 'express';
import { supabase } from '../lib/supabaseClient';
import { authenticateUser } from '../middleware/auth';

const router = Router();

// Get best ball scores for a match
router.get('/best-ball-scores/:matchId', async (req, res) => {
  try {
    const { matchId } = req.params;

    const { data, error } = await supabase
      .from('best_ball_player_scores')
      .select('*')
      .eq('match_id', matchId);

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error fetching best ball scores:', error);
    res.status(500).json({ error: 'Failed to fetch best ball scores' });
  }
});

// Save a best ball score
router.post('/best-ball-scores', authenticateUser, async (req, res) => {
  try {
    const { matchId, playerId, holeNumber, score, handicapStrokes, netScore } = req.body;

    // Check if user is admin
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', req.user.id)
      .single();

    if (userRole?.role !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .from('best_ball_player_scores')
      .upsert({
        match_id: matchId,
        player_id: playerId,
        hole_number: holeNumber,
        score,
        handicap_strokes: handicapStrokes,
        net_score: netScore
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (error) {
    console.error('Error saving best ball score:', error);
    res.status(500).json({ error: 'Failed to save best ball score' });
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