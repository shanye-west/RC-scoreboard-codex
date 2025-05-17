import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import "./BestBallScorecard.css";

// Player score interface for Best Ball
interface BestBallPlayerScore {
  player: string;
  score: number | null;
  teamId: string;
  playerId: number;
  handicapStrokes: number;
  netScore: number | null;
}

// Simple interface for the component props
interface BestBallScorecardProps {
  matchId: number;
  holes: any[];
  aviatorPlayersList: any[];
  producerPlayersList: any[];
  participants: any[];
  allPlayers: any[];
  matchData: any;
  roundHandicapData: any[];
  onScoreUpdate?: (scores: any) => void;
  isMobile?: boolean;
}

/**
 * BestBallScorecard Component
 * 
 * Specialized scorecard for 2-man Team Best Ball format
 * - Shows individual player scores alongside team scores
 * - Calculates net scores based on handicaps
 * - Highlights the better score (used for team total)
 */
const BestBallScorecard: React.FC<BestBallScorecardProps> = ({
  matchId,
  holes = [],
  aviatorPlayersList = [],
  producerPlayersList = [],
  participants = [],
  allPlayers = [],
  matchData,
  roundHandicapData = [],
  onScoreUpdate,
  isMobile = false
}) => {
  const { user, isAdmin } = useAuth();
  const [playerScores, setPlayerScores] = useState<Map<string, BestBallPlayerScore[]>>(new Map());
  const [locked, setLocked] = useState(matchData?.status === "completed");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Determine if the current user can edit scores (admin or participant)
  const canEditScores = useMemo(() => {
    if (isAdmin) return true;
    if (!user) return false;
    
    // Find all player IDs linked to this user
    const userPlayerIds = allPlayers
      .filter((p: any) => p?.userId === user.id)
      .map((p: any) => p?.id)
      .filter(Boolean);
    
    // Check if any of the user's players are participants in this match
    return participants.some((p: any) => 
      userPlayerIds.includes(p?.playerId)
    );
  }, [isAdmin, user, allPlayers, participants]);

  // Split holes into front and back nine
  const frontNine = holes
    .filter((hole: any) => hole && hole.number <= 9)
    .sort((a: any, b: any) => a.number - b.number);
  
  const backNine = holes
    .filter((hole: any) => hole && hole.number > 9)
    .sort((a: any, b: any) => a.number - b.number);

  // Fetch player scores from the server
  const { data: savedScores = [], isLoading } = useQuery({
    queryKey: ['/api/player-scores', matchId],
    retry: false,
    enabled: !!matchId,
  });

  // Mutation to save player scores
  const saveMutation = useMutation({
    mutationFn: async (score: any) => {
      return await apiRequest(
        score.id ? 'PUT' : 'POST',
        `/api/player-scores${score.id ? `/${score.id}` : ''}`,
        score
      ).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/player-scores'] });
      queryClient.invalidateQueries({ queryKey: ['/api/matches', matchId] });
    },
  });

  // Initialize or update the score map when player scores change
  useEffect(() => {
    if (!Array.isArray(savedScores) || savedScores.length === 0) return;
    if (!Array.isArray(participants)) return;
    if (!Array.isArray(allPlayers)) return;
    if (!Array.isArray(holes)) return;
    
    const scoreMap = new Map<string, BestBallPlayerScore[]>();
    
    savedScores.forEach((score: any) => {
      if (!score) return;
      
      // Find the player info
      const participant = participants.find((p: any) => p?.playerId === score.playerId);
      const player = allPlayers.find((p: any) => p?.id === score.playerId);
      
      if (!player || !participant) return;
      
      // Get player handicap
      const courseHandicap = getPlayerCourseHandicap(player.id);
      
      // Get the hole info for handicap strokes
      const hole = holes.find((h: any) => h?.number === score.holeNumber);
      const handicapStrokes = hole && courseHandicap >= (hole.handicapIndex || 0) ? 1 : 0;
      
      // Calculate net score
      const netScore = score.score !== null && score.score !== undefined 
        ? score.score - handicapStrokes
        : null;
      
      // Create key in format "holeNumber-playerName"
      const key = `${score.holeNumber}-${player.name}`;
      
      // Create or get the array for this key
      const scores = scoreMap.get(key) || [];
      
      // Add this score
      scores.push({
        player: player.name,
        score: score.score,
        teamId: participant.team,
        playerId: player.id,
        handicapStrokes: handicapStrokes,
        netScore: netScore
      });
      
      // Update the map
      scoreMap.set(key, scores);
    });
    
    setPlayerScores(scoreMap);
  }, [savedScores, participants, allPlayers, holes]);

  // Handler for score input change
  const handleScoreChange = async (
    holeNumber: number,
    playerId: number,
    newScore: number | null
  ) => {
    if (locked || !canEditScores) return;
    if (!Array.isArray(savedScores)) return;
    
    // Find existing score in the saved scores
    const existingScore = savedScores.find(
      (s: any) => s?.playerId === playerId && s?.holeNumber === holeNumber
    );
    
    // Create new score object for the API
    const scoreData = {
      id: existingScore?.id,
      matchId,
      playerId,
      holeNumber,
      score: newScore
    };
    
    // Save to the server
    setIsSubmitting(true);
    try {
      await saveMutation.mutateAsync(scoreData);
    } catch (error) {
      console.error("Error saving score:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper to get player's course handicap
  const getPlayerCourseHandicap = (playerId: number): number => {
    if (!Array.isArray(roundHandicapData)) return 0;
    if (!Array.isArray(allPlayers)) return 0;
    
    // Find from the round handicap data
    const handicapData = roundHandicapData.find((h: any) => h?.playerId === playerId);
    if (handicapData) return handicapData.courseHandicap || 0;
    
    // Use default from player data if not in round data
    const player = allPlayers.find((p: any) => p?.id === playerId);
    return player?.handicap || 0;
  };

  // Calculate scores for each team and format for display
  const calculateTeamScores = () => {
    if (!Array.isArray(aviatorPlayersList) || !Array.isArray(producerPlayersList) || 
        !Array.isArray(frontNine) || !Array.isArray(backNine)) {
      // Return default empty values if required arrays are not populated
      return {
        aviatorFrontTotals: {
          teamGrossTotal: 0, teamNetTotal: 0,
          frontGrossTotal: 0, frontNetTotal: 0,
          backGrossTotal: 0, backNetTotal: 0,
          playerTotals: []
        },
        producerFrontTotals: {
          teamGrossTotal: 0, teamNetTotal: 0,
          frontGrossTotal: 0, frontNetTotal: 0,
          backGrossTotal: 0, backNetTotal: 0,
          playerTotals: []
        }
      };
    }
    
    // Initialize totals 
    const aviatorFrontTotals = {
      teamGrossTotal: 0,
      teamNetTotal: 0,
      frontGrossTotal: 0,
      frontNetTotal: 0,
      backGrossTotal: 0,
      backNetTotal: 0,
      playerTotals: aviatorPlayersList.map(p => ({
        name: p?.name || '',
        id: p?.id || 0,
        frontGross: 0,
        frontNet: 0,
        backGross: 0,
        backNet: 0,
        totalGross: 0,
        totalNet: 0
      }))
    };
    
    const producerFrontTotals = {
      teamGrossTotal: 0,
      teamNetTotal: 0,
      frontGrossTotal: 0,
      frontNetTotal: 0,
      backGrossTotal: 0,
      backNetTotal: 0,
      playerTotals: producerPlayersList.map(p => ({
        name: p?.name || '',
        id: p?.id || 0,
        frontGross: 0,
        frontNet: 0,
        backGross: 0,
        backNet: 0,
        totalGross: 0,
        totalNet: 0
      }))
    };
    
    // Process front nine
    frontNine.forEach(hole => {
      if (!hole) return;
      
      // Process aviator players
      const aviatorHoleScores: { gross: number | null, net: number | null }[] = [];
      
      aviatorPlayersList.forEach(player => {
        if (!player?.name || !player?.id) return;
        
        const key = `${hole.number}-${player.name}`;
        const playerScoreData = playerScores.get(key)?.[0];
        
        // Update player total
        const playerTotal = aviatorFrontTotals.playerTotals.find(p => p.id === player.id);
        
        if (playerTotal && playerScoreData?.score !== null && playerScoreData?.score !== undefined) {
          playerTotal.frontGross += playerScoreData.score;
          playerTotal.totalGross += playerScoreData.score;
          
          if (playerScoreData.netScore !== null && playerScoreData.netScore !== undefined) {
            playerTotal.frontNet += playerScoreData.netScore;
            playerTotal.totalNet += playerScoreData.netScore;
          }
        }
        
        // Add to hole scores for team calculation
        if (playerScoreData) {
          aviatorHoleScores.push({
            gross: playerScoreData.score,
            net: playerScoreData.netScore
          });
        }
      });
      
      // Calculate best ball score for this hole
      const validGrossScores = aviatorHoleScores
        .filter(s => s.gross !== null && s.gross !== undefined)
        .map(s => s.gross !== null ? s.gross : 99);
      
      const validNetScores = aviatorHoleScores
        .filter(s => s.net !== null && s.net !== undefined)
        .map(s => s.net !== null ? s.net : 99);
      
      const bestGross = validGrossScores.length > 0 ? Math.min(...validGrossScores) : 0;
      const bestNet = validNetScores.length > 0 ? Math.min(...validNetScores) : 0;
      
      if (bestGross !== 0 && bestGross !== Infinity) {
        aviatorFrontTotals.frontGrossTotal += bestGross;
        aviatorFrontTotals.teamGrossTotal += bestGross;
      }
      
      if (bestNet !== 0 && bestNet !== Infinity) {
        aviatorFrontTotals.frontNetTotal += bestNet;
        aviatorFrontTotals.teamNetTotal += bestNet;
      }
      
      // Process producer players
      const producerHoleScores: { gross: number | null, net: number | null }[] = [];
      
      producerPlayersList.forEach(player => {
        if (!player?.name || !player?.id) return;
        
        const key = `${hole.number}-${player.name}`;
        const playerScoreData = playerScores.get(key)?.[0];
        
        // Update player total
        const playerTotal = producerFrontTotals.playerTotals.find(p => p.id === player.id);
        
        if (playerTotal && playerScoreData?.score !== null && playerScoreData?.score !== undefined) {
          playerTotal.frontGross += playerScoreData.score;
          playerTotal.totalGross += playerScoreData.score;
          
          if (playerScoreData.netScore !== null && playerScoreData.netScore !== undefined) {
            playerTotal.frontNet += playerScoreData.netScore;
            playerTotal.totalNet += playerScoreData.netScore;
          }
        }
        
        // Add to hole scores for team calculation
        if (playerScoreData) {
          producerHoleScores.push({
            gross: playerScoreData.score,
            net: playerScoreData.netScore
          });
        }
      });
      
      // Calculate best ball score for this hole
      const validProducerGrossScores = producerHoleScores
        .filter(s => s.gross !== null && s.gross !== undefined)
        .map(s => s.gross !== null ? s.gross : 99);
      
      const validProducerNetScores = producerHoleScores
        .filter(s => s.net !== null && s.net !== undefined)
        .map(s => s.net !== null ? s.net : 99);
      
      const bestProducerGross = validProducerGrossScores.length > 0 ? Math.min(...validProducerGrossScores) : 0;
      const bestProducerNet = validProducerNetScores.length > 0 ? Math.min(...validProducerNetScores) : 0;
      
      if (bestProducerGross !== 0 && bestProducerGross !== Infinity) {
        producerFrontTotals.frontGrossTotal += bestProducerGross;
        producerFrontTotals.teamGrossTotal += bestProducerGross;
      }
      
      if (bestProducerNet !== 0 && bestProducerNet !== Infinity) {
        producerFrontTotals.frontNetTotal += bestProducerNet;
        producerFrontTotals.teamNetTotal += bestProducerNet;
      }
    });
    
    // Process back nine (same logic as front nine)
    backNine.forEach(hole => {
      if (!hole) return;
      
      // Process aviator players
      const aviatorHoleScores: { gross: number | null, net: number | null }[] = [];
      
      aviatorPlayersList.forEach(player => {
        if (!player?.name || !player?.id) return;
        
        const key = `${hole.number}-${player.name}`;
        const playerScoreData = playerScores.get(key)?.[0];
        
        // Update player total
        const playerTotal = aviatorFrontTotals.playerTotals.find(p => p.id === player.id);
        
        if (playerTotal && playerScoreData?.score !== null && playerScoreData?.score !== undefined) {
          playerTotal.backGross += playerScoreData.score;
          playerTotal.totalGross += playerScoreData.score;
          
          if (playerScoreData.netScore !== null && playerScoreData.netScore !== undefined) {
            playerTotal.backNet += playerScoreData.netScore;
            playerTotal.totalNet += playerScoreData.netScore;
          }
        }
        
        // Add to hole scores for team calculation
        if (playerScoreData) {
          aviatorHoleScores.push({
            gross: playerScoreData.score,
            net: playerScoreData.netScore
          });
        }
      });
      
      // Calculate best ball score for this hole
      const validGrossScores = aviatorHoleScores
        .filter(s => s.gross !== null && s.gross !== undefined)
        .map(s => s.gross !== null ? s.gross : 99);
      
      const validNetScores = aviatorHoleScores
        .filter(s => s.net !== null && s.net !== undefined)
        .map(s => s.net !== null ? s.net : 99);
      
      const bestGross = validGrossScores.length > 0 ? Math.min(...validGrossScores) : 0;
      const bestNet = validNetScores.length > 0 ? Math.min(...validNetScores) : 0;
      
      if (bestGross !== 0 && bestGross !== Infinity) {
        aviatorFrontTotals.backGrossTotal += bestGross;
        aviatorFrontTotals.teamGrossTotal += bestGross;
      }
      
      if (bestNet !== 0 && bestNet !== Infinity) {
        aviatorFrontTotals.backNetTotal += bestNet;
        aviatorFrontTotals.teamNetTotal += bestNet;
      }
      
      // Process producer players
      const producerHoleScores: { gross: number | null, net: number | null }[] = [];
      
      producerPlayersList.forEach(player => {
        if (!player?.name || !player?.id) return;
        
        const key = `${hole.number}-${player.name}`;
        const playerScoreData = playerScores.get(key)?.[0];
        
        // Update player total
        const playerTotal = producerFrontTotals.playerTotals.find(p => p.id === player.id);
        
        if (playerTotal && playerScoreData?.score !== null && playerScoreData?.score !== undefined) {
          playerTotal.backGross += playerScoreData.score;
          playerTotal.totalGross += playerScoreData.score;
          
          if (playerScoreData.netScore !== null && playerScoreData.netScore !== undefined) {
            playerTotal.backNet += playerScoreData.netScore;
            playerTotal.totalNet += playerScoreData.netScore;
          }
        }
        
        // Add to hole scores for team calculation
        if (playerScoreData) {
          producerHoleScores.push({
            gross: playerScoreData.score,
            net: playerScoreData.netScore
          });
        }
      });
      
      // Calculate best ball score for this hole
      const validProducerGrossScores = producerHoleScores
        .filter(s => s.gross !== null && s.gross !== undefined)
        .map(s => s.gross !== null ? s.gross : 99);
      
      const validProducerNetScores = producerHoleScores
        .filter(s => s.net !== null && s.net !== undefined)
        .map(s => s.net !== null ? s.net : 99);
      
      const bestProducerGross = validProducerGrossScores.length > 0 ? Math.min(...validProducerGrossScores) : 0;
      const bestProducerNet = validProducerNetScores.length > 0 ? Math.min(...validProducerNetScores) : 0;
      
      if (bestProducerGross !== 0 && bestProducerGross !== Infinity) {
        producerFrontTotals.backGrossTotal += bestProducerGross;
        producerFrontTotals.teamGrossTotal += bestProducerGross;
      }
      
      if (bestProducerNet !== 0 && bestProducerNet !== Infinity) {
        producerFrontTotals.backNetTotal += bestProducerNet;
        producerFrontTotals.teamNetTotal += bestProducerNet;
      }
    });
    
    return { aviatorFrontTotals, producerFrontTotals };
  };

  // Calculate and memoize team scores
  const { aviatorFrontTotals, producerFrontTotals } = useMemo(
    calculateTeamScores,
    [playerScores, aviatorPlayersList, producerPlayersList, frontNine, backNine]
  );

  // Check if a score is the best net score for its team
  const isBestNetScore = (
    holeNumber: number,
    playerId: number,
    netScore: number | null
  ): boolean => {
    if (netScore === null || netScore === undefined) return false;
    if (!Array.isArray(participants)) return false;
    
    // Find the participant to determine the team
    const participant = participants.find((p: any) => p?.playerId === playerId);
    if (!participant) return false;
    
    // Get the player list for this team
    const teamPlayers = participant.team === "aviators" 
      ? aviatorPlayersList || []
      : producerPlayersList || [];
    
    if (!teamPlayers.length) return false;
    
    // Check all player scores for this hole and find the best net score
    const teamScores: (number | null)[] = teamPlayers.map(player => {
      if (!player?.name) return null;
      const key = `${holeNumber}-${player.name}`;
      return playerScores.get(key)?.[0]?.netScore || null;
    }).filter(score => score !== null && score !== undefined);
    
    // If there are no scores or this is the only score, it's the best
    if (teamScores.length === 0) return true;
    
    // Check if this score is the lowest
    const minScore = Math.min(...teamScores.map(s => s !== null ? s : 99));
    return netScore === minScore;
  };

  // Show loading skeleton when data is loading
  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  
  // Return the scorecard UI
  return (
    <div className="best-ball-scorecard-container">
      {/* Match status handled by parent Match component, no need to duplicate */}
      
      <div className={`scorecard-grid ${isMobile ? 'mobile' : ''}`}>
        {/* Desktop version shows all 18 holes */}
        {!isMobile && (
          <>
            {/* Header row */}
            <div className="player-header">Hole</div>
            <div className="handicap-header">HC</div>
            {frontNine.map((hole) => (
              <div key={`header-${hole.number}`} className="hole-number">
                {hole.number}
              </div>
            ))}
            <div className="total-header">Out</div>
            {backNine.map((hole) => (
              <div key={`header-${hole.number}`} className="hole-number">
                {hole.number}
              </div>
            ))}
            <div className="total-header">In</div>
            <div className="total-header">Tot</div>
            
            {/* Par row */}
            <div className="par-label">Par</div>
            <div className="empty"></div>
            {frontNine.map((hole) => (
              <div key={`par-${hole.number}`} className="par-value">
                {hole.par}
              </div>
            ))}
            <div className="par-total">
              {frontNine.reduce((acc, hole) => acc + (hole?.par || 0), 0)}
            </div>
            {backNine.map((hole) => (
              <div key={`par-${hole.number}`} className="par-value">
                {hole.par}
              </div>
            ))}
            <div className="par-total">
              {backNine.reduce((acc, hole) => acc + (hole?.par || 0), 0)}
            </div>
            <div className="par-total">
              {holes.reduce((acc, hole) => acc + (hole?.par || 0), 0)}
            </div>
            
            {/* Handicap row */}
            <div className="handicap-label">Handicap</div>
            <div className="empty"></div>
            {frontNine.map((hole) => (
              <div key={`handicap-${hole.number}`} className="handicap-value">
                {hole.handicapIndex}
              </div>
            ))}
            <div className="empty"></div>
            {backNine.map((hole) => (
              <div key={`handicap-${hole.number}`} className="handicap-value">
                {hole.handicapIndex}
              </div>
            ))}
            <div className="empty"></div>
            <div className="empty"></div>
            
            {/* Team headers */}
            <div className="team-header aviators">The Aviators</div>
            <div className="empty"></div>
            {frontNine.map((hole) => (
              <div key={`aviator-team-${hole.number}`} className="empty"></div>
            ))}
            <div className="team-total">{aviatorFrontTotals.frontNetTotal || 0}</div>
            {backNine.map((hole) => (
              <div key={`aviator-team-${hole.number}`} className="empty"></div>
            ))}
            <div className="team-total">{aviatorFrontTotals.backNetTotal || 0}</div>
            <div className="team-total">{aviatorFrontTotals.teamNetTotal || 0}</div>
            
            {/* Aviator Players */}
            {aviatorPlayersList.map((player) => {
              if (!player?.id) return null;
              return (
                <React.Fragment key={`aviator-player-${player.id}`}>
                  <div className="player-name aviator">{player.name || ''}</div>
                  <div className="player-handicap">
                    {getPlayerCourseHandicap(player.id)}
                  </div>
                  {frontNine.map((hole) => {
                    if (!hole?.number) return null;
                    const playerKey = `${hole.number}-${player.name || ''}`;
                    const scoreData = playerScores.get(playerKey)?.[0];
                    const isBest = scoreData?.netScore !== null && scoreData?.netScore !== undefined && 
                      isBestNetScore(hole.number, player.id, scoreData?.netScore);
                    
                    return (
                      <div 
                        key={`front-${hole.number}-${player.id}`} 
                        className={`score-input-cell ${isBest ? 'best-score' : ''}`}
                      >
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={scoreData?.score !== null && scoreData?.score !== undefined ? scoreData.score : ''}
                          disabled={locked || !canEditScores || isSubmitting}
                          onChange={(e) => {
                            const newValue = e.target.value.trim() !== '' 
                              ? parseInt(e.target.value, 10) 
                              : null;
                            handleScoreChange(hole.number, player.id, newValue);
                          }}
                          onBlur={(e) => {
                            const newValue = e.target.value.trim() !== ''
                              ? parseInt(e.target.value, 10)
                              : null;
                            if (newValue !== null && (newValue < 1 || newValue > 20)) {
                              e.target.value = '';
                              handleScoreChange(hole.number, player.id, null);
                            }
                          }}
                        />
                        {scoreData?.handicapStrokes > 0 && (
                          <span className="handicap-dot">•</span>
                        )}
                        {scoreData?.netScore !== null && scoreData?.netScore !== undefined && (
                          <span className="net-score">{scoreData.netScore}</span>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Front nine total */}
                  <div className="player-total">
                    {aviatorFrontTotals.playerTotals.find(p => p.id === player.id)?.frontNet || '-'}
                  </div>
                  
                  {/* Back nine scores */}
                  {backNine.map((hole) => {
                    if (!hole?.number) return null;
                    const playerKey = `${hole.number}-${player.name || ''}`;
                    const scoreData = playerScores.get(playerKey)?.[0];
                    const isBest = scoreData?.netScore !== null && scoreData?.netScore !== undefined && 
                      isBestNetScore(hole.number, player.id, scoreData?.netScore);
                    
                    return (
                      <div 
                        key={`back-${hole.number}-${player.id}`} 
                        className={`score-input-cell ${isBest ? 'best-score' : ''}`}
                      >
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={scoreData?.score !== null && scoreData?.score !== undefined ? scoreData.score : ''}
                          disabled={locked || !canEditScores || isSubmitting}
                          onChange={(e) => {
                            const newValue = e.target.value.trim() !== '' 
                              ? parseInt(e.target.value, 10) 
                              : null;
                            handleScoreChange(hole.number, player.id, newValue);
                          }}
                          onBlur={(e) => {
                            const newValue = e.target.value.trim() !== ''
                              ? parseInt(e.target.value, 10)
                              : null;
                            if (newValue !== null && (newValue < 1 || newValue > 20)) {
                              e.target.value = '';
                              handleScoreChange(hole.number, player.id, null);
                            }
                          }}
                        />
                        {scoreData?.handicapStrokes > 0 && (
                          <span className="handicap-dot">•</span>
                        )}
                        {scoreData?.netScore !== null && scoreData?.netScore !== undefined && (
                          <span className="net-score">{scoreData.netScore}</span>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Back nine total */}
                  <div className="player-total">
                    {aviatorFrontTotals.playerTotals.find(p => p.id === player.id)?.backNet || '-'}
                  </div>
                  
                  {/* Overall total */}
                  <div className="player-total">
                    {aviatorFrontTotals.playerTotals.find(p => p.id === player.id)?.totalNet || '-'}
                  </div>
                </React.Fragment>
              );
            })}
            
            {/* Producer team header */}
            <div className="team-header producers">The Producers</div>
            <div className="empty"></div>
            {frontNine.map((hole) => (
              <div key={`producer-team-${hole.number}`} className="empty"></div>
            ))}
            <div className="team-total">{producerFrontTotals.frontNetTotal || 0}</div>
            {backNine.map((hole) => (
              <div key={`producer-team-${hole.number}`} className="empty"></div>
            ))}
            <div className="team-total">{producerFrontTotals.backNetTotal || 0}</div>
            <div className="team-total">{producerFrontTotals.teamNetTotal || 0}</div>
            
            {/* Producer Players */}
            {producerPlayersList.map((player) => {
              if (!player?.id) return null;
              return (
                <React.Fragment key={`producer-player-${player.id}`}>
                  <div className="player-name producer">{player.name || ''}</div>
                  <div className="player-handicap">
                    {getPlayerCourseHandicap(player.id)}
                  </div>
                  {frontNine.map((hole) => {
                    if (!hole?.number) return null;
                    const playerKey = `${hole.number}-${player.name || ''}`;
                    const scoreData = playerScores.get(playerKey)?.[0];
                    const isBest = scoreData?.netScore !== null && scoreData?.netScore !== undefined && 
                      isBestNetScore(hole.number, player.id, scoreData?.netScore);
                    
                    return (
                      <div 
                        key={`front-${hole.number}-${player.id}`} 
                        className={`score-input-cell ${isBest ? 'best-score' : ''}`}
                      >
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={scoreData?.score !== null && scoreData?.score !== undefined ? scoreData.score : ''}
                          disabled={locked || !canEditScores || isSubmitting}
                          onChange={(e) => {
                            const newValue = e.target.value.trim() !== '' 
                              ? parseInt(e.target.value, 10) 
                              : null;
                            handleScoreChange(hole.number, player.id, newValue);
                          }}
                          onBlur={(e) => {
                            const newValue = e.target.value.trim() !== ''
                              ? parseInt(e.target.value, 10)
                              : null;
                            if (newValue !== null && (newValue < 1 || newValue > 20)) {
                              e.target.value = '';
                              handleScoreChange(hole.number, player.id, null);
                            }
                          }}
                        />
                        {scoreData?.handicapStrokes > 0 && (
                          <span className="handicap-dot">•</span>
                        )}
                        {scoreData?.netScore !== null && scoreData?.netScore !== undefined && (
                          <span className="net-score">{scoreData.netScore}</span>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Front nine total */}
                  <div className="player-total">
                    {producerFrontTotals.playerTotals.find(p => p.id === player.id)?.frontNet || '-'}
                  </div>
                  
                  {/* Back nine scores */}
                  {backNine.map((hole) => {
                    if (!hole?.number) return null;
                    const playerKey = `${hole.number}-${player.name || ''}`;
                    const scoreData = playerScores.get(playerKey)?.[0];
                    const isBest = scoreData?.netScore !== null && scoreData?.netScore !== undefined && 
                      isBestNetScore(hole.number, player.id, scoreData?.netScore);
                    
                    return (
                      <div 
                        key={`back-${hole.number}-${player.id}`} 
                        className={`score-input-cell ${isBest ? 'best-score' : ''}`}
                      >
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={scoreData?.score !== null && scoreData?.score !== undefined ? scoreData.score : ''}
                          disabled={locked || !canEditScores || isSubmitting}
                          onChange={(e) => {
                            const newValue = e.target.value.trim() !== '' 
                              ? parseInt(e.target.value, 10) 
                              : null;
                            handleScoreChange(hole.number, player.id, newValue);
                          }}
                          onBlur={(e) => {
                            const newValue = e.target.value.trim() !== ''
                              ? parseInt(e.target.value, 10)
                              : null;
                            if (newValue !== null && (newValue < 1 || newValue > 20)) {
                              e.target.value = '';
                              handleScoreChange(hole.number, player.id, null);
                            }
                          }}
                        />
                        {scoreData?.handicapStrokes > 0 && (
                          <span className="handicap-dot">•</span>
                        )}
                        {scoreData?.netScore !== null && scoreData?.netScore !== undefined && (
                          <span className="net-score">{scoreData.netScore}</span>
                        )}
                      </div>
                    );
                  })}
                  
                  {/* Back nine total */}
                  <div className="player-total">
                    {producerFrontTotals.playerTotals.find(p => p.id === player.id)?.backNet || '-'}
                  </div>
                  
                  {/* Overall total */}
                  <div className="player-total">
                    {producerFrontTotals.playerTotals.find(p => p.id === player.id)?.totalNet || '-'}
                  </div>
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default BestBallScorecard;