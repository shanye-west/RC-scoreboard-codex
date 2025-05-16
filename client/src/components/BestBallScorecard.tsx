import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { Player, Hole, BestBallPlayerScore } from '../types';

interface BestBallScorecardProps {
  matchId: number;
  roundId: number;
  holes: Hole[];
  participants: any[];
  allPlayers: Player[];
  isAdmin?: boolean;
}

interface TeamScore {
  player: string;
  playerId: number;
  score: number;
  handicapStrokes: number;
  netScore: number;
}

const BestBallScorecard: React.FC<BestBallScorecardProps> = ({
  matchId,
  roundId,
  holes,
  participants,
  allPlayers,
  isAdmin = false,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [playerScores, setPlayerScores] = useState<Map<string, TeamScore[]>>(new Map());
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Get aviator and producer players
  const aviatorPlayersList = useMemo(() => {
    if (!Array.isArray(participants)) return [];
    return participants
      .filter((p: { team: string }) => p.team === "aviator" || p.team === "aviators")
      .map((p: { playerId: number }) => {
        const playerDetails = allPlayers.find((player: Player) => player.id === p.playerId);
        return playerDetails || { id: p.playerId, name: `Player ${p.playerId}`, teamId: 1 };
      });
  }, [participants, allPlayers]);

  const producerPlayersList = useMemo(() => {
    if (!Array.isArray(participants)) return [];
    return participants
      .filter((p: { team: string }) => p.team === "producer" || p.team === "producers")
      .map((p: { playerId: number }) => {
        const playerDetails = allPlayers.find((player: Player) => player.id === p.playerId);
        return playerDetails || { id: p.playerId, name: `Player ${p.playerId}`, teamId: 2 };
      });
  }, [participants, allPlayers]);

  // Fetch individual scores
  const { data: individualScores, isLoading: isLoadingScores } = useQuery({
    queryKey: [`/api/best-ball-scores/${matchId}`],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('best_ball_player_scores')
        .select('*')
        .eq('matchId', matchId);

      if (error) throw error;
      return data;
    },
    enabled: !!matchId,
  });

  // Initialize scores when data is loaded
  useEffect(() => {
    if (isInitialized || !individualScores || !holes.length) return;

    const newPlayerScores = new Map<string, TeamScore[]>();
    
    individualScores.forEach((score: any) => {
      const player = [...aviatorPlayersList, ...producerPlayersList]
        .find((p: Player) => p.id === score.playerId);
      
      if (player) {
        const teamKey = `${score.holeNumber}-${player.teamId === 1 ? "aviator" : "producer"}`;
        const teamScores = newPlayerScores.get(teamKey) || [];
        
        teamScores.push({
          player: player.name,
          playerId: player.id,
          score: score.score,
          handicapStrokes: score.handicapStrokes || 0,
          netScore: score.score - (score.handicapStrokes || 0)
        });
        
        newPlayerScores.set(teamKey, teamScores);
      }
    });

    setPlayerScores(newPlayerScores);
    setIsInitialized(true);
  }, [individualScores, holes, aviatorPlayersList, producerPlayersList, isInitialized]);

  // Save score mutation
  const saveScoreMutation = useMutation({
    mutationFn: async (data: {
      matchId: number;
      holeNumber: number;
      playerId: number;
      score: number;
      handicapStrokes: number;
    }) => {
      const { error } = await supabase
        .from('best_ball_player_scores')
        .upsert({
          matchId: data.matchId,
          holeNumber: data.holeNumber,
          playerId: data.playerId,
          score: data.score,
          handicapStrokes: data.handicapStrokes,
          updatedAt: new Date().toISOString()
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/best-ball-scores/${matchId}`] });
    },
  });

  const handleScoreChange = async (
    holeNumber: number,
    playerId: number,
    score: number,
    handicapStrokes: number
  ) => {
    if (!isAdmin) return;

    setIsSaving(true);
    try {
      await saveScoreMutation.mutateAsync({
        matchId,
        holeNumber,
        playerId,
        score,
        handicapStrokes
      });
    } catch (error) {
      console.error('Error saving score:', error);
      toast.error('Failed to save score');
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate team totals
  const calculateTeamTotals = (teamId: number) => {
    let total = 0;
    let netTotal = 0;
    
    holes.forEach(hole => {
      const teamKey = `${hole.number}-${teamId === 1 ? "aviator" : "producer"}`;
      const scores = playerScores.get(teamKey) || [];
      
      if (scores.length > 0) {
        const bestScore = Math.min(...scores.map(s => s.score));
        const bestNetScore = Math.min(...scores.map(s => s.netScore));
        total += bestScore;
        netTotal += bestNetScore;
      }
    });
    
    return { total, netTotal };
  };

  const aviatorTotals = calculateTeamTotals(1);
  const producerTotals = calculateTeamTotals(2);

  if (isLoadingScores) {
    return <div>Loading scores...</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-200">
        <thead>
          <tr className="bg-gray-100">
            <th className="px-4 py-2 border">Hole</th>
            <th className="px-4 py-2 border">Par</th>
            <th className="px-4 py-2 border">Aviators</th>
            <th className="px-4 py-2 border">Producers</th>
          </tr>
        </thead>
        <tbody>
          {holes.map((hole) => {
            const aviatorKey = `${hole.number}-aviator`;
            const producerKey = `${hole.number}-producer`;
            const aviatorScores = playerScores.get(aviatorKey) || [];
            const producerScores = playerScores.get(producerKey) || [];

            return (
              <tr key={hole.number}>
                <td className="px-4 py-2 border text-center">{hole.number}</td>
                <td className="px-4 py-2 border text-center">{hole.par}</td>
                <td className="px-4 py-2 border">
                  {aviatorScores.map((score, index) => (
                    <div key={index} className="flex items-center justify-between mb-1">
                      <span>{score.player}:</span>
                      <input
                        type="number"
                        value={score.score}
                        onChange={(e) => handleScoreChange(
                          hole.number,
                          score.playerId,
                          parseInt(e.target.value) || 0,
                          score.handicapStrokes
                        )}
                        disabled={!isAdmin || isSaving}
                        className="w-16 px-2 py-1 border rounded"
                      />
                    </div>
                  ))}
                  <div className="text-sm text-gray-600">
                    Best: {Math.min(...aviatorScores.map(s => s.score), 99)}
                  </div>
                </td>
                <td className="px-4 py-2 border">
                  {producerScores.map((score, index) => (
                    <div key={index} className="flex items-center justify-between mb-1">
                      <span>{score.player}:</span>
                      <input
                        type="number"
                        value={score.score}
                        onChange={(e) => handleScoreChange(
                          hole.number,
                          score.playerId,
                          parseInt(e.target.value) || 0,
                          score.handicapStrokes
                        )}
                        disabled={!isAdmin || isSaving}
                        className="w-16 px-2 py-1 border rounded"
                      />
                    </div>
                  ))}
                  <div className="text-sm text-gray-600">
                    Best: {Math.min(...producerScores.map(s => s.score), 99)}
                  </div>
                </td>
              </tr>
            );
          })}
          <tr className="bg-gray-50 font-bold">
            <td colSpan={2} className="px-4 py-2 border text-right">Total:</td>
            <td className="px-4 py-2 border text-center">{aviatorTotals.total}</td>
            <td className="px-4 py-2 border text-center">{producerTotals.total}</td>
          </tr>
          <tr className="bg-gray-50 font-bold">
            <td colSpan={2} className="px-4 py-2 border text-right">Net Total:</td>
            <td className="px-4 py-2 border text-center">{aviatorTotals.netTotal}</td>
            <td className="px-4 py-2 border text-center">{producerTotals.netTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default BestBallScorecard;