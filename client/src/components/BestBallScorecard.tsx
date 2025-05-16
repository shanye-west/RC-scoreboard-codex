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
 * Best Ball Scorecard Component
 * 
 * This component displays a specialized scorecard for 2-man Team Best Ball matches
 * with full scoring functionality and handicap support
 */
export default function BestBallScorecard({
  matchId,
  holes = [],
  aviatorPlayersList = [],
  producerPlayersList = [],
  participants = [],
  allPlayers = [],
  matchData = {},
  roundHandicapData = [],
  onScoreUpdate,
  isMobile = false,
}: BestBallScorecardProps) {
  // State for scores, loading, and locking
  const [playerScores, setPlayerScores] = useState(new Map<string, BestBallPlayerScore[]>());
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  
  // Split holes into front nine and back nine for display
  const frontNine = useMemo(() => 
    holes.filter(h => h.number >= 1 && h.number <= 9).sort((a, b) => a.number - b.number), 
    [holes]
  );
  
  const backNine = useMemo(() => 
    holes.filter(h => h.number >= 10 && h.number <= 18).sort((a, b) => a.number - b.number), 
    [holes]
  );

  // Calculate par totals
  const frontNinePar = useMemo(() => 
    frontNine.reduce((sum, hole) => sum + hole.par, 0), 
    [frontNine]
  );
  
  const backNinePar = useMemo(() => 
    backNine.reduce((sum, hole) => sum + hole.par, 0), 
    [backNine]
  );
  
  const totalPar = useMemo(() => 
    frontNinePar + backNinePar, 
    [frontNinePar, backNinePar]
  );
  
  // Fetch player scores from API
  const { data: playerScoresData = [], isLoading: scoresLoading } = useQuery<any[]>({
    queryKey: [`/api/player-scores?matchId=${matchId}`],
    enabled: !!matchId,
  });
  
  // Fetch best ball scores
  const { data: bestBallScores = [], isLoading: bestBallLoading } = useQuery<any[]>({
    queryKey: [`/api/best-ball-scores/${matchId}`],
    enabled: !!matchId,
  });
  
  // Get authentication status
  const { isAdmin, user } = useAuth();
  
  // Check if current user is a participant
  const isParticipant = useMemo(() => {
    if (!user) return false;
    
    const participantPlayerIds = participants.map((p: any) => p.playerId) || [];
    const userPlayers = allPlayers.filter((player: any) => player.userId === user.id);
    const userPlayerIds = userPlayers.map((player: any) => player.id);
    
    return userPlayerIds.some(id => participantPlayerIds.includes(id));
  }, [user, participants, allPlayers]);
  
  // Determine if user can edit scores
  const canEditScores = isAdmin || isParticipant;
  
  // Calculate handicap strokes for a player on a specific hole
  const calculateHandicapStrokes = (playerHandicap: number, holeHandicapIndex: number) => {
    if (playerHandicap <= 0) return 0;
    
    // Players get strokes on the hardest holes up to their handicap
    return playerHandicap >= holeHandicapIndex ? 1 : 0;
  };
  
  // Get player's course handicap
  const getPlayerCourseHandicap = (playerId: number) => {
    const handicapData = roundHandicapData.find((data: any) => data.playerId === playerId);
    return handicapData?.courseHandicap || 0;
  };
  
  // Mutation for saving individual player scores
  const savePlayerScoreMutation = useMutation({
    mutationFn: async ({
      holeNumber,
      playerId,
      matchId,
      score,
    }: {
      holeNumber: number;
      playerId: number;
      matchId: number;
      score: number;
    }) => {
      const response = await apiRequest("POST", `/api/player-scores`, {
        holeNumber,
        playerId,
        matchId,
        score,
      });
      
      if (!response.ok) {
        throw new Error("Failed to save player score");
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/player-scores?matchId=${matchId}`] });
    },
  });
  
  // Mutation for saving best ball scores
  const saveBestBallScoreMutation = useMutation({
    mutationFn: async ({
      holeNumber,
      playerId,
      matchId,
      teamId,
      score,
      handicapStrokes,
      netScore
    }: {
      holeNumber: number;
      playerId: number;
      matchId: number;
      teamId: string;
      score: number | null;
      handicapStrokes: number;
      netScore: number | null;
    }) => {
      try {
        // Save to best_ball_player_scores table
        const bestBallResponse = await apiRequest("POST", `/api/best-ball-scores`, {
          holeNumber,
          playerId,
          matchId,
          teamId,
          score,
          handicapStrokes,
          netScore
        });
        
        if (!bestBallResponse.ok) {
          throw new Error("Failed to save best ball score");
        }
        
        return await bestBallResponse.json();
      } catch (error) {
        console.error("Error saving best ball score:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/best-ball-scores/${matchId}`] });
    },
  });
  
  // Mutation for updating match score
  const updateMatchScoreMutation = useMutation({
    mutationFn: async (scoreData: any) => {
      const response = await apiRequest("PUT", `/api/matches/${matchId}`, scoreData);
      
      if (!response.ok) {
        throw new Error("Failed to update match score");
      }
      
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/matches/${matchId}`] });
    },
  });
  
  // Check if hole should be greyed out (not in use)
  const isHoleGreyedOut = (holeNumber: number) => {
    // Grey out holes that are not in the course
    return !holes.some((h: any) => h.number === holeNumber);
  };
  
  // Initialize player scores map from data on first load
  useEffect(() => {
    if (!holes || holes.length === 0 || !aviatorPlayersList || !producerPlayersList) {
      setLoading(false);
      return;
    }
    
    // Create a new scores map
    const newScores = new Map<string, BestBallPlayerScore[]>();
    
    // Initialize with empty scores for all players and holes first
    holes.forEach((hole: any) => {
      const allPlayers = [...(aviatorPlayersList || []), ...(producerPlayersList || [])];
      
      allPlayers.forEach((player: any) => {
        if (!player || !player.name) return; // Skip if player data is incomplete
        
        const key = `${hole.number}-${player.name}`;
        const team = participants.find((p: any) => p.playerId === player.id)?.team;
        
        if (!newScores.has(key)) {
          newScores.set(key, []);
        }
        
        // Add the handicap strokes for this player/hole
        const playerHandicap = getPlayerCourseHandicap(player.id);
        const handicapStrokes = calculateHandicapStrokes(playerHandicap, hole?.handicapIndex || 18);
        
        newScores.get(key)?.push({
          player: player.name,
          score: null,
          teamId: team === "aviators" ? "1" : "2",
          playerId: player.id,
          handicapStrokes: handicapStrokes || 0,
          netScore: null
        });
      });
    });
    
    // Then overlay with existing scores if available
    if (playerScoresData?.length > 0) {
      playerScoresData.forEach((score: any) => {
        if (!score || !score.playerId || !score.holeNumber) return; // Skip invalid scores
        
        const player = allPlayers?.find((p: any) => p.id === score.playerId);
        if (player && player.name) {
          const key = `${score.holeNumber}-${player.name}`;
          
          if (newScores.has(key) && newScores.get(key)?.length > 0) {
            const playerScore = newScores.get(key)?.[0];
            if (playerScore) {
              const playerHandicap = getPlayerCourseHandicap(player.id);
              const hole = holes.find((h: any) => h.number === score.holeNumber);
              const handicapStrokes = calculateHandicapStrokes(playerHandicap, hole?.handicapIndex || 18);
              
              const netScore = score.score !== null 
                ? Math.max(1, score.score - handicapStrokes) 
                : null;
                
              // Update the existing score object
              playerScore.score = score.score;
              playerScore.handicapStrokes = handicapStrokes || 0;
              playerScore.netScore = netScore;
            }
          }
        }
      });
    }
    
    // Also overlay with individual best ball scores if available
    if (bestBallScores?.length > 0) {
      bestBallScores.forEach((score: any) => {
        if (!score || !score.playerId || !score.holeNumber) return; // Skip invalid scores
        
        const player = allPlayers?.find((p: any) => p.id === score.playerId);
        if (player && player.name) {
          const key = `${score.holeNumber}-${player.name}`;
          
          if (newScores.has(key) && newScores.get(key)?.length > 0) {
            const playerScore = newScores.get(key)?.[0];
            if (playerScore) {
              // Update the existing score object with best ball score data
              playerScore.score = score.score;
              playerScore.handicapStrokes = score.handicapStrokes || 0;
              playerScore.netScore = score.netScore;
            }
          }
        }
      });
    }
    
    setPlayerScores(newScores);
    setLoading(false);
  }, [playerScoresData, bestBallScores, holes, aviatorPlayersList, producerPlayersList, allPlayers, participants]);
  
  // Check if a player score is the lowest for their team on that hole
  const isLowestScore = (holeNumber: number, playerName: string, team: string) => {
    const teamPlayersList = team === "aviator" ? aviatorPlayersList : producerPlayersList;
    const teamPlayerNames = teamPlayersList.map((p: any) => p.name);
    
    let lowestNetScore = Infinity;
    let playerWithLowestScore = "";
    
    // Find the lowest net score for this team on this hole
    teamPlayerNames.forEach((name: string) => {
      const key = `${holeNumber}-${name}`;
      const playerScoreData = playerScores.get(key)?.[0];
      
      if (playerScoreData && playerScoreData.netScore !== null && playerScoreData.netScore < lowestNetScore) {
        lowestNetScore = playerScoreData.netScore;
        playerWithLowestScore = name;
      }
    });
    
    return playerName === playerWithLowestScore && lowestNetScore !== Infinity;
  };
  
  // Handle score change for a player
  const handlePlayerScoreChange = (
    holeNumber: number,
    playerName: string,
    team: string,
    value: string,
    target: HTMLInputElement
  ) => {
    if (locked) return; // Don't allow changes if scorecard is locked
    
    const key = `${holeNumber}-${playerName}`;
    const existingScores = playerScores.get(key) || [];
    
    if (existingScores.length === 0) return;
    
    const scoreData = { ...existingScores[0] };
    const score = value === "" ? null : Math.max(1, parseInt(value, 10));
    
    // Calculate net score
    const netScore = score !== null 
      ? Math.max(1, score - scoreData.handicapStrokes) 
      : null;
    
    // Update scores map
    const updatedScores = new Map(playerScores);
    updatedScores.set(key, [{ ...scoreData, score, netScore }]);
    setPlayerScores(updatedScores);
    
    // Save to database
    if (score !== null) {
      savePlayerScoreMutation.mutate({
        holeNumber,
        playerId: scoreData.playerId,
        matchId,
        score,
      });
      
      saveBestBallScoreMutation.mutate({
        holeNumber,
        playerId: scoreData.playerId,
        matchId,
        teamId: team === "aviator" ? "1" : "2",
        score,
        handicapStrokes: scoreData.handicapStrokes,
        netScore
      });
    }
    
    // Move to next input if appropriate
    if (value.length >= 1 && !isNaN(score as number)) {
      const inputs = Array.from(document.querySelectorAll('input[type="number"]'));
      const currentIndex = inputs.indexOf(target);
      
      if (currentIndex !== -1 && currentIndex < inputs.length - 1) {
        const nextInput = inputs[currentIndex + 1] as HTMLInputElement;
        if (nextInput && !nextInput.disabled) {
          nextInput.focus();
        }
      }
    }
    
    // Update match score if needed
    calculateAndUpdateMatchScore();
  };
  
  // Calculate and update the overall match score
  const calculateAndUpdateMatchScore = () => {
    // Calculate team totals
    const aviatorTotal = calculateTeamTotal("aviator");
    const producerTotal = calculateTeamTotal("producer");
    
    // Determine the match result
    let result = "";
    if (aviatorTotal.teamNetTotal < producerTotal.teamNetTotal) {
      result = "aviators";
    } else if (producerTotal.teamNetTotal < aviatorTotal.teamNetTotal) {
      result = "producers";
    } else if (aviatorTotal.teamNetTotal === producerTotal.teamNetTotal) {
      result = "tie";
    }
    
    // Update match with new score
    if (onScoreUpdate) {
      onScoreUpdate({
        aviatorScore: aviatorTotal.teamNetTotal,
        producerScore: producerTotal.teamNetTotal,
        result,
      });
    }
    
    // Also update match in database
    updateMatchScoreMutation.mutate({
      aviatorScore: aviatorTotal.teamNetTotal,
      producerScore: producerTotal.teamNetTotal,
      result,
      status: "in_progress"
    });
  };
  
  // Calculate team totals for a given team
  const calculateTeamTotal = (team: string) => {
    const teamPlayersList = team === "aviator" ? aviatorPlayersList : producerPlayersList;
    const teamPlayerNames = teamPlayersList.map((p: any) => p.name);
    
    let frontGrossTotal = 0;
    let frontNetTotal = 0;
    let backGrossTotal = 0;
    let backNetTotal = 0;
    
    // Calculate front nine total
    frontNine.forEach((hole) => {
      let lowestNetScore = Infinity;
      
      teamPlayerNames.forEach((name: string) => {
        const key = `${hole.number}-${name}`;
        const playerScoreData = playerScores.get(key)?.[0];
        
        if (playerScoreData && playerScoreData.netScore !== null && playerScoreData.netScore < lowestNetScore) {
          lowestNetScore = playerScoreData.netScore;
        }
      });
      
      if (lowestNetScore !== Infinity) {
        frontNetTotal += lowestNetScore;
      }
    });
    
    // Calculate back nine total
    backNine.forEach((hole) => {
      let lowestNetScore = Infinity;
      
      teamPlayerNames.forEach((name: string) => {
        const key = `${hole.number}-${name}`;
        const playerScoreData = playerScores.get(key)?.[0];
        
        if (playerScoreData && playerScoreData.netScore !== null && playerScoreData.netScore < lowestNetScore) {
          lowestNetScore = playerScoreData.netScore;
        }
      });
      
      if (lowestNetScore !== Infinity) {
        backNetTotal += lowestNetScore;
      }
    });
    
    // Calculate individual player totals
    const playerTotals = teamPlayerNames.map((name: string) => {
      let grossTotal = 0;
      let netTotal = 0;
      let frontGross = 0;
      let frontNet = 0;
      let backGross = 0;
      let backNet = 0;
      
      // Front nine
      frontNine.forEach((hole) => {
        const key = `${hole.number}-${name}`;
        const scoreData = playerScores.get(key)?.[0];
        
        if (scoreData && scoreData.score !== null) {
          frontGross += scoreData.score;
          frontNet += (scoreData.netScore !== null ? scoreData.netScore : scoreData.score);
        }
      });
      
      // Back nine
      backNine.forEach((hole) => {
        const key = `${hole.number}-${name}`;
        const scoreData = playerScores.get(key)?.[0];
        
        if (scoreData && scoreData.score !== null) {
          backGross += scoreData.score;
          backNet += (scoreData.netScore !== null ? scoreData.netScore : scoreData.score);
        }
      });
      
      grossTotal = frontGross + backGross;
      netTotal = frontNet + backNet;
      
      return {
        name,
        grossTotal,
        netTotal,
        frontGross,
        frontNet,
        backGross,
        backNet
      };
    });
    
    return {
      teamGrossTotal: frontGrossTotal + backGrossTotal,
      teamNetTotal: frontNetTotal + backNetTotal,
      frontGrossTotal,
      frontNetTotal,
      backGrossTotal,
      backNetTotal,
      playerTotals
    };
  };
  
  // Calculate team totals for display
  const aviatorFrontTotals = useMemo(() => calculateTeamTotal("aviator"), [playerScores, frontNine, backNine]);
  const producerFrontTotals = useMemo(() => calculateTeamTotal("producer"), [playerScores, frontNine, backNine]);
  
  // Check if data is still loading
  if (loading || scoresLoading || bestBallLoading) {
    return (
      <div className="best-ball-scorecard-container">
        <Skeleton className="h-12 w-full mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  
  // Return the scorecard UI
  return (
    <div className="best-ball-scorecard-container">
      <div className="scorecard-status">
        <div className="match-info">
          <span>{matchData?.name || "Match"}</span>
          {matchData?.status === "completed" && (
            <span className="status completed">Completed</span>
          )}
          {matchData?.status === "in_progress" && (
            <span className="status in-progress">In Progress</span>
          )}
        </div>
        
        {canEditScores && (
          <div className="scorecard-controls">
            <button 
              onClick={() => setLocked(!locked)}
              className={`lock-button ${locked ? 'locked' : 'unlocked'}`}
            >
              {locked ? '🔒 Unlock' : '🔓 Lock'}
            </button>
          </div>
        )}
      </div>
      
      <div className={`scorecard ${isMobile ? 'mobile' : ''}`}>
        {/* Desktop version shows all 18 holes */}
        {!isMobile && (
          <div className="scorecard-grid">
            {/* Header Row */}
            <div className="header-row">
              <div className="player-header">Player</div>
              <div className="handicap-header">HCP</div>
              {frontNine.map((hole) => (
                <div key={`hole-${hole.number}`} className="hole-number">
                  {hole.number}
                </div>
              ))}
              <div className="total-header">OUT</div>
              
              {backNine.map((hole) => (
                <div key={`hole-${hole.number}`} className="hole-number">
                  {hole.number}
                </div>
              ))}
              <div className="total-header">IN</div>
              <div className="total-header">TOT</div>
            </div>
            
            {/* Par Row */}
            <div className="par-row">
              <div className="par-label">Par</div>
              <div className="empty"></div>
              {frontNine.map((hole) => (
                <div key={`par-${hole.number}`} className="par-value">
                  {hole.par}
                </div>
              ))}
              <div className="total-value">{frontNinePar}</div>
              
              {backNine.map((hole) => (
                <div key={`par-${hole.number}`} className="par-value">
                  {hole.par}
                </div>
              ))}
              <div className="total-value">{backNinePar}</div>
              <div className="total-value">{totalPar}</div>
            </div>
            
            {/* Handicap Row */}
            <div className="handicap-row">
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
            </div>
            
            {/* Aviators Team */}
            <div className="team-header aviators">Aviators</div>
            <div className="empty"></div>
            {frontNine.map((hole) => (
              <div key={`aviator-${hole.number}`} className="team-best-ball">
                {/* Team best ball score will go here */}
              </div>
            ))}
            <div className="team-total">{aviatorFrontTotals.frontNetTotal}</div>
            
            {backNine.map((hole) => (
              <div key={`aviator-back-${hole.number}`} className="team-best-ball">
                {/* Team best ball score will go here */}
              </div>
            ))}
            <div className="team-total">{aviatorFrontTotals.backNetTotal}</div>
            <div className="team-total">{aviatorFrontTotals.teamNetTotal}</div>
            
            {/* Aviator Players */}
            {aviatorPlayersList.map((player) => (
              <React.Fragment key={`aviator-player-${player.id}`}>
                <div className="player-name aviator">{player.name}</div>
                <div className="player-handicap">
                  {getPlayerCourseHandicap(player.id)}
                </div>
                {frontNine.map((hole) => {
                  const playerKey = `${hole.number}-${player.name}`;
                  const scoreData = playerScores.get(playerKey)?.[0];
                  return (
                    <div 
                      key={`score-${player.id}-${hole.number}`} 
                      className={`score-input-cell ${isLowestScore(hole.number, player.name, "aviator") ? 'best-score' : ''}`}
                    >
                      <input
                        type="number"
                        value={scoreData && scoreData.score !== null ? scoreData.score.toString() : ''}
                        onChange={(e) =>
                          handlePlayerScoreChange(
                            hole.number,
                            player.name,
                            "aviator",
                            e.target.value,
                            e.target
                          )
                        }
                        min="1"
                        max="12"
                        disabled={isHoleGreyedOut(hole.number) || locked || !canEditScores}
                      />
                      {/* Net Score Display - only show when score is entered and player has handicap strokes on this hole */}
                      {scoreData && 
                       scoreData.score !== null && 
                       scoreData.handicapStrokes > 0 && (
                        <span className="net-score">
                          {scoreData.netScore}
                          <span className="handicap-dot">•</span>
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="player-total">
                  {aviatorFrontTotals.playerTotals.find(p => p.name === player.name)?.frontNet || ''}
                </div>
                
                {backNine.map((hole) => {
                  const playerKey = `${hole.number}-${player.name}`;
                  const scoreData = playerScores.get(playerKey)?.[0];
                  return (
                    <div 
                      key={`score-${player.id}-${hole.number}`}
                      className={`score-input-cell ${isLowestScore(hole.number, player.name, "aviator") ? 'best-score' : ''}`}
                    >
                      <input
                        type="number"
                        value={scoreData && scoreData.score !== null ? scoreData.score.toString() : ''}
                        onChange={(e) =>
                          handlePlayerScoreChange(
                            hole.number,
                            player.name,
                            "aviator",
                            e.target.value,
                            e.target
                          )
                        }
                        min="1"
                        max="12"
                        disabled={isHoleGreyedOut(hole.number) || locked || !canEditScores}
                      />
                      {/* Net Score Display */}
                      {scoreData && 
                       scoreData.score !== null && 
                       scoreData.handicapStrokes > 0 && (
                        <span className="net-score">
                          {scoreData.netScore}
                          <span className="handicap-dot">•</span>
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="player-total">
                  {aviatorFrontTotals.playerTotals.find(p => p.name === player.name)?.backNet || ''}
                </div>
                <div className="player-total">
                  {aviatorFrontTotals.playerTotals.find(p => p.name === player.name)?.netTotal || ''}
                </div>
              </React.Fragment>
            ))}
            
            {/* Producers Team */}
            <div className="team-header producers">Producers</div>
            <div className="empty"></div>
            {frontNine.map((hole) => (
              <div key={`producer-${hole.number}`} className="team-best-ball">
                {/* Team best ball score will go here */}
              </div>
            ))}
            <div className="team-total">{producerFrontTotals.frontNetTotal}</div>
            
            {backNine.map((hole) => (
              <div key={`producer-back-${hole.number}`} className="team-best-ball">
                {/* Team best ball score will go here */}
              </div>
            ))}
            <div className="team-total">{producerFrontTotals.backNetTotal}</div>
            <div className="team-total">{producerFrontTotals.teamNetTotal}</div>
            
            {/* Producer Players */}
            {producerPlayersList.map((player) => (
              <React.Fragment key={`producer-player-${player.id}`}>
                <div className="player-name producer">{player.name}</div>
                <div className="player-handicap">
                  {getPlayerCourseHandicap(player.id)}
                </div>
                {frontNine.map((hole) => {
                  const playerKey = `${hole.number}-${player.name}`;
                  const scoreData = playerScores.get(playerKey)?.[0];
                  return (
                    <div 
                      key={`score-${player.id}-${hole.number}`}
                      className={`score-input-cell ${isLowestScore(hole.number, player.name, "producer") ? 'best-score' : ''}`}
                    >
                      <input
                        type="number"
                        value={scoreData && scoreData.score !== null ? scoreData.score.toString() : ''}
                        onChange={(e) =>
                          handlePlayerScoreChange(
                            hole.number,
                            player.name,
                            "producer",
                            e.target.value,
                            e.target
                          )
                        }
                        min="1"
                        max="12"
                        disabled={isHoleGreyedOut(hole.number) || locked || !canEditScores}
                      />
                      {/* Net Score Display */}
                      {scoreData && 
                       scoreData.score !== null && 
                       scoreData.handicapStrokes > 0 && (
                        <span className="net-score">
                          {scoreData.netScore}
                          <span className="handicap-dot">•</span>
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="player-total">
                  {producerFrontTotals.playerTotals.find(p => p.name === player.name)?.frontNet || ''}
                </div>
                
                {backNine.map((hole) => {
                  const playerKey = `${hole.number}-${player.name}`;
                  const scoreData = playerScores.get(playerKey)?.[0];
                  return (
                    <div 
                      key={`score-${player.id}-${hole.number}`}
                      className={`score-input-cell ${isLowestScore(hole.number, player.name, "producer") ? 'best-score' : ''}`}
                    >
                      <input
                        type="number"
                        value={scoreData && scoreData.score !== null ? scoreData.score.toString() : ''}
                        onChange={(e) =>
                          handlePlayerScoreChange(
                            hole.number,
                            player.name,
                            "producer",
                            e.target.value,
                            e.target
                          )
                        }
                        min="1"
                        max="12"
                        disabled={isHoleGreyedOut(hole.number) || locked || !canEditScores}
                      />
                      {/* Net Score Display */}
                      {scoreData && 
                       scoreData.score !== null && 
                       scoreData.handicapStrokes > 0 && (
                        <span className="net-score">
                          {scoreData.netScore}
                          <span className="handicap-dot">•</span>
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="player-total">
                  {producerFrontTotals.playerTotals.find(p => p.name === player.name)?.backNet || ''}
                </div>
                <div className="player-total">
                  {producerFrontTotals.playerTotals.find(p => p.name === player.name)?.netTotal || ''}
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
        
        {/* Mobile version shows front and back nine separately */}
        {isMobile && (
          <div className="mobile-view">
            <p>Mobile view is coming soon.</p>
          </div>
        )}
      </div>
    </div>
  );
}