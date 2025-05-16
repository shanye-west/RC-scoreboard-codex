import React, { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

interface BestBallPlayerScore {
  player: string;
  score: number | null;
  teamId: string;
  playerId: number;
  handicapStrokes: number;
  netScore: number | null;
}

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

export default function BestBallScorecard({
  matchId,
  holes,
  aviatorPlayersList,
  producerPlayersList,
  participants,
  allPlayers,
  matchData,
  roundHandicapData,
  onScoreUpdate,
  isMobile = false
}: BestBallScorecardProps) {
  // Need to track player scores for each hole
  const [playerScores, setPlayerScores] = useState<Map<string, BestBallPlayerScore[]>>(new Map());
  const [existingPlayerHandicaps] = useState<Map<string, number>>(new Map());
  const [locked, setLocked] = useState(false);

  // Calculate handicap strokes for a player on a hole
  const getHandicapStrokes = async (playerId: number, holeNumber: number) => {
    try {
      // Find player
      const player = [...aviatorPlayersList, ...producerPlayersList].find(p => p.id === playerId);
      if (!player) return 0;
      
      const playerName = player.name;
      console.log(`Calculating handicap strokes for ${playerName} (id: ${playerId}) on hole ${holeNumber}`);
      
      // Find player's handicap info for this round
      const handicapEntry = roundHandicapData?.find(h => h.playerId === playerId);
      if (!handicapEntry) {
        console.log(`- No course handicap found for ${playerName}`);
        return 0;
      }
      
      const courseHandicap = handicapEntry.courseHandicap || 0;
      
      // Find hole information
      const hole = holes.find(h => h.number === holeNumber);
      if (!hole || !hole.handicapRank) {
        console.log(`- No handicap rank found for hole ${holeNumber}`);
        return 0;
      }
      
      // Calculate handicap strokes
      console.log(`- Course Handicap: ${courseHandicap}, Hole Handicap Rank: ${hole.handicapRank}`);
      
      if (courseHandicap >= hole.handicapRank) {
        console.log(`- ${playerName} gets 1 stroke on hole ${holeNumber}`);
        
        // Extra stroke for very high handicaps on the #1 handicap hole
        if (hole.handicapRank === 1 && courseHandicap >= 19) {
          console.log(`- ${playerName} gets 2 strokes on hole ${holeNumber}`);
          return 2;
        }
        
        return 1;
      }
      
      console.log(`- ${playerName} gets 0 strokes on hole ${holeNumber}`);
      return 0;
    } catch (error) {
      console.error("Error calculating handicap strokes:", error);
      return 0;
    }
  };
  
  // Fetch player handicaps for this round
  const { data: playerHandicaps = [] } = useQuery<any[]>({
    queryKey: [`/api/round-handicaps/${matchData?.roundId}`],
    enabled: !!matchData?.roundId,
  });
  
  // Fetch existing player scores for this match
  const { data: existingPlayerScores = [] } = useQuery<any[]>({
    queryKey: [`/api/player-scores?matchId=${matchId}`],
    enabled: !!matchId,
  });
  
  // Fetch individual scores from best_ball_player_scores
  const { data: individualScores = [] } = useQuery<any[]>({
    queryKey: [`/api/best-ball-scores/${matchId}`],
    enabled: !!matchId,
  });
  
  // Get authentication status to determine if user can edit scores
  const { isAdmin, user } = useAuth();
  
  // Check if current user is a participant in this match
  const isParticipant = useMemo(() => {
    if (!user) return false;
    
    const participantPlayerIds = participants?.map((p: any) => p.playerId) || [];
    const userPlayers = allPlayers.filter((player: any) => player.userId === user.id);
    const userPlayerIds = userPlayers.map((player: any) => player.id);
    
    // Check if any of user's players are participants in this match
    return userPlayerIds.some(id => participantPlayerIds.includes(id));
  }, [user, participants, allPlayers]);
  
  // Determine if user can edit scores (is admin or participant)
  const canEditScores = isAdmin || isParticipant;
  
  // Mutation for saving individual player scores
  const savePlayerScoreMutation = useMutation({
    mutationFn: async ({ 
      playerId, 
      matchId, 
      holeNumber, 
      score,
      tournamentId
    }: {
      playerId: number;
      matchId: number;
      holeNumber: number;
      score: number;
      tournamentId?: number;
    }) => {
      const response = await apiRequest("POST", `/api/player-scores`, {
        playerId,
        matchId,
        holeNumber,
        score,
        tournamentId
      });
      
      if (!response.ok) {
        throw new Error("Failed to save player score");
      }
      
      return response.json();
    }
  });

  // Mutation for saving best ball scores
  const saveBestBallScoreMutation = useMutation({
    mutationFn: async (score: {
      matchId: number;
      playerId: number;
      holeNumber: number;
      score: number | null;
      handicapStrokes: number;
      netScore: number | null;
    }) => {
      // Save to best_ball_player_scores table
      const bestBallResponse = await fetch('/api/best-ball-scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(score),
      });
      
      if (!bestBallResponse.ok) {
        throw new Error('Failed to save best ball score');
      }
      
      return bestBallResponse.json();
    },
    onSuccess: (data) => {
      // Invalidate best ball scores to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/best-ball-scores/${matchId}`] });
      
      // Important: Directly update local state to preserve handicap data
      if (data && data.playerId && data.holeNumber) {
        const player = [...aviatorPlayersList, ...producerPlayersList].find(p => p.id === data.playerId);
        if (player) {
          console.log(`Preserving handicap data after save: Player ${player.name}, Hole ${data.holeNumber}, Handicap=${data.handicapStrokes}`);
          
          // Update both team and individual player data to ensure handicap strokes are preserved
          const teamId = player.teamId === 1 ? "aviator" : "producer";
          const teamKey = `${data.holeNumber}-${teamId}`;
          const playerKey = `${data.holeNumber}-${player.name}`;
          
          // Create the updated player score object
          const playerScoreObj = {
            player: player.name,
            score: data.score,
            teamId,
            playerId: data.playerId,
            handicapStrokes: data.handicapStrokes,
            netScore: data.netScore
          };
          
          // Update state atomically to preserve handicap strokes
          setPlayerScores(prev => {
            const newScores = new Map(prev);
            
            // Update player's individual score
            newScores.set(playerKey, [playerScoreObj]);
            
            // Update team scores
            const teamScores = newScores.get(teamKey) || [];
            const playerIndex = teamScores.findIndex(s => s.playerId === data.playerId);
            
            if (playerIndex >= 0) {
              teamScores[playerIndex] = playerScoreObj;
            } else {
              teamScores.push(playerScoreObj);
            }
            
            newScores.set(teamKey, teamScores);
            
            // Trigger team score calculation
            updateTeamScores(data.holeNumber, newScores);
            
            return newScores;
          });
        }
      }
    }
  });

  // Mutation for updating match scores
  const updateMatchScoreMutation = useMutation({
    mutationFn: async ({ 
      matchId, 
      holeNumber, 
      aviatorScore, 
      producerScore 
    }: {
      matchId: number;
      holeNumber: number;
      aviatorScore: number | null;
      producerScore: number | null;
    }) => {
      const response = await apiRequest("POST", `/api/scores`, {
        matchId,
        holeNumber,
        aviatorScore,
        producerScore
      });
      
      if (!response.ok) {
        throw new Error("Failed to update match scores");
      }
      
      return response.json();
    },
    onSuccess: () => {
      // Invalidate scores to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/scores?matchId=${matchId}`] });
    }
  });

  // Function to get a player's course handicap
  const getPlayerCourseHandicap = (playerId: number): number => {
    if (!playerHandicaps || !playerHandicaps.length) return 0;
    
    const handicapEntry = playerHandicaps.find(h => h.playerId === playerId);
    return handicapEntry?.courseHandicap || 0;
  };

  // Load individual scores into state when they're fetched
  useEffect(() => {
    if (Array.isArray(individualScores) && individualScores.length > 0) {
      console.log("Loading scores from best_ball_player_scores table:", individualScores.length, "scores found");
      const newPlayerScores = new Map();
      
      individualScores.forEach(score => {
        const player = [...aviatorPlayersList, ...producerPlayersList]
          .find(p => p.id === score.playerId);
        
        if (player) {
          const teamKey = `${score.holeNumber}-${player.teamId === 1 ? 'aviator' : 'producer'}`;
          const playerKey = `${score.holeNumber}-${player.name}`;
          
          const scoreObj = {
            player: player.name,
            score: score.score,
            teamId: player.teamId === 1 ? 'aviator' : 'producer',
            playerId: score.playerId,
            handicapStrokes: score.handicapStrokes || 0,
            netScore: score.netScore || (score.score !== null ? score.score - (score.handicapStrokes || 0) : null)
          };
          
          // Update team scores
          const teamScores = newPlayerScores.get(teamKey) || [];
          teamScores.push(scoreObj);
          newPlayerScores.set(teamKey, teamScores);
          
          // Update player-specific scores
          newPlayerScores.set(playerKey, [scoreObj]);
        }
      });
      
      setPlayerScores(newPlayerScores);
    }
  }, [individualScores, aviatorPlayersList, producerPlayersList]);

  // Define updateTeamScores function to calculate best ball scores
  const updateTeamScores = (
    holeNumber: number,
    currentScores: Map<string, BestBallPlayerScore[]>,
  ) => {
    // Get aviator and producer player scores for this hole
    const aviatorKey = `${holeNumber}-aviator`;
    const producerKey = `${holeNumber}-producer`;
    
    const aviatorScores = currentScores.get(aviatorKey) || [];
    const producerScores = currentScores.get(producerKey) || [];
    
    // Calculate the best (lowest) net score for each team
    let bestAviatorScore = null;
    let bestProducerScore = null;
    
    // Find best aviator score
    if (aviatorScores.length > 0) {
      // Filter out null scores
      const validScores = aviatorScores.filter(s => s.netScore !== null);
      
      if (validScores.length > 0) {
        // Sort by net score (accounting for handicap)
        validScores.sort((a, b) => (a.netScore || 999) - (b.netScore || 999));
        bestAviatorScore = validScores[0].netScore;
      }
    }
    
    // Find best producer score
    if (producerScores.length > 0) {
      // Filter out null scores
      const validScores = producerScores.filter(s => s.netScore !== null);
      
      if (validScores.length > 0) {
        // Sort by net score (accounting for handicap)
        validScores.sort((a, b) => (a.netScore || 999) - (b.netScore || 999));
        bestProducerScore = validScores[0].netScore;
      }
    }
    
    // Update the match scores in the database
    if (bestAviatorScore !== null || bestProducerScore !== null) {
      console.log(`Updating match scores for hole ${holeNumber}: Aviator=${bestAviatorScore}, Producer=${bestProducerScore}`);
      
      updateMatchScoreMutation.mutate({
        matchId,
        holeNumber,
        aviatorScore: bestAviatorScore,
        producerScore: bestProducerScore
      });
    }
  };

  // Load saved player scores from the database
  useEffect(() => {
    if (!existingPlayerScores || existingPlayerScores.length === 0) return;
    
    console.log("Loading saved player scores from database:", existingPlayerScores);
    
    // Only process if we don't already have scores from best_ball_player_scores
    if (playerScores.size === 0) {
      const loadedScores = new Map();
      
      // Process each saved player score
      existingPlayerScores.forEach((savedScore: any) => {
        const { playerId, holeNumber, score } = savedScore;
        
        // Find the player from our lists
        const player = [...aviatorPlayersList, ...producerPlayersList].find(p => p.id === playerId);
        if (!player) return;
        
        // Determine team ID - convert plural form to singular
        const teamId = player.teamId === 1 ? "aviator" : "producer";
        
        // Calculate handicap strokes based on course handicap
        const courseHandicap = getPlayerCourseHandicap(playerId);
        const hole = holes.find(h => h.number === holeNumber);
        const handicapRank = hole?.handicapRank || 0;
        
        let handicapStrokes = 0;
        if (handicapRank > 0 && courseHandicap >= handicapRank) {
          handicapStrokes = 1;
          if (handicapRank === 1 && courseHandicap >= 19) {
            handicapStrokes = 2;
          }
        }
        
        // Save this for later quick lookup
        existingPlayerHandicaps.set(`${playerId}-${holeNumber}`, handicapStrokes);
        
        const netScore = score !== null ? score - handicapStrokes : null;
        
        // Create player score object
        const playerScoreObj = {
          player: player.name,
          score,
          teamId,
          playerId,
          handicapStrokes,
          netScore
        };
        
        // Set up the keys we use for storage
        const teamKey = `${holeNumber}-${teamId}`;
        const playerKey = `${holeNumber}-${player.name}`;
        
        // Get existing team scores or create new array
        let teamScores = loadedScores.get(teamKey) || [];
        
        // Check if player already exists in team scores
        const playerIndex = teamScores.findIndex((p: any) => p.playerId === playerId);
        
        if (playerIndex >= 0) {
          // Update existing player score
          teamScores[playerIndex] = playerScoreObj;
        } else {
          // Add new player score
          teamScores.push(playerScoreObj);
        }
        
        // Update the maps with new scores
        loadedScores.set(teamKey, teamScores);
        loadedScores.set(playerKey, [playerScoreObj]);
      });
      
      // Update state with loaded scores
      setPlayerScores(loadedScores);
      
      // Calculate team scores based on loaded player scores
      holes.forEach(hole => {
        updateTeamScores(hole.number, loadedScores);
      });
    }
  }, [existingPlayerScores, holes, matchId, aviatorPlayersList, producerPlayersList, playerHandicaps]);

  // Function to handle player score changes
  const handlePlayerScoreChange = async (
    holeNumber: number,
    playerName: string,
    teamId: string,
    value: string,
    target: HTMLInputElement,
  ) => {
    if (!canEditScores) {
      console.log("User doesn't have permission to update scores");
      return;
    }
    
    let numValue = null;
    if (value !== "") {
      const parsed = parseInt(value);
      if (!isNaN(parsed)) {
        numValue = parsed;
      }
    }

    const playerId = teamId === "aviator"
      ? aviatorPlayersList.find((p: any) => p.name === playerName)?.id || 0
      : producerPlayersList.find((p: any) => p.name === playerName)?.id || 0;
    
    // Get handicap strokes for this player on this hole
    let handicapStrokes = existingPlayerHandicaps.get(`${playerId}-${holeNumber}`) || 0;
    
    // If we don't have a cached value, calculate it
    if (handicapStrokes === 0) {
      const courseHandicap = getPlayerCourseHandicap(playerId);
      const hole = holes.find(h => h.number === holeNumber);
      const handicapRank = hole?.handicapRank || 0;
      
      if (handicapRank > 0 && courseHandicap >= handicapRank) {
        handicapStrokes = 1;
        if (handicapRank === 1 && courseHandicap >= 19) {
          handicapStrokes = 2;
        }
      }
      
      // Cache this for later
      existingPlayerHandicaps.set(`${playerId}-${holeNumber}`, handicapStrokes);
    }
    
    const netScore = numValue !== null ? numValue - handicapStrokes : null;

    // Save to database with error handling
    try {
      // Log what we're saving to the database to help with debugging
      console.log(`Saving to best_ball_scores: Player ${playerId}, Hole ${holeNumber}, Score ${numValue}, Handicap ${handicapStrokes}, Net ${netScore}`);
      
      await saveBestBallScoreMutation.mutateAsync({
        matchId,
        playerId,
        holeNumber,
        score: numValue,
        handicapStrokes,
        netScore
      });
      
      // Also save to player_scores table for redundancy
      if (numValue !== null) {
        try {
          await savePlayerScoreMutation.mutate({
            playerId,
            matchId,
            holeNumber,
            score: numValue,
            tournamentId: matchData?.tournamentId
          });
        } catch (error) {
          console.error("Error saving to player_scores:", error);
          // Don't block the UI flow if this fails
        }
      }
    } catch (error) {
      console.error("Error saving score:", error);
      alert("Failed to save your score. Please try again.");
      // Continue with local state update anyway to maintain user experience
    }

    // Update local state immediately for better user experience
    const teamKey = `${holeNumber}-${teamId}`;
    const playerKey = `${holeNumber}-${playerName}`;

    let holeScores = playerScores.get(teamKey) || [];
    const playerIndex = holeScores.findIndex((ps) => ps.player === playerName);
    
    const playerScoreObj = {
      player: playerName,
      score: numValue,
      teamId,
      playerId,
      handicapStrokes,
      netScore
    };

    if (playerIndex >= 0) {
      holeScores[playerIndex] = playerScoreObj;
    } else {
      holeScores.push(playerScoreObj);
    }

    const newPlayerScores = new Map(playerScores);
    newPlayerScores.set(teamKey, holeScores);
    newPlayerScores.set(playerKey, [playerScoreObj]);

    setPlayerScores(newPlayerScores);

    // Calculate the best score for each team and update the match
    updateTeamScores(holeNumber, newPlayerScores);

    setTimeout(() => {
      if (value !== "1" && value !== "") {
        target.blur();
      }
    }, 100);
  };

  // Define isLowestScore function to highlight best scores
  const isLowestScore = (
    holeNumber: number,
    playerName: string,
    teamId: string,
  ): boolean => {
    const key = `${holeNumber}-${teamId}`;
    const holeScores = playerScores.get(key) || [];

    if (holeScores.length < 2) return true; // If only one player, they are the best

    // Find this player's score
    const playerScore = holeScores.find((s) => s.player === playerName);
    if (!playerScore || playerScore.netScore === null) return false;

    // Get all valid scores
    const validScores = holeScores.filter((s) => s.netScore !== null);
    if (validScores.length === 0) return false;

    // Sort by net score (lowest first)
    validScores.sort((a, b) => (a.netScore || 999) - (b.netScore || 999));

    // This player has the lowest score if they match the first (lowest) score
    return playerScore.netScore === validScores[0].netScore;
  };

  // Function to check if a hole is greyed out (future holes in incomplete match)
  const isHoleGreyedOut = (holeNumber: number): boolean => {
    // Grey out holes if there's a locked match or incomplete match
    if (locked) return true;
    
    if (matchData?.status === 'in_progress') {
      // For in-progress matches, we need to determine which holes should be enabled
      // based on the last hole with scores
      
      // First, get all unique hole numbers that have scores
      const holesWithScores = new Set<number>();
      
      // Check player scores
      playerScores.forEach((scores, key) => {
        if (scores.length > 0 && scores[0].score !== null) {
          const holeMatch = key.match(/^(\d+)-/);
          if (holeMatch) {
            holesWithScores.add(parseInt(holeMatch[1]));
          }
        }
      });
      
      // If there are no scores yet, only enable the first hole
      if (holesWithScores.size === 0) {
        return holeNumber > 1;
      }
      
      // Find the highest hole number with scores
      const sortedHoles = Array.from(holesWithScores).sort((a, b) => a - b);
      const lastHoleWithScores = sortedHoles[sortedHoles.length - 1];
      
      // Enable the next hole after the last one with scores
      return holeNumber > lastHoleWithScores + 1;
    }
    
    return false;
  };

  // Process the holes data to organize front and back nine
  const frontNine = [...holes].filter((h) => h.number <= 9).sort((a, b) => a.number - b.number);
  const backNine = [...holes].filter((h) => h.number > 9).sort((a, b) => a.number - b.number);

  // Calculate totals for the scorecard
  const calculateTotals = (players: any[], teamId: string, holeRange: number[]) => {
    const totals = players.map(player => {
      let grossTotal = 0;
      let netTotal = 0;
      let holesPlayed = 0;
      
      holeRange.forEach(holeNumber => {
        const key = `${holeNumber}-${player.name}`;
        const scoreData = playerScores.get(key)?.[0];
        
        if (scoreData && scoreData.score !== null) {
          grossTotal += scoreData.score;
          netTotal += (scoreData.netScore !== null ? scoreData.netScore : scoreData.score);
          holesPlayed++;
        }
      });
      
      return {
        player: player.name,
        grossTotal,
        netTotal,
        holesPlayed
      };
    });
    
    // Calculate team totals
    let teamGrossTotal = 0;
    let teamNetTotal = 0;
    let teamHolesPlayed = 0;
    
    holeRange.forEach(holeNumber => {
      // For each hole, find the best score among team members
      const key = `${holeNumber}-${teamId}`;
      const scores = playerScores.get(key) || [];
      
      if (scores.length > 0) {
        // Filter scores that have a value
        const validScores = scores.filter(s => s.score !== null && s.netScore !== null);
        
        if (validScores.length > 0) {
          // Find the lowest net score for this hole
          validScores.sort((a, b) => (a.netScore || 999) - (b.netScore || 999));
          const bestScore = validScores[0];
          
          teamGrossTotal += (bestScore.score || 0);
          teamNetTotal += (bestScore.netScore || 0);
          teamHolesPlayed++;
        }
      }
    });
    
    return {
      playerTotals: totals,
      teamGrossTotal,
      teamNetTotal,
      teamHolesPlayed
    };
  };

  const aviatorFrontTotals = calculateTotals(
    aviatorPlayersList,
    "aviator",
    frontNine.map(h => h.number)
  );
  
  const aviatorBackTotals = calculateTotals(
    aviatorPlayersList,
    "aviator",
    backNine.map(h => h.number)
  );
  
  const producerFrontTotals = calculateTotals(
    producerPlayersList,
    "producer",
    frontNine.map(h => h.number)
  );
  
  const producerBackTotals = calculateTotals(
    producerPlayersList,
    "producer",
    backNine.map(h => h.number)
  );

  // Calculate course total par
  const frontNinePar = frontNine.reduce((sum, hole) => sum + hole.par, 0);
  const backNinePar = backNine.reduce((sum, hole) => sum + hole.par, 0);
  const totalPar = frontNinePar + backNinePar;

  // Return the scorecard UI
  // Check if data is still loading
  const isLoading = !holes || holes.length === 0 || aviatorPlayersList.length === 0 || producerPlayersList.length === 0;
  
  if (isLoading) {
    return (
      <div className="best-ball-scorecard-container">
        <Skeleton className="h-12 w-full mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  
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
        {/* Mobile version shows front and back nine separately */}
        {isMobile ? (
          <div className="mobile-scorecard">
            <div className="scorecard-section">
              <h3>Front Nine</h3>
              <div className="scorecard-grid mobile-grid">
                {/* Header row */}
                <div className="hole header">Hole</div>
                <div className="header par">Par</div>
                {frontNine.map((hole) => (
                  <div key={`header-${hole.number}`} className="hole-number header">
                    {hole.number}
                  </div>
                ))}
                <div className="total header">F9</div>
                
                {/* Par row */}
                <div className="label par-label">Par</div>
                <div className="header handicap">Hdcp</div>
                {frontNine.map((hole) => (
                  <div key={`par-${hole.number}`} className="par-value">
                    {hole.par}
                  </div>
                ))}
                <div className="total-value">{frontNinePar}</div>
                
                {/* Aviators */}
                <div className="team-header aviators">Aviators</div>
                <div className="empty"></div>
                {frontNine.map((hole) => (
                  <div key={`aviator-${hole.number}`} className="team-best-ball">
                    {/* Team best ball score will go here */}
                  </div>
                ))}
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
                            value={scoreData && scoreData.score !== null && scoreData.score !== undefined ? scoreData.score.toString() : ''}
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
                          {/* Net Score Display - only show when score is entered */}
                          {scoreData && 
                           scoreData.score !== null && 
                           scoreData.score !== undefined && 
                           scoreData.handicapStrokes && 
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
                      {aviatorFrontTotals.playerTotals.find(p => p.player === player.name)?.netTotal || '-'}
                    </div>
                  </React.Fragment>
                ))}
                
                {/* Producers */}
                <div className="team-header producers">Producers</div>
                <div className="empty"></div>
                {frontNine.map((hole) => (
                  <div key={`producer-${hole.number}`} className="team-best-ball">
                    {/* Team best ball score will go here */}
                  </div>
                ))}
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
                            value={scoreData?.score !== null ? scoreData.score.toString() : ''}
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
                          {scoreData?.score !== null && 
                           scoreData?.handicapStrokes > 0 && (
                            <span className="net-score">
                              {scoreData.netScore}
                              <span className="handicap-dot">•</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <div className="player-total">
                      {producerFrontTotals.playerTotals.find(p => p.player === player.name)?.netTotal || '-'}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
            
            <div className="scorecard-section">
              <h3>Back Nine</h3>
              <div className="scorecard-grid mobile-grid">
                {/* Header row */}
                <div className="hole header">Hole</div>
                <div className="header par">Par</div>
                {backNine.map((hole) => (
                  <div key={`header-${hole.number}`} className="hole-number header">
                    {hole.number}
                  </div>
                ))}
                <div className="total header">B9</div>
                <div className="total header">Total</div>
                
                {/* Par row */}
                <div className="label par-label">Par</div>
                <div className="header handicap">Hdcp</div>
                {backNine.map((hole) => (
                  <div key={`par-${hole.number}`} className="par-value">
                    {hole.par}
                  </div>
                ))}
                <div className="total-value">{backNinePar}</div>
                <div className="total-value">{totalPar}</div>
                
                {/* Aviators */}
                <div className="team-header aviators">Aviators</div>
                <div className="empty"></div>
                {backNine.map((hole) => (
                  <div key={`aviator-${hole.number}`} className="team-best-ball">
                    {/* Team best ball score will go here */}
                  </div>
                ))}
                <div className="team-total">{aviatorBackTotals.teamNetTotal}</div>
                <div className="team-total">{aviatorFrontTotals.teamNetTotal + aviatorBackTotals.teamNetTotal}</div>
                
                {/* Aviator Players */}
                {aviatorPlayersList.map((player) => (
                  <React.Fragment key={`aviator-player-${player.id}`}>
                    <div className="player-name aviator">{player.name}</div>
                    <div className="player-handicap">
                      {getPlayerCourseHandicap(player.id)}
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
                            value={scoreData?.score !== null ? scoreData.score.toString() : ''}
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
                          {scoreData?.score !== null && 
                           scoreData?.handicapStrokes > 0 && (
                            <span className="net-score">
                              {scoreData.netScore}
                              <span className="handicap-dot">•</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <div className="player-total">
                      {aviatorBackTotals.playerTotals.find(p => p.player === player.name)?.netTotal || '-'}
                    </div>
                    <div className="player-total">
                      {(aviatorFrontTotals.playerTotals.find(p => p.player === player.name)?.netTotal || 0) +
                       (aviatorBackTotals.playerTotals.find(p => p.player === player.name)?.netTotal || 0)}
                    </div>
                  </React.Fragment>
                ))}
                
                {/* Producers */}
                <div className="team-header producers">Producers</div>
                <div className="empty"></div>
                {backNine.map((hole) => (
                  <div key={`producer-${hole.number}`} className="team-best-ball">
                    {/* Team best ball score will go here */}
                  </div>
                ))}
                <div className="team-total">{producerBackTotals.teamNetTotal}</div>
                <div className="team-total">{producerFrontTotals.teamNetTotal + producerBackTotals.teamNetTotal}</div>
                
                {/* Producer Players */}
                {producerPlayersList.map((player) => (
                  <React.Fragment key={`producer-player-${player.id}`}>
                    <div className="player-name producer">{player.name}</div>
                    <div className="player-handicap">
                      {getPlayerCourseHandicap(player.id)}
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
                            value={scoreData?.score !== null ? scoreData.score.toString() : ''}
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
                          {scoreData?.score !== null && 
                           scoreData?.handicapStrokes > 0 && (
                            <span className="net-score">
                              {scoreData.netScore}
                              <span className="handicap-dot">•</span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                    <div className="player-total">
                      {producerBackTotals.playerTotals.find(p => p.player === player.name)?.netTotal || '-'}
                    </div>
                    <div className="player-total">
                      {(producerFrontTotals.playerTotals.find(p => p.player === player.name)?.netTotal || 0) +
                       (producerBackTotals.playerTotals.find(p => p.player === player.name)?.netTotal || 0)}
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        ) : (
          // Desktop version shows all 18 holes in one table
          <div className="scorecard-grid desktop-grid">
            {/* Header row */}
            <div className="hole header">Hole</div>
            <div className="header par">Par</div>
            {frontNine.map((hole) => (
              <div key={`header-${hole.number}`} className="hole-number header">
                {hole.number}
              </div>
            ))}
            <div className="total header">F9</div>
            {backNine.map((hole) => (
              <div key={`header-${hole.number}`} className="hole-number header">
                {hole.number}
              </div>
            ))}
            <div className="total header">B9</div>
            <div className="total header">Total</div>
            
            {/* Par row */}
            <div className="label par-label">Par</div>
            <div className="header handicap">Hdcp</div>
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
            
            {/* Aviators */}
            <div className="team-header aviators">Aviators</div>
            <div className="empty"></div>
            {frontNine.map((hole) => (
              <div key={`aviator-${hole.number}`} className="team-best-ball">
                {/* Team best ball score will go here */}
              </div>
            ))}
            <div className="team-total">{aviatorFrontTotals.teamNetTotal}</div>
            {backNine.map((hole) => (
              <div key={`aviator-${hole.number}`} className="team-best-ball">
                {/* Team best ball score will go here */}
              </div>
            ))}
            <div className="team-total">{aviatorBackTotals.teamNetTotal}</div>
            <div className="team-total">{aviatorFrontTotals.teamNetTotal + aviatorBackTotals.teamNetTotal}</div>
            
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
                        value={scoreData?.score !== null ? scoreData.score.toString() : ''}
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
                      {scoreData?.score !== null && 
                       scoreData?.handicapStrokes > 0 && (
                        <span className="net-score">
                          {scoreData.netScore}
                          <span className="handicap-dot">•</span>
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="player-total">
                  {aviatorFrontTotals.playerTotals.find(p => p.player === player.name)?.netTotal || '-'}
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
                        value={scoreData?.score !== null ? scoreData.score.toString() : ''}
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
                      {scoreData?.score !== null && 
                       scoreData?.handicapStrokes > 0 && (
                        <span className="net-score">
                          {scoreData.netScore}
                          <span className="handicap-dot">•</span>
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="player-total">
                  {aviatorBackTotals.playerTotals.find(p => p.player === player.name)?.netTotal || '-'}
                </div>
                <div className="player-total">
                  {(aviatorFrontTotals.playerTotals.find(p => p.player === player.name)?.netTotal || 0) +
                   (aviatorBackTotals.playerTotals.find(p => p.player === player.name)?.netTotal || 0)}
                </div>
              </React.Fragment>
            ))}
            
            {/* Producers */}
            <div className="team-header producers">Producers</div>
            <div className="empty"></div>
            {frontNine.map((hole) => (
              <div key={`producer-${hole.number}`} className="team-best-ball">
                {/* Team best ball score will go here */}
              </div>
            ))}
            <div className="team-total">{producerFrontTotals.teamNetTotal}</div>
            {backNine.map((hole) => (
              <div key={`producer-${hole.number}`} className="team-best-ball">
                {/* Team best ball score will go here */}
              </div>
            ))}
            <div className="team-total">{producerBackTotals.teamNetTotal}</div>
            <div className="team-total">{producerFrontTotals.teamNetTotal + producerBackTotals.teamNetTotal}</div>
            
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
                        value={scoreData?.score !== null ? scoreData.score.toString() : ''}
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
                      {scoreData?.score !== null && 
                       scoreData?.handicapStrokes > 0 && (
                        <span className="net-score">
                          {scoreData.netScore}
                          <span className="handicap-dot">•</span>
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="player-total">
                  {producerFrontTotals.playerTotals.find(p => p.player === player.name)?.netTotal || '-'}
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
                        value={scoreData?.score !== null ? scoreData.score.toString() : ''}
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
                      {scoreData?.score !== null && 
                       scoreData?.handicapStrokes > 0 && (
                        <span className="net-score">
                          {scoreData.netScore}
                          <span className="handicap-dot">•</span>
                        </span>
                      )}
                    </div>
                  );
                })}
                <div className="player-total">
                  {producerBackTotals.playerTotals.find(p => p.player === player.name)?.netTotal || '-'}
                </div>
                <div className="player-total">
                  {(producerFrontTotals.playerTotals.find(p => p.player === player.name)?.netTotal || 0) +
                   (producerBackTotals.playerTotals.find(p => p.player === player.name)?.netTotal || 0)}
                </div>
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}