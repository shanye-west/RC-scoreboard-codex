import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabaseClient';
import BestBallScorecard from './BestBallScorecard';
import { BestBallMatch, BestBallHole, BestBallPlayer } from '../types/bestBall';

interface BestBallMatchProps {
  matchId: number;
  isAdmin: boolean;
}

const BestBallMatch: React.FC<BestBallMatchProps> = ({ matchId, isAdmin }) => {
  // Fetch match details
  const { data: match } = useQuery<BestBallMatch>({
    queryKey: ['match', matchId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('best_ball_matches')
        .select('*')
        .eq('id', matchId)
        .single();

      if (error) throw error;
      return data;
    }
  });

  // Fetch holes
  const { data: holes = [] } = useQuery<BestBallHole[]>({
    queryKey: ['holes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('holes')
        .select('*')
        .order('number');

      if (error) throw error;
      return data;
    }
  });

  // Fetch players
  const { data: players = [] } = useQuery<BestBallPlayer[]>({
    queryKey: ['players'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('players')
        .select('*');

      if (error) throw error;
      return data;
    }
  });

  if (!match) {
    return <div>Loading match details...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-2xl font-bold mb-4">Best Ball Match</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-lg font-semibold text-aviator">Aviators</h3>
            <p className="text-3xl font-bold">{match.team1Score}</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-producer">Producers</h3>
            <p className="text-3xl font-bold">{match.team2Score}</p>
          </div>
        </div>
      </div>

      <BestBallScorecard
        matchId={matchId}
        roundId={match.roundId}
        holes={holes}
        players={players}
        isAdmin={isAdmin}
      />
    </div>
  );
};

export default BestBallMatch; 