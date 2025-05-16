import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'react-hot-toast';
import { Button } from './ui/button';
import { Player, Hole, BestBallPlayerScore, MatchParticipant } from '../types';

interface BestBallScorecardProps {
  matchId: number;
  roundId: number;
  holes: Hole[];
  participants: MatchParticipant[];
  allPlayers: Player[];
  isAdmin: boolean;
}

const BestBallScorecard: React.FC<BestBallScorecardProps> = ({
  matchId,
  roundId,
  holes,
  participants,
  allPlayers,
  isAdmin
}) => {
  const queryClient = useQueryClient();
  const [playerScores, setPlayerScores] = useState<Map<string, BestBallPlayerScore[]>>(new Map());
  const [handicapStrokes, setHandicapStrokes] = useState<Map<string, number>>(new Map());

  // Fetch player handicaps
  const { data: playerHandicaps = [] } = useQuery({
    queryKey: [`/api/round-handicaps/${roundId}`],
    enabled: !!roundId
  });

  // Fetch existing scores
  const { data: existingScores = [] } = useQuery({
    queryKey: [`/api/best-ball-scores/${matchId}`],
    enabled: !!matchId
  });

  // Mutation for saving scores
  const saveScoreMutation = useMutation({
    mutationFn: async (score: {
      matchId: number;
      playerId: number;
      holeNumber: number;
      score: number | null;
      handicapStrokes: number;
      netScore: number | null;
    }) => {
      const { data, error } = await supabase
        .from('best_ball_player_scores')
        .upsert({
          match_id: score.matchId,
          player_id: score.playerId,
          hole_number: score.holeNumber,
          score: score.score,
          handicap_strokes: score.handicapStrokes,
          net_score: score.netScore
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/best-ball-scores/${matchId}`] });
    }
  });

  // Calculate handicap strokes for a player on a specific hole
  const calculateHandicapStrokes = (playerId: number, holeNumber: number): number => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player?.handicapIndex) return 0;

    const hole = holes.find(h => h.number === holeNumber);
    if (!hole?.handicapRank) return 0;

    const courseHandicap = Math.round(player.handicapIndex * 1.15); // Example slope rating
    let strokes = 0;

    if (courseHandicap >= hole.handicapRank) {
      strokes = 1;
      if (hole.handicapRank === 1 && courseHandicap >= 19) {
        strokes = 2;
      }
    }

    return strokes;
  };

  // Load existing scores
  useEffect(() => {
    if (!existingScores.length) return;

    const newScores = new Map<string, BestBallPlayerScore[]>();
    existingScores.forEach((score: any) => {
      const key = `${score.hole_number}-${score.player_id}`;
      const player = allPlayers.find(p => p.id === score.player_id);
      if (!player) return;

      newScores.set(key, [{
        player: player.name,
        score: score.score,
        teamId: player.teamId === 1 ? 'aviator' : 'producer',
        playerId: score.player_id,
        handicapStrokes: score.handicap_strokes,
        netScore: score.net_score
      }]);
    });

    setPlayerScores(newScores);
  }, [existingScores, allPlayers]);

  // Handle score change
  const handleScoreChange = async (
    holeNumber: number,
    playerId: number,
    value: string
  ) => {
    const player = allPlayers.find(p => p.id === playerId);
    if (!player) return;

    let numValue: number | null = null;
    if (value !== '') {
      const parsed = parseInt(value);
      if (!isNaN(parsed)) {
        numValue = parsed;
      }
    }

    const strokes = calculateHandicapStrokes(playerId, holeNumber);
    const netScore = numValue !== null ? numValue - strokes : null;

    try {
      await saveScoreMutation.mutateAsync({
        matchId,
        playerId,
        holeNumber,
        score: numValue,
        handicapStrokes: strokes,
        netScore
      });

      // Update local state
      const key = `${holeNumber}-${playerId}`;
      const newScores = new Map(playerScores);
      newScores.set(key, [{
        player: player.name,
        score: numValue,
        teamId: player.teamId === 1 ? 'aviator' : 'producer',
        playerId,
        handicapStrokes: strokes,
        netScore
      }]);
      setPlayerScores(newScores);

      toast.success('Score saved successfully');
    } catch (error) {
      console.error('Error saving score:', error);
      toast.error('Failed to save score');
    }
  };

  // Calculate team scores
  const teamScores = useMemo(() => {
    const scores = new Map<string, number>();
    const aviatorScores = new Map<number, number>();
    const producerScores = new Map<number, number>();

    // Calculate best scores for each team on each hole
    holes.forEach(hole => {
      let aviatorBest = Infinity;
      let producerBest = Infinity;

      Array.from(playerScores.entries()).forEach(([key, scores]) => {
        const [holeNum, playerId] = key.split('-');
        if (parseInt(holeNum) !== hole.number) return;

        const player = allPlayers.find(p => p.id === parseInt(playerId));
        if (!player) return;

        const score = scores[0]?.score;
        if (score === null || score === undefined) return;

        if (player.teamId === 1) {
          aviatorBest = Math.min(aviatorBest, score);
        } else {
          producerBest = Math.min(producerBest, score);
        }
      });

      if (aviatorBest !== Infinity) aviatorScores.set(hole.number, aviatorBest);
      if (producerBest !== Infinity) producerScores.set(hole.number, producerBest);
    });

    // Calculate totals
    let aviatorTotal = 0;
    let producerTotal = 0;

    aviatorScores.forEach(score => aviatorTotal += score);
    producerScores.forEach(score => producerTotal += score);

    scores.set('aviator', aviatorTotal);
    scores.set('producer', producerTotal);

    return scores;
  }, [playerScores, holes, allPlayers]);

  // Render the scorecard
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm scorecard-table">
        <thead>
          <tr className="bg-gray-100">
            <th className="py-2 px-2 text-left font-semibold sticky-column">Hole</th>
            {holes.map(hole => (
              <th key={hole.number} className="py-2 px-2 text-center font-semibold">
                {hole.number}
              </th>
            ))}
            <th className="py-2 px-2 text-center font-semibold bg-gray-200">Total</th>
          </tr>
          <tr className="bg-gray-50">
            <th className="py-2 px-2 text-left font-semibold sticky-column">Par</th>
            {holes.map(hole => (
              <td key={hole.number} className="py-2 px-2 text-center">
                {hole.par}
                {hole.handicapRank && (
                  <span className="ml-1 text-xs text-blue-600">
                    ({hole.handicapRank})
                  </span>
                )}
              </td>
            ))}
            <td className="py-2 px-2 text-center font-semibold bg-gray-100">
              {holes.reduce((sum, hole) => sum + hole.par, 0)}
            </td>
          </tr>
        </thead>
        <tbody>
          {/* Aviator Players */}
          {participants
            .filter(p => p.team === 'aviator')
            .map(participant => {
              const player = allPlayers.find(p => p.id === participant.playerId);
              if (!player) return null;

              return (
                <tr key={player.id} className="border-b border-gray-200">
                  <td className="py-2 px-2 sticky-column bg-white border-l-4 border-aviator">
                    <div className="flex justify-between items-center">
                      <div className="text-xs font-medium text-black leading-tight">
                        <div className="font-semibold">{player.name}</div>
                        <div className="text-blue-600">
                          HCP: {player.handicapIndex || 0}
                        </div>
                      </div>
                    </div>
                  </td>
                  {holes.map(hole => {
                    const key = `${hole.number}-${player.id}`;
                    const scores = playerScores.get(key);
                    const score = scores?.[0]?.score;
                    const strokes = scores?.[0]?.handicapStrokes || 0;

                    return (
                      <td key={hole.number} className="py-2 px-2 text-center">
                        <div className="relative">
                          {strokes > 0 && (
                            <div className="handicap-strokes">
                              {Array.from({ length: strokes }).map((_, i) => (
                                <div key={i} className="handicap-indicator" />
                              ))}
                            </div>
                          )}
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className={`score-input w-8 h-8 text-center border border-gray-300 rounded
                              ${strokes > 0 ? 'handicap-stroke' : ''}`}
                            value={score?.toString() || ''}
                            onChange={(e) => handleScoreChange(hole.number, player.id, e.target.value)}
                            min="1"
                            max="12"
                            disabled={!isAdmin}
                          />
                          {score !== null && strokes > 0 && (
                            <span className="net-score">
                              ({score - strokes})
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                    {Array.from(playerScores.entries())
                      .filter(([key]) => key.endsWith(`-${player.id}`))
                      .reduce((sum, [_, scores]) => sum + (scores[0]?.score || 0), 0)}
                  </td>
                </tr>
              );
            })}

          {/* Aviator Team Total */}
          <tr className="border-b border-gray-200">
            <td className="py-2 px-2 font-semibold sticky-column bg-aviator text-white">
              Aviators
            </td>
            {holes.map(hole => {
              const aviatorScores = Array.from(playerScores.entries())
                .filter(([key, scores]) => {
                  const [holeNum, playerId] = key.split('-');
                  const player = allPlayers.find(p => p.id === parseInt(playerId));
                  return parseInt(holeNum) === hole.number && player?.teamId === 1;
                })
                .map(([_, scores]) => scores[0]?.score)
                .filter((score): score is number => score !== null && score !== undefined);

              const bestScore = aviatorScores.length > 0 ? Math.min(...aviatorScores) : null;

              return (
                <td key={hole.number} className="py-2 px-2 text-center">
                  <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded
                    ${bestScore ? 'bg-aviator text-white' : 'bg-white text-black'}`}>
                    {bestScore || ''}
                  </div>
                </td>
              );
            })}
            <td className="py-2 px-2 text-center font-semibold bg-gray-200 text-aviator">
              {teamScores.get('aviator') || ''}
            </td>
          </tr>

          {/* Producer Players */}
          {participants
            .filter(p => p.team === 'producer')
            .map(participant => {
              const player = allPlayers.find(p => p.id === participant.playerId);
              if (!player) return null;

              return (
                <tr key={player.id} className="border-b border-gray-200">
                  <td className="py-2 px-2 sticky-column bg-white border-l-4 border-producer">
                    <div className="flex justify-between items-center">
                      <div className="text-xs font-medium text-black leading-tight">
                        <div className="font-semibold">{player.name}</div>
                        <div className="text-blue-600">
                          HCP: {player.handicapIndex || 0}
                        </div>
                      </div>
                    </div>
                  </td>
                  {holes.map(hole => {
                    const key = `${hole.number}-${player.id}`;
                    const scores = playerScores.get(key);
                    const score = scores?.[0]?.score;
                    const strokes = scores?.[0]?.handicapStrokes || 0;

                    return (
                      <td key={hole.number} className="py-2 px-2 text-center">
                        <div className="relative">
                          {strokes > 0 && (
                            <div className="handicap-strokes">
                              {Array.from({ length: strokes }).map((_, i) => (
                                <div key={i} className="handicap-indicator" />
                              ))}
                            </div>
                          )}
                          <input
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className={`score-input w-8 h-8 text-center border border-gray-300 rounded
                              ${strokes > 0 ? 'handicap-stroke' : ''}`}
                            value={score?.toString() || ''}
                            onChange={(e) => handleScoreChange(hole.number, player.id, e.target.value)}
                            min="1"
                            max="12"
                            disabled={!isAdmin}
                          />
                          {score !== null && strokes > 0 && (
                            <span className="net-score">
                              ({score - strokes})
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                    {Array.from(playerScores.entries())
                      .filter(([key]) => key.endsWith(`-${player.id}`))
                      .reduce((sum, [_, scores]) => sum + (scores[0]?.score || 0), 0)}
                  </td>
                </tr>
              );
            })}

          {/* Producer Team Total */}
          <tr className="border-b border-gray-200">
            <td className="py-2 px-2 font-semibold sticky-column bg-producer text-white">
              Producers
            </td>
            {holes.map(hole => {
              const producerScores = Array.from(playerScores.entries())
                .filter(([key, scores]) => {
                  const [holeNum, playerId] = key.split('-');
                  const player = allPlayers.find(p => p.id === parseInt(playerId));
                  return parseInt(holeNum) === hole.number && player?.teamId === 2;
                })
                .map(([_, scores]) => scores[0]?.score)
                .filter((score): score is number => score !== null && score !== undefined);

              const bestScore = producerScores.length > 0 ? Math.min(...producerScores) : null;

              return (
                <td key={hole.number} className="py-2 px-2 text-center">
                  <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded
                    ${bestScore ? 'bg-producer text-white' : 'bg-white text-black'}`}>
                    {bestScore || ''}
                  </div>
                </td>
              );
            })}
            <td className="py-2 px-2 text-center font-semibold bg-gray-200 text-producer">
              {teamScores.get('producer') || ''}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default BestBallScorecard;