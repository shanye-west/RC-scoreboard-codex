import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

// DEFINE INTERFACES
interface Hole {
  id: number;
  number: number;
  par: number;
  handicapRank?: number | null;
}

interface Score {
  id: number;
  matchId: number;
  holeNumber: number;
  aviatorScore: number | null;
  producerScore: number | null;
  winningTeam: string | null;
  matchStatus: string | null;
}

interface Player {
  id: number;
  name: string;
  teamId: number;
  handicapIndex?: number | null;
}

interface MatchParticipant {
  userId: number;
  team: string;
  player: Player;
}

interface BestBallPlayerScore {
  player: string;
  score: number | null;
  teamId: string; // "aviator" or "producer"
  playerId: number;
  handicapStrokes?: number;
  netScore?: number | null;
}

interface MatchScorecardProps {
  matchId: number;
  holes: Hole[];
  scores: Score[];
  matchStatus?: string;
  matchType: string;
  locked: boolean;
  onScoreUpdate: (
    holeNumber: number,
    aviatorScore: number | null,
    producerScore: number | null,
  ) => void;
  onBestBallScoreUpdate?: (
    holeNumber: number,
    playerScores: BestBallPlayerScore[],
  ) => void;
  participants?: any[]; // Match participants
}

const EnhancedMatchScorecard = ({
  matchId,
  holes,
  scores,
  matchStatus = "in_progress",
  matchType,
  locked = false,
  onScoreUpdate,
  onBestBallScoreUpdate,
}: MatchScorecardProps) => {
  const isBestBall = matchType.includes("Best Ball");
  const queryClient = useQueryClient();

  // Fetch match participants
  const { data: participants = [] } = useQuery<any[]>({
    queryKey: [`/api/match-players?matchId=${matchId}`],
  });

  // Fetch all players for reference
  const { data: allPlayers = [] } = useQuery<any[]>({
    queryKey: ["/api/players"],
  });
  
  // Fetch information about the match's round
  const { data: matchData } = useQuery<any>({
    queryKey: [`/api/matches/${matchId}`],
    enabled: !!matchId && isBestBall,
  });
  
  // Fetch individual player scores for Best Ball
  const { data: individualScores = [] } = useQuery({
    queryKey: [`/api/best-ball-scores/${matchId}`],
    enabled: !!matchId && isBestBall,
  });
  
  // Function to calculate handicap strokes for a player on a specific hole
  const getHandicapStrokes = async (playerId: number, holeNumber: number) => {
    if (!matchData?.roundId || !isBestBall) return 0;
    
    try {
      // Get player's course handicap
      const courseHandicap = getPlayerCourseHandicap(playerId);
      
      // Find player details for logging
      const playerName = [...aviatorPlayersList, ...producerPlayersList].find(p => p.id === playerId)?.name || `Player ${playerId}`;
      
      // Find the hole with the matching number
      const hole = holes.find(h => h.number === holeNumber);
      const handicapRank = hole?.handicapRank || 0;
      
      console.log(`Calculating handicap strokes for ${playerName} (id: ${playerId}) on hole ${holeNumber}`);
      console.log(`- Course Handicap: ${courseHandicap}, Hole Handicap Rank: ${handicapRank}`);
      
      // Calculate strokes based on hole handicap rank
      // If player's handicap is higher than or equal to the hole's handicap rank, they get a stroke
      // For example, if player has handicap 8 and hole rank is 5, they get a stroke
      if (handicapRank > 0 && courseHandicap >= handicapRank) {
        console.log(`- ${playerName} gets 1 stroke on hole ${holeNumber}`);
        return 1;
      }
      
      // Calculate additional strokes for very high handicaps
      // If player has handicap 19+ on hole rank 1, they get 2 strokes
      if (handicapRank === 1 && courseHandicap >= 19) {
        console.log(`- ${playerName} gets 2 strokes on hole ${holeNumber}`);
        return 2;
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
    enabled: !!matchData?.roundId && isBestBall,
  });
  
  // Fetch existing player scores for this match
  const { data: existingPlayerScores = [] } = useQuery<any[]>({
    queryKey: [`/api/player-scores?matchId=${matchId}`],
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
  
  // queryClient is already defined above
  

  
  // Mutation for saving player scores
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
      // Check if player score already exists for this hole
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
    },
    onSuccess: () => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [`/api/player-scores?matchId=${matchId}`] });
    },
  });
  
  // Mutation for updating a player's course handicap
  const updateHandicapMutation = useMutation({
    mutationFn: async ({ playerId, roundId, courseHandicap }: { 
      playerId: number;
      roundId: number;
      courseHandicap: number;
    }) => {
      const response = await apiRequest("PUT", `/api/players/${playerId}/course-handicap`, {
        roundId,
        courseHandicap
      });
      
      if (!response.ok) {
        throw new Error("Failed to update handicap");
      }
      
      return response.json();
    },
    onSuccess: async (_, variables) => {
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: [`/api/round-handicaps/${matchData?.roundId}`] });
      
      // Find player
      const player = [...aviatorPlayersList, ...producerPlayersList].find(p => p.id === variables.playerId);
      if (!player) return;
      
      // Recalculate handicap strokes for this player on all holes
      for (const hole of holes) {
        // Calculate new handicap strokes
        const newHandicapStrokes = await getHandicapStrokes(variables.playerId, hole.number);
        
        // Update player scores for this hole
        const key = `${hole.number}-${player.name}`;
        const existingScores = playerScores.get(key) || [];
        
        if (existingScores.length > 0) {
          // Update existing score with new handicap strokes
          const score = existingScores[0].score;
          existingScores[0] = {
            ...existingScores[0],
            handicapStrokes: newHandicapStrokes,
            netScore: score !== null ? score - newHandicapStrokes : null
          };
          
          // Update the Map with new data
          setPlayerScores(prev => {
            const newMap = new Map(prev);
            newMap.set(key, existingScores);
            
            // Also update team key
            const teamKey = `${hole.number}-${player.teamId === 1 ? "aviator" : "producer"}`;
            const teamScores = newMap.get(teamKey) || [];
            const playerIndex = teamScores.findIndex(s => s.player === player.name);
            
            if (playerIndex >= 0) {
              teamScores[playerIndex] = {
                ...teamScores[playerIndex],
                handicapStrokes: newHandicapStrokes,
                netScore: score !== null ? score - newHandicapStrokes : null
              };
              newMap.set(teamKey, teamScores);
            }
            
            return newMap;
          });
        } else {
          // Create a new score entry with handicap info even if no score has been entered yet
          // This ensures handicap dots will show immediately
          const newScore: BestBallPlayerScore = {
            player: player.name,
            score: null,
            teamId: player.teamId === 1 ? "aviator" : "producer",
            playerId: player.id,
            handicapStrokes: newHandicapStrokes,
            netScore: null
          };
          
          setPlayerScores(prev => {
            const newMap = new Map(prev);
            newMap.set(key, [newScore]);
            return newMap;
          });
        }
      }
      
      // Recalculate team scores for all holes
      setTimeout(() => {
        for (let i = 1; i <= 18; i++) {
          updateBestBallScores(i, playerScores);
        }
      }, 500);
    }
  });
  
  // Function to get a player's course handicap
  const getPlayerCourseHandicap = (playerId: number): number => {
    if (!playerHandicaps || !playerHandicaps.length) return 0;
    
    const handicapEntry = playerHandicaps.find(h => h.playerId === playerId);
    return handicapEntry?.courseHandicap || 0;
  };
  
  // Function to handle handicap edit
  const handleHandicapEdit = (playerId: number, currentHandicap: number) => {
    // Only admins or match participants can edit handicaps
    if (!canEditScores || !matchData?.roundId) return;
    
    const newHandicap = prompt("Enter new course handicap:", currentHandicap.toString());
    if (newHandicap === null) return; // User cancelled
    
    const handicapValue = parseInt(newHandicap);
    if (isNaN(handicapValue)) {
      alert("Please enter a valid number");
      return;
    }
    
    // Update the handicap
    updateHandicapMutation.mutate({
      playerId,
      roundId: matchData.roundId,
      courseHandicap: handicapValue
    });
  };

  // Split participants into teams
  const aviatorPlayersList = useMemo(() => {
    if (!Array.isArray(participants)) return [];

    return participants
      .filter((p: any) => p.team === "aviator" || p.team === "aviators")
      .map((p: any) => {
        if (!Array.isArray(allPlayers)) return { id: p.playerId, name: `Player ${p.playerId}`, teamId: 1 };

        // Find the player details from allPlayers
        const playerDetails = allPlayers.find((player: any) => player.id === p.playerId);
        return playerDetails || { id: p.playerId, name: `Player ${p.playerId}`, teamId: 1 };
      });
  }, [participants, allPlayers]);

  const producerPlayersList = useMemo(() => {
    if (!Array.isArray(participants)) return [];

    return participants
      .filter((p: any) => p.team === "producer" || p.team === "producers")
      .map((p: any) => {
        if (!Array.isArray(allPlayers)) return { id: p.playerId, name: `Player ${p.playerId}`, teamId: 2 };

        // Find the player details from allPlayers
        const playerDetails = allPlayers.find((player: any) => player.id === p.playerId);
        return playerDetails || { id: p.playerId, name: `Player ${p.playerId}`, teamId: 2 };
      });
  }, [participants, allPlayers]);


  // For Best Ball, we need to track individual player scores
  const [playerScores, setPlayerScores] = useState<
    Map<string, BestBallPlayerScore[]>
  >(new Map());

  const allHoles = [...holes].sort((a, b) => a.number - b.number);
  const frontNine = [...holes].filter((h) => h.number <= 9).sort((a, b) => a.number - b.number);
  const backNine = [...holes].filter((h) => h.number > 9).sort((a, b) => a.number - b.number);
  
  // Load saved player scores from the database
  useEffect(() => {
    if (!existingPlayerScores || existingPlayerScores.length === 0) return;
    
    console.log("Loading saved player scores from database:", existingPlayerScores);
    
    // Create a new Map to hold all loaded scores
    const loadedScores = new Map(playerScores);
    
    // Process each saved player score
    existingPlayerScores.forEach((savedScore: any) => {
      const { playerId, holeNumber, score, handicapStrokes = 0 } = savedScore;
      
      // Find the player from our lists
      const player = [...aviatorPlayersList, ...producerPlayersList].find(p => p.id === playerId);
      if (!player) return;
      
      // Determine team ID - convert plural form to singular
      const teamId = player.teamId === 1 ? "aviator" : "producer";
      
      // Calculate net score 
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
      const playerIndex = teamScores.findIndex(p => p.playerId === playerId);
      
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
      updateBestBallScores(hole.number, loadedScores);
    });
    
  }, [existingPlayerScores, holes, playerScores, matchId, aviatorPlayersList, producerPlayersList]);
  
  // Load handicap strokes for all players on all holes
  useEffect(() => {
    if (!isBestBall || !matchData?.roundId) return;
    
    // Function to load handicap data for a player
    const loadPlayerHandicapData = async (player: Player) => {
      if (!player || !player.id) return;
      
      for (const hole of holes) {
        try {
          // Fetch handicap strokes for this player on this hole
          const handicapStrokes = await getHandicapStrokes(player.id, hole.number);
          
          // Create the key for this player and hole
          const key = `${hole.number}-${player.name}`;
          
          // Get existing scores or create new array
          const existingScores = playerScores.get(key) || [];
          
          // If we already have scores, update with handicap info
          if (existingScores.length > 0) {
            existingScores[0] = {
              ...existingScores[0],
              handicapStrokes
            };
          } else {
            // Otherwise create a new score object
            existingScores.push({
              player: player.name,
              score: null,
              teamId: player.teamId === 1 ? "aviator" : "producer",
              playerId: player.id,
              handicapStrokes
            });
          }
          
          // Update the Map
          setPlayerScores(prev => {
            const newMap = new Map(prev);
            newMap.set(key, existingScores);
            return newMap;
          });
        } catch (error) {
          console.error("Error loading handicap data:", error);
        }
      }
    };
    
    // Load handicap data for all players
    Promise.all([
      ...aviatorPlayersList.map(loadPlayerHandicapData),
      ...producerPlayersList.map(loadPlayerHandicapData)
    ]);
    
  }, [playerHandicaps, holes, aviatorPlayersList, producerPlayersList, matchData?.roundId, isBestBall]);
  
  // Load best ball scores from the database on initial load
  useEffect(() => {
    if (!isBestBall || !individualScores || individualScores.length === 0) return;
    
    console.log("Loading individual scores for best ball:", individualScores);
    
    // Create a map to hold all best ball player scores
    const newPlayerScores = new Map();
    
    // Process each saved individual score
    individualScores.forEach((score: any) => {
      const { playerId, holeNumber, score: strokeScore, handicapStrokes = 0 } = score;
      
      // Find the player from our lists
      const player = [...aviatorPlayersList, ...producerPlayersList].find(p => p.id === playerId);
      if (!player) return;
      
      // Determine team ID
      const teamId = player.teamId === 1 ? "aviator" : "producer";
      
      // Calculate net score
      const netScore = strokeScore !== null ? strokeScore - handicapStrokes : null;
      
      // Create player score object
      const playerScore = {
        player: player.name,
        score: strokeScore,
        teamId,
        playerId,
        handicapStrokes,
        netScore
      };
      
      // Set up the keys we use
      const teamKey = `${holeNumber}-${teamId}`;
      const playerKey = `${holeNumber}-${player.name}`;
      
      // Get existing team scores
      let teamScores = newPlayerScores.get(teamKey) || [];
      
      // Check if player already exists in team scores
      const playerIndex = teamScores.findIndex((p: any) => p.playerId === playerId);
      
      if (playerIndex >= 0) {
        // Update existing player score
        teamScores[playerIndex] = playerScore;
      } else {
        // Add new player score
        teamScores.push(playerScore);
      }
      
      // Update the maps
      newPlayerScores.set(teamKey, teamScores);
      newPlayerScores.set(playerKey, [playerScore]);
    });
    
    // If we have individual scores, update the state
    if (newPlayerScores.size > 0) {
      setPlayerScores(newPlayerScores);
      
      // Recalculate team scores for all holes affected
      if (individualScores.length > 0) {
        const uniqueHoles = [...new Set(individualScores.map((s: any) => s.holeNumber))];
        uniqueHoles.forEach(holeNumber => {
          updateBestBallScores(holeNumber, newPlayerScores);
        });
      }
    }
    
  }, [individualScores, aviatorPlayersList, producerPlayersList]);
  
  // Define updateBestBallScores before using it in useEffect
  const updateBestBallScores = (
    holeNumber: number,
    currentScores: Map<string, BestBallPlayerScore[]>,
  ) => {
    const playerScoresForHole: BestBallPlayerScore[] = [];
    
    // Get scores for this hole
    const key1 = `${holeNumber}-aviator`;
    const key2 = `${holeNumber}-producer`;
    
    const aviatorHoleScores = currentScores.get(key1) || [];
    const producerHoleScores = currentScores.get(key2) || [];
    
    // Add all player scores to the array that will be returned to parent
    aviatorHoleScores.forEach(score => {
      playerScoresForHole.push(score);
    });
    
    producerHoleScores.forEach(score => {
      playerScoresForHole.push(score);
    });
    
    // Calculate team scores (lowest score from each team)
    let aviatorScore = null;
    let producerScore = null;
    
    // If the match is Best Ball and we have handicap strokes, use net scores
    if (isBestBall) {
      // First, calculate net scores for all players
      for (const playerScore of [...aviatorHoleScores, ...producerHoleScores]) {
        if (playerScore.score !== null) {
          // Ensure handicap strokes are applied
          const strokes = playerScore.handicapStrokes || 0;
          playerScore.netScore = playerScore.score - strokes;
        }
      }
      
      // Find the lowest net score for each team (ignoring null/undefined)
      if (aviatorHoleScores.length > 0) {
        const validNetScores = aviatorHoleScores.filter((s) => s.score !== null);
        if (validNetScores.length > 0) {
          // Use net scores for team score calculation
          aviatorScore = Math.min(
            ...validNetScores.map((s) => {
              // Calculate net score based on gross score and handicap strokes
              const grossScore = s.score || Infinity;
              const handicapStrokes = s.handicapStrokes || 0;
              return grossScore - handicapStrokes;
            })
          );
          if (aviatorScore === Infinity) aviatorScore = null;
        }
      }

      if (producerHoleScores.length > 0) {
        const validNetScores = producerHoleScores.filter((s) => s.score !== null);
        if (validNetScores.length > 0) {
          // Use net scores for team score calculation
          producerScore = Math.min(
            ...validNetScores.map((s) => {
              // Calculate net score based on gross score and handicap strokes
              const grossScore = s.score || Infinity;
              const handicapStrokes = s.handicapStrokes || 0;
              return grossScore - handicapStrokes;
            })
          );
          if (producerScore === Infinity) producerScore = null;
        }
      }
      
      // Update player score objects with calculated net scores
      for (const [key, scores] of currentScores.entries()) {
        if (key.includes('-aviator') || key.includes('-producer')) {
          continue; // Skip team keys
        }
        
        // This is a player-specific key (e.g., "1-John Smith")
        if (scores.length > 0 && scores[0].score !== null) {
          const playerScore = scores[0];
          const handicapStrokes = playerScore.handicapStrokes || 0;
          const netScore = playerScore.score! - handicapStrokes;
          
          // Update net score
          if (netScore !== playerScore.netScore) {
            scores[0] = {...playerScore, netScore};
            currentScores.set(key, scores);
          }
        }
      }
    } else {
      // Regular match - use gross scores
      if (aviatorHoleScores.length > 0) {
        const validScores = aviatorHoleScores.filter((s) => s.score !== null);
        if (validScores.length > 0) {
          aviatorScore = Math.min(...validScores.map((s) => s.score || Infinity));
          if (aviatorScore === Infinity) aviatorScore = null;
        }
      }

      if (producerHoleScores.length > 0) {
        const validScores = producerHoleScores.filter((s) => s.score !== null);
        if (validScores.length > 0) {
          producerScore = Math.min(...validScores.map((s) => s.score || Infinity));
          if (producerScore === Infinity) producerScore = null;
        }
      }
    }

    // Determine match result (who won the hole)
    let winningTeam = null;
    if (aviatorScore !== null && producerScore !== null) {
      if (aviatorScore < producerScore) {
        winningTeam = "aviator";
      } else if (producerScore < aviatorScore) {
        winningTeam = "producer";
      } else {
        winningTeam = "tie";
      }
    }

    // Update parent component
    if (aviatorScore !== null || producerScore !== null) {
      onScoreUpdate(holeNumber, aviatorScore, producerScore);
    }

    // If this is a Best Ball match, also update with all player scores
    if (isBestBall && onBestBallScoreUpdate) {
      // Get all player scores for this hole
      const playerScoresForHole: BestBallPlayerScore[] = [];
      
      // Collect player scores from individual entries
      for (const [key, scores] of currentScores.entries()) {
        if (key.startsWith(`${holeNumber}-`) && !key.includes('-aviator') && !key.includes('-producer')) {
          if (scores.length > 0) {
            playerScoresForHole.push(scores[0]);
          }
        }
      }
      
      if (playerScoresForHole.length > 0) {
        onBestBallScoreUpdate(holeNumber, playerScoresForHole);
      }
    }
  };

  // Calculate front nine scores
  const frontNineTotals = useMemo(() => {
    let aviatorTotal = 0;
    let producerTotal = 0;
    let aviatorWins = 0;
    let producerWins = 0;
    let ties = 0;

    // Use filled scores
    const validScores = scores.filter(
      (s) =>
        s.holeNumber <= 9 && s.aviatorScore !== null && s.producerScore !== null
    );

    for (const score of validScores) {
      aviatorTotal += score.aviatorScore!;
      producerTotal += score.producerScore!;

      if (score.aviatorScore! < score.producerScore!) {
        aviatorWins++;
      } else if (score.producerScore! < score.aviatorScore!) {
        producerWins++;
      } else {
        ties++;
      }
    }

    return {
      aviatorTotal,
      producerTotal,
      aviatorWins,
      producerWins,
      ties,
      validScores: validScores.length,
    };
  }, [scores]);

  // Calculate back nine scores
  const backNineTotals = useMemo(() => {
    let aviatorTotal = 0;
    let producerTotal = 0;
    let aviatorWins = 0;
    let producerWins = 0;
    let ties = 0;

    // Use filled scores
    const validScores = scores.filter(
      (s) =>
        s.holeNumber > 9 &&
        s.holeNumber <= 18 &&
        s.aviatorScore !== null &&
        s.producerScore !== null
    );

    for (const score of validScores) {
      aviatorTotal += score.aviatorScore!;
      producerTotal += score.producerScore!;

      if (score.aviatorScore! < score.producerScore!) {
        aviatorWins++;
      } else if (score.producerScore! < score.aviatorScore!) {
        producerWins++;
      } else {
        ties++;
      }
    }

    return {
      aviatorTotal,
      producerTotal,
      aviatorWins,
      producerWins,
      ties,
      validScores: validScores.length,
    };
  }, [scores]);

  // Calculate full 18 totals
  const fullTotals = useMemo(() => {
    let aviatorTotal = 0;
    let producerTotal = 0;
    let aviatorWins = 0;
    let producerWins = 0;
    let ties = 0;

    // Use filled scores
    const validScores = scores.filter(
      (s) => s.aviatorScore !== null && s.producerScore !== null
    );

    for (const score of validScores) {
      aviatorTotal += score.aviatorScore!;
      producerTotal += score.producerScore!;

      if (score.aviatorScore! < score.producerScore!) {
        aviatorWins++;
      } else if (score.producerScore! < score.aviatorScore!) {
        producerWins++;
      } else {
        ties++;
      }
    }

    return {
      aviatorTotal,
      producerTotal,
      aviatorWins,
      producerWins,
      ties,
      validScores: validScores.length,
    };
  }, [scores]);

  // Get the current match status (who's ahead, etc)
  const getMatchStatus = () => {
    let aviatorWins = 0;
    let producerWins = 0;

    // Sort scores by hole number to find match conclusion
    const sortedScores = [...scores].sort((a, b) => a.holeNumber - b.holeNumber);

    // Count aviator wins vs producer wins
    for (const score of sortedScores) {
      if (score.aviatorScore! < score.producerScore!) {
        aviatorWins++;
      } else if (score.producerScore! < score.aviatorScore!) {
        producerWins++;
      }

      const lead = Math.abs(aviatorWins - producerWins);
      const holesRemaining = 18 - score.holeNumber;

      // Check if match is mathematically decided
      if (lead > holesRemaining) {
        // One team has clinched the match
        return {
          status: "completed",
          winner: aviatorWins > producerWins ? "aviator" : "producer",
          finalScore: lead,
          finalHole: score.holeNumber,
        };
      }
    }

    // Match is still in progress or all square after 18
    if (sortedScores.length === 18) {
      if (aviatorWins === producerWins) {
        return {
          status: "completed",
          winner: "tie",
          finalScore: 0,
          finalHole: 18,
        };
      } else {
        return {
          status: "completed",
          winner: aviatorWins > producerWins ? "aviator" : "producer",
          finalScore: Math.abs(aviatorWins - producerWins),
          finalHole: 18,
        };
      }
    }

    // Match is still in progress
    return {
      status: "in_progress",
      aviatorWins,
      producerWins,
      holesPlayed: sortedScores.length,
    };
  };

  // Calculate which team is leading the match
  const getMatchResult = () => {
    let aviatorWins = 0;
    let producerWins = 0;

    // Count team wins
    for (const score of scores) {
      if (score.aviatorScore! < score.producerScore!) {
        aviatorWins++;
      } else if (score.producerScore! < score.aviatorScore!) {
        producerWins++;
      }
    }

    const lead = Math.abs(aviatorWins - producerWins);

    if (lead === 0) {
      return { text: "AS", color: "text-gray-400" }; // All Square in light grey
    } else if (aviatorWins > producerWins) {
      return { text: `${lead}↑`, color: "text-aviator font-bold" }; // Aviators up, bold text
    } else {
      return { text: `${lead}↑`, color: "text-producer font-bold" }; // Producers up, bold text
    }
  };

  // Calculate front nine score difference
  const getFrontDiff = () => {
    if (frontNineTotals.validScores === 0) return null;

    if (frontNineTotals.aviatorTotal < frontNineTotals.producerTotal) {
      return {
        text: `Aviators: -${frontNineTotals.producerTotal - frontNineTotals.aviatorTotal}`,
        color: "text-aviator",
      };
    } else if (frontNineTotals.producerTotal < frontNineTotals.aviatorTotal) {
      return {
        text: `Producers: -${frontNineTotals.aviatorTotal - frontNineTotals.producerTotal}`,
        color: "text-producer",
      };
    } else {
      return { text: "Even", color: "text-gray-500" };
    }
  };

  // Calculate back nine score difference
  const getBackDiff = () => {
    if (backNineTotals.validScores === 0) return null;

    if (backNineTotals.aviatorTotal < backNineTotals.producerTotal) {
      return {
        text: `Aviators: -${backNineTotals.producerTotal - backNineTotals.aviatorTotal}`,
        color: "text-aviator",
      };
    } else if (backNineTotals.producerTotal < backNineTotals.aviatorTotal) {
      return {
        text: `Producers: -${backNineTotals.aviatorTotal - backNineTotals.producerTotal}`,
        color: "text-producer",
      };
    } else {
      return { text: "Even", color: "text-gray-500" };
    }
  };

  // Calculate total score difference
  const getTotalDiff = () => {
    if (fullTotals.validScores === 0) return null;

    if (fullTotals.aviatorTotal < fullTotals.producerTotal) {
      return {
        text: `Aviators: -${fullTotals.producerTotal - fullTotals.aviatorTotal}`,
        color: "text-aviator",
      };
    } else if (fullTotals.producerTotal < fullTotals.aviatorTotal) {
      return {
        text: `Producers: -${fullTotals.aviatorTotal - fullTotals.producerTotal}`,
        color: "text-producer",
      };
    } else {
      return { text: "Even", color: "text-gray-500" };
    }
  };

  // Helper to get the score for a specific hole
  const getScore = (holeNumber: number) => {
    return scores.find((s) => s.holeNumber === holeNumber) || {
      id: 0,
      matchId,
      holeNumber,
      aviatorScore: null,
      producerScore: null,
      winningTeam: null,
      matchStatus: "in_progress",
    };
  };

  // Calculate total par for the front nine
  const parFrontNine = useMemo(() => {
    return holes
      .filter((h) => h.number <= 9)
      .reduce((total, hole) => total + hole.par, 0);
  }, [holes]);

  // Calculate total par for the back nine
  const parBackNine = useMemo(() => {
    return holes
      .filter((h) => h.number > 9)
      .reduce((total, hole) => total + hole.par, 0);
  }, [holes]);

  // Calculate total par for all 18 holes
  const parTotal = useMemo(() => {
    return holes.reduce((total, hole) => total + hole.par, 0);
  }, [holes]);

  // Handle score input change
  const handleScoreChange = (
    target: HTMLInputElement,
    holeNumber: number,
    team: string,
    player: string | null = null
  ) => {
    // Only update scores if match isn't locked and user has permission
    if (locked || !canEditScores) return;

    const value = target.value.trim();
    let score: number | null = null;

    if (value !== "") {
      score = parseInt(value);
      if (isNaN(score)) return; // Invalid input
    }

    // Handle different match types
    if (isBestBall && player) {
      // For Best Ball, track individual player scores
      handleBestBallScoreChange(holeNumber, player, score, team);
    } else {
      // For other match types, update team scores directly
      const currentScore = getScore(holeNumber);
      const updatedScore = {
        ...currentScore,
        [team === "aviator" ? "aviatorScore" : "producerScore"]: score,
      };

      // Update the parent component
      onScoreUpdate(
        holeNumber,
        updatedScore.aviatorScore,
        updatedScore.producerScore
      );
    }
  };

  // Handle individual player score changes in Best Ball matches
  const handleBestBallScoreChange = async (
    holeNumber: number,
    playerName: string,
    score: number | null,
    team: string
  ) => {
    if (locked || !canEditScores) return;

    try {
      // First, find the player record
      const player = [...aviatorPlayersList, ...producerPlayersList].find(
        (p) => p.name === playerName
      );
      if (!player) {
        console.error(`Player not found: ${playerName}`);
        return;
      }

      // Create a copy of current scores Map
      const newPlayerScores = new Map(playerScores);

      // Get player's handicap strokes
      const handicapStrokes = player.handicapIndex 
        ? Math.round(player.handicapIndex) 
        : await getHandicapStrokes(player.id, holeNumber) || 0;

      // Calculate net score
      const netScore = score !== null ? score - handicapStrokes : null;

      // Update player's individual score
      const playerKey = `${holeNumber}-${playerName}`;
      const playerScoreObj: BestBallPlayerScore = {
        player: playerName,
        score,
        teamId: team,
        playerId: player.id,
        handicapStrokes,
        netScore,
      };

      newPlayerScores.set(playerKey, [playerScoreObj]);

      // Update team scores too
      const teamKey = `${holeNumber}-${team}`;
      let teamScores = newPlayerScores.get(teamKey) || [];
      const playerIndex = teamScores.findIndex((p) => p.player === playerName);

      if (playerIndex >= 0) {
        // Update existing player
        teamScores[playerIndex] = playerScoreObj;
      } else {
        // Add new player
        teamScores.push(playerScoreObj);
      }
      newPlayerScores.set(teamKey, teamScores);

      // Update state
      setPlayerScores(newPlayerScores);

      // Save to the database
      if (score !== null) {
        try {
          // Save player score
          savePlayerScoreMutation.mutate({
            playerId: player.id,
            matchId,
            holeNumber,
            score,
            tournamentId: matchData?.tournamentId,
          });

          // Save best ball score too
          const bestBallResponse = await fetch('/api/best-ball-scores', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              playerId: player.id,
              matchId,
              holeNumber,
              score,
              handicapStrokes,
              netScore,
              tournamentId: matchData?.tournamentId,
            }),
          });

          if (!bestBallResponse.ok) {
            console.error('Failed to save best ball score');
          }
        } catch (error) {
          console.error('Error saving player score:', error);
          // Continue despite error - we'll at least have the score in local state
          // This ensures score displays even if save fails
        }
      }

      // Calculate the best score for each team and update the match
      updateBestBallScores(holeNumber, newPlayerScores);

      setTimeout(() => {
        // Refetch all scores to ensure we're showing latest data
        queryClient.invalidateQueries({ queryKey: [`/api/player-scores?matchId=${matchId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/best-ball-scores/${matchId}`] });
      }, 100);
    } catch (error) {
      console.error("Error updating best ball score:", error);
    }
  };

  // Calculate which player is the best score for a hole
  const isLowestScore = (
    holeNumber: number,
    playerName: string,
    team: string
  ): boolean => {
    if (!isBestBall) return false;

    const teamKey = `${holeNumber}-${team}`;
    const teamScores = playerScores.get(teamKey) || [];

    if (teamScores.length <= 1) return true; // If only one player, they are the best

    // Find this player's score
    const playerScore = teamScores.find((s) => s.player === playerName);
    if (!playerScore || playerScore.score === null) return false;

    // If using handicaps, compare net scores
    if (playerScore.handicapStrokes !== undefined) {
      const netScore = playerScore.netScore;
      if (netScore === null) return false;

      // Find lowest net score for this team
      const lowestNetScore = Math.min(
        ...teamScores
          .filter((s) => s.netScore !== null)
          .map((s) => s.netScore || Infinity)
      );
      
      // This player is the lowest if their net score equals the team's lowest
      return netScore === lowestNetScore;
    } else {
      // Not using handicaps, compare gross scores
      const lowestScore = Math.min(
        ...teamScores
          .filter((s) => s.score !== null)
          .map((s) => s.score || Infinity)
      );
      return playerScore.score === lowestScore;
    }
  };

  return (
    <div className="pb-10">
      <div className="max-w-full overflow-x-auto">
        <table className="min-w-full text-xs md:text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300">
              <th className="py-2 px-1 md:px-2 text-left font-medium bg-gray-100 border-r border-gray-300 sticky left-0 z-10">
                <div className="mr-2 flex md:flex-row flex-col items-start md:items-center">
                  <div
                    className={`text-aviator font-bold text-lg mr-4 flex-shrink-0`}
                  >
                    {frontNineTotals.aviatorWins + backNineTotals.aviatorWins}
                  </div>
                  <div className="text-left md:text-center">
                    <div className="font-bold">The Aviators</div>
                    {isBestBall && (
                      <div className="text-xs text-gray-600">
                        <div className="text-left flex flex-wrap gap-1">
                          {aviatorPlayersList.map((player) => (
                            <div
                              key={player.id}
                              className="flex items-center text-xs md:text-sm"
                            >
                              <span className="text-left truncate max-w-[80px] md:max-w-none">
                                {player.name}
                              </span>
                              {isAdmin && playerHandicaps.length > 0 && (
                                <button
                                  className="ml-1 text-gray-500 text-xs"
                                  onClick={() =>
                                    handleHandicapEdit(
                                      player.id,
                                      getPlayerCourseHandicap(player.id)
                                    )
                                  }
                                >
                                  ({getPlayerCourseHandicap(player.id)})
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </th>
              {/* Hole numbers */}
              {frontNine.map((hole) => (
                <th
                  key={hole.id}
                  className="px-2 py-1 text-center bg-gray-200 border-r border-gray-300"
                >
                  {hole.number}
                </th>
              ))}
              <th className="px-2 py-1 text-center font-bold bg-gray-300 border-r-2 border-gray-600">
                F9
              </th>
              {backNine.map((hole) => (
                <th
                  key={hole.id}
                  className="px-2 py-1 text-center bg-gray-200 border-r border-gray-300"
                >
                  {hole.number}
                </th>
              ))}
              <th className="px-2 py-1 text-center font-bold bg-gray-300 border-r-2 border-gray-600">
                B9
              </th>
              <th className="px-2 py-1 text-center font-bold bg-gray-400">
                TOT
              </th>
            </tr>
            <tr className="border-b border-gray-300">
              <th className="py-1 px-1 md:px-2 text-left font-medium bg-gray-50 border-r border-gray-300 sticky left-0 z-10">
                Par
              </th>
              {/* Front nine pars */}
              {frontNine.map((hole) => (
                <td
                  key={hole.id}
                  className="px-2 py-1 text-center bg-gray-50 border-r border-gray-200"
                >
                  {hole.par}
                </td>
              ))}
              <td className="px-2 py-1 text-center font-semibold bg-gray-100 border-r-2 border-gray-600">
                {parFrontNine}
              </td>
              {/* Back nine pars */}
              {backNine.map((hole) => (
                <td
                  key={hole.id}
                  className="px-2 py-1 text-center bg-gray-50 border-r border-gray-200"
                >
                  {hole.par}
                </td>
              ))}
              <td className="px-2 py-1 text-center font-semibold bg-gray-100 border-r-2 border-gray-600">
                {parBackNine}
              </td>
              <td className="px-2 py-1 text-center font-semibold bg-gray-200">
                {parTotal}
              </td>
            </tr>
          </thead>
          <tbody>
            {/* Aviator scores */}
            <tr className="border-b border-gray-300 bg-aviator-100">
              <th className="py-2 px-1 md:px-2 text-left font-medium border-r bg-gray-100 border-gray-300 sticky left-0 z-10">
                {!isBestBall && (
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Aviators Score</span>
                    <span className={getMatchResult().color}>
                      {getMatchResult().text}
                    </span>
                  </div>
                )}
              </th>
              {/* Front nine scores */}
              {frontNine.map((hole) => {
                const score = getScore(hole.number);
                const isAviatorWinner =
                  score.aviatorScore !== null &&
                  score.producerScore !== null &&
                  score.aviatorScore < score.producerScore;
                return (
                  <td
                    key={hole.id}
                    className={`px-2 py-1 text-center border-r border-gray-200 ${
                      isAviatorWinner
                        ? "bg-aviator-300 font-bold"
                        : "bg-aviator-100"
                    }`}
                  >
                    {!isBestBall && (
                      <input
                        type="text"
                        value={score.aviatorScore !== null ? score.aviatorScore : ""}
                        onChange={(e) =>
                          handleScoreChange(e.target, hole.number, "aviator")
                        }
                        disabled={locked || !canEditScores}
                        className={`w-8 text-center ${
                          locked || !canEditScores
                            ? "bg-transparent border-none"
                            : "border border-gray-300 rounded"
                        }`}
                      />
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-center font-semibold bg-gray-100 border-r-2 border-gray-600">
                {frontNineTotals.validScores > 0
                  ? frontNineTotals.aviatorTotal
                  : ""}
              </td>
              {/* Back nine scores */}
              {backNine.map((hole) => {
                const score = getScore(hole.number);
                const isAviatorWinner =
                  score.aviatorScore !== null &&
                  score.producerScore !== null &&
                  score.aviatorScore < score.producerScore;
                return (
                  <td
                    key={hole.id}
                    className={`px-2 py-1 text-center border-r border-gray-200 ${
                      isAviatorWinner
                        ? "bg-aviator-300 font-bold"
                        : "bg-aviator-100"
                    }`}
                  >
                    {!isBestBall && (
                      <input
                        type="text"
                        value={score.aviatorScore !== null ? score.aviatorScore : ""}
                        onChange={(e) =>
                          handleScoreChange(e.target, hole.number, "aviator")
                        }
                        disabled={locked || !canEditScores}
                        className={`w-8 text-center ${
                          locked || !canEditScores
                            ? "bg-transparent border-none"
                            : "border border-gray-300 rounded"
                        }`}
                      />
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-center font-semibold bg-gray-100 border-r-2 border-gray-600">
                {backNineTotals.validScores > 0 ? backNineTotals.aviatorTotal : ""}
              </td>
              <td className="px-2 py-1 text-center font-bold bg-gray-200">
                {fullTotals.validScores > 0 ? fullTotals.aviatorTotal : ""}
              </td>
            </tr>

            {/* Individual aviator player scores for Best Ball */}
            {isBestBall &&
              aviatorPlayersList.map((player) => (
                <tr
                  key={player.id}
                  className="border-b border-gray-300 bg-aviator-50"
                >
                  <th className="py-1 px-1 md:px-2 text-left font-medium bg-gray-100 border-r border-gray-300 sticky left-0 z-10">
                    <div className="text-sm flex justify-between items-center">
                      <span>
                        {player.name}
                        {player.handicapIndex && (
                          <span className="ml-1 text-gray-500 text-xs">
                            ({getPlayerCourseHandicap(player.id)})
                          </span>
                        )}
                      </span>
                      <span className={getMatchResult().color}>
                        {getMatchResult().text}
                      </span>
                    </div>
                  </th>
                  {/* Front nine player scores */}
                  {frontNine.map((hole) => {
                    const key = `${hole.number}-${player.name}`;
                    const playerScoreArray = playerScores.get(key) || [];
                    const playerScoreObj = playerScoreArray[0] || {
                      score: null,
                      handicapStrokes: 0,
                    };
                    const isLowest = isLowestScore(
                      hole.number,
                      player.name,
                      "aviator"
                    );
                    const handicapStrokes = playerScoreObj.handicapStrokes || 0;

                    return (
                      <td
                        key={hole.id}
                        className={`px-1 py-1 text-center border-r border-gray-200 relative ${
                          isLowest
                            ? "bg-aviator-300 font-bold"
                            : "bg-aviator-50"
                        }`}
                      >
                        {/* Handicap dot indicator for strokes */}
                        {handicapStrokes > 0 && (
                          <div
                            className="absolute top-0 right-0 rounded-full bg-blue-500"
                            style={{
                              width: "6px",
                              height: "6px",
                              marginTop: "2px",
                              marginRight: "2px",
                            }}
                            title={`${player.name} gets ${handicapStrokes} stroke(s) on this hole`}
                          ></div>
                        )}
                        <input
                          type="text"
                          value={
                            playerScoreObj.score !== null
                              ? playerScoreObj.score
                              : ""
                          }
                          onChange={(e) =>
                            handleScoreChange(
                              e.target,
                              hole.number,
                              "aviator",
                              player.name
                            )
                          }
                          disabled={locked || !canEditScores}
                          className={`w-8 text-center ${
                            locked || !canEditScores
                              ? "bg-transparent border-none"
                              : "border border-gray-300 rounded"
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center bg-gray-100 border-r-2 border-gray-600"></td>
                  {/* Back nine player scores */}
                  {backNine.map((hole) => {
                    const key = `${hole.number}-${player.name}`;
                    const playerScoreArray = playerScores.get(key) || [];
                    const playerScoreObj = playerScoreArray[0] || {
                      score: null,
                      handicapStrokes: 0,
                    };
                    const isLowest = isLowestScore(
                      hole.number,
                      player.name,
                      "aviator"
                    );
                    const handicapStrokes = playerScoreObj.handicapStrokes || 0;

                    return (
                      <td
                        key={hole.id}
                        className={`px-1 py-1 text-center border-r border-gray-200 relative ${
                          isLowest
                            ? "bg-aviator-300 font-bold"
                            : "bg-aviator-50"
                        }`}
                      >
                        {/* Handicap dot indicator for strokes */}
                        {handicapStrokes > 0 && (
                          <div
                            className="absolute top-0 right-0 rounded-full bg-blue-500"
                            style={{
                              width: "6px",
                              height: "6px",
                              marginTop: "2px",
                              marginRight: "2px",
                            }}
                            title={`${player.name} gets ${handicapStrokes} stroke(s) on this hole`}
                          ></div>
                        )}
                        <input
                          type="text"
                          value={
                            playerScoreObj.score !== null
                              ? playerScoreObj.score
                              : ""
                          }
                          onChange={(e) =>
                            handleScoreChange(
                              e.target,
                              hole.number,
                              "aviator",
                              player.name
                            )
                          }
                          disabled={locked || !canEditScores}
                          className={`w-8 text-center ${
                            locked || !canEditScores
                              ? "bg-transparent border-none"
                              : "border border-gray-300 rounded"
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center bg-gray-100 border-r-2 border-gray-600"></td>
                  <td className="px-2 py-1 text-center bg-gray-200"></td>
                </tr>
              ))}

            {/* Producer scores */}
            <tr className="border-b border-gray-300 bg-producer-100">
              <th className="py-2 px-1 md:px-2 text-left font-medium border-r bg-gray-100 border-gray-300 sticky left-0 z-10">
                {!isBestBall && (
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Producers Score</span>
                  </div>
                )}
              </th>
              {/* Front nine scores */}
              {frontNine.map((hole) => {
                const score = getScore(hole.number);
                const isProducerWinner =
                  score.aviatorScore !== null &&
                  score.producerScore !== null &&
                  score.producerScore < score.aviatorScore;
                return (
                  <td
                    key={hole.id}
                    className={`px-2 py-1 text-center border-r border-gray-200 ${
                      isProducerWinner
                        ? "bg-producer-300 font-bold"
                        : "bg-producer-100"
                    }`}
                  >
                    {!isBestBall && (
                      <input
                        type="text"
                        value={
                          score.producerScore !== null ? score.producerScore : ""
                        }
                        onChange={(e) =>
                          handleScoreChange(e.target, hole.number, "producer")
                        }
                        disabled={locked || !canEditScores}
                        className={`w-8 text-center ${
                          locked || !canEditScores
                            ? "bg-transparent border-none"
                            : "border border-gray-300 rounded"
                        }`}
                      />
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-center font-semibold bg-gray-100 border-r-2 border-gray-600">
                {frontNineTotals.validScores > 0
                  ? frontNineTotals.producerTotal
                  : ""}
              </td>
              {/* Back nine scores */}
              {backNine.map((hole) => {
                const score = getScore(hole.number);
                const isProducerWinner =
                  score.aviatorScore !== null &&
                  score.producerScore !== null &&
                  score.producerScore < score.aviatorScore;
                return (
                  <td
                    key={hole.id}
                    className={`px-2 py-1 text-center border-r border-gray-200 ${
                      isProducerWinner
                        ? "bg-producer-300 font-bold"
                        : "bg-producer-100"
                    }`}
                  >
                    {!isBestBall && (
                      <input
                        type="text"
                        value={
                          score.producerScore !== null ? score.producerScore : ""
                        }
                        onChange={(e) =>
                          handleScoreChange(e.target, hole.number, "producer")
                        }
                        disabled={locked || !canEditScores}
                        className={`w-8 text-center ${
                          locked || !canEditScores
                            ? "bg-transparent border-none"
                            : "border border-gray-300 rounded"
                        }`}
                      />
                    )}
                  </td>
                );
              })}
              <td className="px-2 py-1 text-center font-semibold bg-gray-100 border-r-2 border-gray-600">
                {backNineTotals.validScores > 0
                  ? backNineTotals.producerTotal
                  : ""}
              </td>
              <td className="px-2 py-1 text-center font-bold bg-gray-200">
                {fullTotals.validScores > 0 ? fullTotals.producerTotal : ""}
              </td>
            </tr>

            {/* Individual producer player scores for Best Ball */}
            {isBestBall &&
              producerPlayersList.map((player) => (
                <tr
                  key={player.id}
                  className="border-b border-gray-300 bg-producer-50"
                >
                  <th className="py-1 px-1 md:px-2 text-left font-medium bg-gray-100 border-r border-gray-300 sticky left-0 z-10">
                    <div className="text-sm">
                      {player.name}
                      {player.handicapIndex && (
                        <span className="ml-1 text-gray-500 text-xs">
                          ({getPlayerCourseHandicap(player.id)})
                        </span>
                      )}
                    </div>
                  </th>
                  {/* Front nine player scores */}
                  {frontNine.map((hole) => {
                    const key = `${hole.number}-${player.name}`;
                    const playerScoreArray = playerScores.get(key) || [];
                    const playerScoreObj = playerScoreArray[0] || {
                      score: null,
                      handicapStrokes: 0,
                    };
                    const isLowest = isLowestScore(
                      hole.number,
                      player.name,
                      "producer"
                    );
                    const handicapStrokes = playerScoreObj.handicapStrokes || 0;

                    return (
                      <td
                        key={hole.id}
                        className={`px-1 py-1 text-center border-r border-gray-200 relative ${
                          isLowest
                            ? "bg-producer-300 font-bold"
                            : "bg-producer-50"
                        }`}
                      >
                        {/* Handicap dot indicator for strokes */}
                        {handicapStrokes > 0 && (
                          <div
                            className="absolute top-0 right-0 rounded-full bg-blue-500"
                            style={{
                              width: "6px",
                              height: "6px",
                              marginTop: "2px",
                              marginRight: "2px",
                            }}
                            title={`${player.name} gets ${handicapStrokes} stroke(s) on this hole`}
                          ></div>
                        )}
                        <input
                          type="text"
                          value={
                            playerScoreObj.score !== null
                              ? playerScoreObj.score
                              : ""
                          }
                          onChange={(e) =>
                            handleScoreChange(
                              e.target,
                              hole.number,
                              "producer",
                              player.name
                            )
                          }
                          disabled={locked || !canEditScores}
                          className={`w-8 text-center ${
                            locked || !canEditScores
                              ? "bg-transparent border-none"
                              : "border border-gray-300 rounded"
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center bg-gray-100 border-r-2 border-gray-600"></td>
                  {/* Back nine player scores */}
                  {backNine.map((hole) => {
                    const key = `${hole.number}-${player.name}`;
                    const playerScoreArray = playerScores.get(key) || [];
                    const playerScoreObj = playerScoreArray[0] || {
                      score: null,
                      handicapStrokes: 0,
                    };
                    const isLowest = isLowestScore(
                      hole.number,
                      player.name,
                      "producer"
                    );
                    const handicapStrokes = playerScoreObj.handicapStrokes || 0;

                    return (
                      <td
                        key={hole.id}
                        className={`px-1 py-1 text-center border-r border-gray-200 relative ${
                          isLowest
                            ? "bg-producer-300 font-bold"
                            : "bg-producer-50"
                        }`}
                      >
                        {/* Handicap dot indicator for strokes */}
                        {handicapStrokes > 0 && (
                          <div
                            className="absolute top-0 right-0 rounded-full bg-blue-500"
                            style={{
                              width: "6px",
                              height: "6px",
                              marginTop: "2px",
                              marginRight: "2px",
                            }}
                            title={`${player.name} gets ${handicapStrokes} stroke(s) on this hole`}
                          ></div>
                        )}
                        <input
                          type="text"
                          value={
                            playerScoreObj.score !== null
                              ? playerScoreObj.score
                              : ""
                          }
                          onChange={(e) =>
                            handleScoreChange(
                              e.target,
                              hole.number,
                              "producer",
                              player.name
                            )
                          }
                          disabled={locked || !canEditScores}
                          className={`w-8 text-center ${
                            locked || !canEditScores
                              ? "bg-transparent border-none"
                              : "border border-gray-300 rounded"
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-center bg-gray-100 border-r-2 border-gray-600"></td>
                  <td className="px-2 py-1 text-center bg-gray-200"></td>
                </tr>
              ))}

            {/* Score difference row */}
            <tr className="border-b-2 border-gray-600 bg-gray-100">
              <th className="py-2 px-1 md:px-2 text-left font-semibold bg-gray-200 border-r border-gray-300 sticky left-0 z-10">
                Difference
              </th>
              {frontNine.map((hole) => {
                const score = getScore(hole.number);
                let diff: string | number | null = null;
                let color = "text-gray-400";

                if (
                  score.aviatorScore !== null &&
                  score.producerScore !== null
                ) {
                  diff = Math.abs(score.aviatorScore - score.producerScore);
                  if (score.aviatorScore < score.producerScore) {
                    color = "text-aviator font-bold";
                  } else if (score.producerScore < score.aviatorScore) {
                    color = "text-producer font-bold";
                  }
                }

                return (
                  <td
                    key={hole.id}
                    className={`px-2 py-1 text-center ${color} bg-gray-100 border-r border-gray-200`}
                  >
                    {diff !== null ? diff : ""}
                  </td>
                );
              })}
              <td
                className={`px-2 py-1 text-center font-semibold border-r-2 border-gray-600 ${
                  getFrontDiff()?.color || ""
                }`}
              >
                {getFrontDiff() ? <>{getFrontDiff()!.text}</> : ""}
              </td>
              {backNine.map((hole) => {
                const score = getScore(hole.number);
                let diff: string | number | null = null;
                let color = "text-gray-400";

                if (
                  score.aviatorScore !== null &&
                  score.producerScore !== null
                ) {
                  diff = Math.abs(score.aviatorScore - score.producerScore);
                  if (score.aviatorScore < score.producerScore) {
                    color = "text-aviator font-bold";
                  } else if (score.producerScore < score.aviatorScore) {
                    color = "text-producer font-bold";
                  }
                }

                return (
                  <td
                    key={hole.id}
                    className={`px-2 py-1 text-center ${color} bg-gray-100 border-r border-gray-200`}
                  >
                    {diff !== null ? diff : ""}
                  </td>
                );
              })}
              <td
                className={`px-2 py-1 text-center font-semibold border-r-2 border-gray-600 ${
                  getBackDiff()?.color || ""
                }`}
              >
                {getBackDiff() ? <>{getBackDiff()!.text}</> : ""}
              </td>
              <td
                className={`px-2 py-1 text-center font-bold ${
                  getTotalDiff()?.color || ""
                }`}
              >
                {getTotalDiff() ? <>{getTotalDiff()!.text}</> : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EnhancedMatchScorecard;
