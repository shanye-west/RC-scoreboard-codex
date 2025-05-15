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
    // Get scores for this hole
    const key1 = `${holeNumber}-aviator`;
    const key2 = `${holeNumber}-producer`;
    
    const aviatorHoleScores = currentScores.get(key1) || [];
    const producerHoleScores = currentScores.get(key2) || [];
    
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
      // Collect all player scores for this hole
      const playerScoresForHole: BestBallPlayerScore[] = [];
      
      // Add all player scores to the array
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

  // Helper function to score inputs
  const handleScoreInputChange = (
    target: HTMLInputElement,
    holeNumber: number,
    isAviators: boolean = true
  ) => {
    if (locked) return;

    const value = target.value.trim();
    let score: number | null = null;

    // Convert value to number or null
    if (value !== "") {
      score = parseInt(value);
      if (isNaN(score)) return; // Invalid input
    }

    // Update score
    onScoreUpdate(
      holeNumber,
      isAviators ? score : getScore(holeNumber).aviatorScore,
      isAviators ? getScore(holeNumber).producerScore : score
    );

    // Unfocus after input
    setTimeout(() => {
      if (document.activeElement === target) {
        target.blur();
      }
    }, 100);
  };

  const generateMatchStatus = (
    holeNumber: number
  ): { status: string; color: string } => {
    // Get score for this specific hole
    const thisHoleScore = scores.find((s) => s.holeNumber === holeNumber);

    // Find scores up to and including this hole
    const completedScores = scores
      .filter(
        (s) =>
          s.holeNumber <= holeNumber &&
          s.aviatorScore !== null &&
          s.producerScore !== null,
      )
      .sort((a, b) => a.holeNumber - b.holeNumber);

    if (completedScores.length === 0)
      return { status: "", color: "text-gray-400" };

    // Count wins for each team
    let aviatorWins = 0;
    let producerWins = 0;

    for (const score of completedScores) {
      if (score.aviatorScore! < score.producerScore!) {
        aviatorWins++;
      } else if (score.producerScore! < score.aviatorScore!) {
        producerWins++;
      }
    }

    const lead = Math.abs(aviatorWins - producerWins);

    // Return the match status for this hole
    if (lead === 0) {
      return { status: "AS", color: "text-gray-400" }; // All Square
    } else if (aviatorWins > producerWins) {
      return {
        status: `A${lead}`,
        color: "text-aviator font-bold",
      }; // Aviators lead
    } else {
      return {
        status: `P${lead}`,
        color: "text-producer font-bold",
      }; // Producers lead
    }
  };

  // Calculate totals for the front 9
  const frontNineTotals = useMemo(() => {
    let aviatorTotal = 0;
    let producerTotal = 0;

    for (let i = 1; i <= 9; i++) {
      const hole = holes.find((h) => h.number === i);
      const score = getScore(i);

      if (score.aviatorScore !== null) {
        aviatorTotal += score.aviatorScore;
      }

      if (score.producerScore !== null) {
        producerTotal += score.producerScore;
      }
    }

    return { aviatorTotal, producerTotal };
  }, [holes, scores]);

  // Calculate totals for the back 9
  const backNineTotals = useMemo(() => {
    let aviatorTotal = 0;
    let producerTotal = 0;

    for (let i = 10; i <= 18; i++) {
      const hole = holes.find((h) => h.number === i);
      const score = getScore(i);

      if (score.aviatorScore !== null) {
        aviatorTotal += score.aviatorScore;
      }

      if (score.producerScore !== null) {
        producerTotal += score.producerScore;
      }
    }

    return { aviatorTotal, producerTotal };
  }, [holes, scores]);

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

  // Check if a player's score is the lowest for their team on a hole
  const isLowestScore = (
    holeNumber: number,
    playerName: string,
    teamType: string
  ): boolean => {
    if (!isBestBall) return false;

    const key = `${holeNumber}-${playerName}`;
    const holeScores = playerScores.get(key) || [];

    if (holeScores.length === 0 || !holeScores[0].score) {
      return false;
    }

    // Find all players from this team with scores for this hole
    const currentPlayerScoreObj = holeScores.find(
      (s) => s.player === playerName
    );

    if (!currentPlayerScoreObj || currentPlayerScoreObj.score === null) {
      return false;
    }

    // Get the team key
    const teamKey = `${holeNumber}-${teamType}`;
    const teamScores = playerScores.get(teamKey) || [];

    // For Best Ball match with handicaps, we need to compare net scores
    if (isBestBall && currentPlayerScoreObj.handicapStrokes !== undefined) {
      const currentPlayerScore = currentPlayerScoreObj.score;
      const currentPlayerHandicapStrokes = currentPlayerScoreObj.handicapStrokes || 0;
      const currentPlayerNetScore = currentPlayerScore - currentPlayerHandicapStrokes;

      // Find the minimum net score among team players
      let minNetScore = currentPlayerNetScore;
      for (const playerScore of teamScores) {
        if (playerScore.player !== playerName && playerScore.score !== null) {
          const netScore = playerScore.score - (playerScore.handicapStrokes || 0);
          if (netScore < minNetScore) {
            return false; // This player doesn't have the lowest net score
          }
        }
      }

      return true; // This player has the lowest net score (might be tied)
    } else {
      // For non-handicap matches, compare gross scores
      const currentPlayerScore = currentPlayerScoreObj?.score;
      if (currentPlayerScore === null) return false;

      // Get all valid scores
      const validScores = teamScores
        .filter((s) => s.score !== null)
        .map((s) => s.score || Infinity);

      if (validScores.length === 0) return false;

      // Find minimum score
      const lowestScore = Math.min(...validScores);
      return currentPlayerScore === lowestScore;
    }
  };

  // Handle Best Ball score input changes
  const handleBestBallScoreChange = (
    target: HTMLInputElement,
    holeNumber: number,
    playerName: string,
    teamType: string
  ) => {
    if (locked || !canEditScores) return;

    const value = target.value.trim();
    let score: number | null = null;

    if (value !== "") {
      score = parseInt(value);
      if (isNaN(score)) return; // Invalid input
    }

    // Find player ID from name
    const allMatchPlayers = [...aviatorPlayersList, ...producerPlayersList];
    const player = allMatchPlayers.find((p) => p.name === playerName);

    if (!player) {
      console.error(`Player not found: ${playerName}`);
      return;
    }

    // Update player score in the state
    setPlayerScores((prevScores) => {
      const newPlayerScores = new Map(prevScores);

      // Get or create handicap strokes for this player on this hole
      let handicapStrokes = 0;
      if (isBestBall) {
        const existingScore = newPlayerScores.get(`${holeNumber}-${playerName}`);
        if (existingScore && existingScore[0]) {
          handicapStrokes = existingScore[0].handicapStrokes || 0;
        }
      }

      // Calculate net score
      const netScore = score !== null ? score - handicapStrokes : null;

      // Create player score object
      const playerScoreObj = {
        player: playerName,
        score,
        teamId: teamType,
        playerId: player.id,
        handicapStrokes,
        netScore,
      };

      // Set the player's score
      newPlayerScores.set(`${holeNumber}-${playerName}`, [playerScoreObj]);

      // Update team scores too
      const teamKey = `${holeNumber}-${teamType}`;
      let teamScores = newPlayerScores.get(teamKey) || [];
      const playerIndex = teamScores.findIndex((p) => p.player === playerName);

      if (playerIndex >= 0) {
        // Update existing player score in team array
        teamScores[playerIndex] = playerScoreObj;
      } else {
        // Add player score to team array
        teamScores.push(playerScoreObj);
      }
      newPlayerScores.set(teamKey, teamScores);

      // Calculate the best score for each team based on the updated player scores
      updateBestBallScores(holeNumber, newPlayerScores);

      return newPlayerScores;
    });

    // Save changes to database
    if (score !== null && player) {
      // Make API call to save player score to database
      savePlayerScoreMutation.mutate({
        playerId: player.id,
        matchId,
        holeNumber,
        score,
        tournamentId: matchData?.tournamentId,
      });

      // Additionally save best ball score
      (async () => {
        try {
          const bestBallResponse = await fetch("/api/best-ball-scores", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              playerId: player.id,
              matchId,
              holeNumber,
              score,
              handicapStrokes: 0, // Default to 0 if not calculated yet
              tournamentId: matchData?.tournamentId,
            }),
          });

          if (!bestBallResponse.ok) {
            console.error("Error saving best ball score");
          }
        } catch (error) {
          console.error("Error saving best ball score:", error);
        }
      })();
    }

    // Unfocus after input
    setTimeout(() => {
      if (document.activeElement === target) {
        target.blur();
      }
    }, 100);
  };

  return (
    <div className="scorecard-container">
      <div>
        {/* All 18 Holes in a single table with horizontal scrolling */}
        <div className="overflow-x-auto">
          <table className="scorecard-table">
            <thead>
              <tr>
                <th className="hole-label">Hole</th>
                {allHoles.map((hole) => (
                  <th key={hole.number} className="hole-number">
                    {hole.number}
                  </th>
                ))}
                <th className="totals-column">OUT</th>
                <th className="totals-column">IN</th>
                <th className="totals-column">TOT</th>
              </tr>
              <tr>
                <th className="hole-label">Par</th>
                {allHoles.map((hole) => (
                  <th key={hole.number} className="par-value">
                    {hole.par}
                  </th>
                ))}
                <th className="totals-column">
                  {frontNine.reduce((sum, hole) => sum + hole.par, 0)}
                </th>
                <th className="totals-column">
                  {backNine.reduce((sum, hole) => sum + hole.par, 0)}
                </th>
                <th className="totals-column">
                  {allHoles.reduce((sum, hole) => sum + hole.par, 0)}
                </th>
              </tr>
            </thead>
            <tbody>
              {/* For Best Ball, we show individual player scores */}
              {isBestBall ? (
                // Aviator players
                aviatorPlayersList.map((player) => (
                  <tr key={player.id} className="aviator-row">
                    <td className="player-name">
                      {player.name}
                      {player.handicapIndex && (
                        <span className="handicap-index">
                          ({getPlayerCourseHandicap(player.id)})
                        </span>
                      )}
                      {isAdmin && (
                        <button
                          className="edit-handicap"
                          onClick={() =>
                            handleHandicapEdit(
                              player.id,
                              getPlayerCourseHandicap(player.id)
                            )
                          }
                        >
                          ✎
                        </button>
                      )}
                    </td>
                    {allHoles.map((hole) => {
                      const key = `${hole.number}-${player.name}`;
                      const scoreList = playerScores.get(key) || [];
                      const playerScore = scoreList[0];
                      const isLowestForTeam = isLowestScore(
                        hole.number,
                        player.name,
                        "aviator"
                      );

                      return (
                        <td
                          key={hole.number}
                          className={`score-cell ${
                            isLowestForTeam ? "best-score" : ""
                          }`}
                        >
                          {/* Handicap dot indicator */}
                          {playerScore?.handicapStrokes ? (
                            <span
                              className="handicap-dot"
                              title={`${player.name} gets ${playerScore.handicapStrokes} stroke(s) on this hole`}
                            ></span>
                          ) : null}

                          <input
                            type="text"
                            value={playerScore?.score ?? ""}
                            onChange={(e) =>
                              handleBestBallScoreChange(
                                e.target,
                                hole.number,
                                player.name,
                                "aviator"
                              )
                            }
                            className="score-input"
                            disabled={locked || !canEditScores}
                          />
                        </td>
                      );
                    })}
                    <td className="totals-column">
                      {/* Front 9 total */}
                      {calculatePlayerTotal(player.name, 1, 9)}
                    </td>
                    <td className="totals-column">
                      {/* Back 9 total */}
                      {calculatePlayerTotal(player.name, 10, 18)}
                    </td>
                    <td className="totals-column">
                      {/* 18 hole total */}
                      {calculatePlayerTotal(player.name, 1, 18)}
                    </td>
                  </tr>
                ))
              ) : (
                // Regular match - just team scores for Aviators
                <tr className="aviator-row">
                  <td className="team-name">Aviators</td>
                  {allHoles.map((hole) => {
                    const score = getScore(hole.number);
                    const status = generateMatchStatus(hole.number);
                    
                    return (
                      <td
                        key={hole.number}
                        className={`score-cell ${
                          score.winningTeam === "aviator" ? "winning-score" : ""
                        }`}
                      >
                        <input
                          type="text"
                          value={score.aviatorScore ?? ""}
                          onChange={(e) =>
                            handleScoreInputChange(e.target, hole.number, true)
                          }
                          className="score-input"
                          disabled={locked || !canEditScores}
                        />
                        <span className={`match-status ${status.color}`}>
                          {status.status}
                        </span>
                      </td>
                    );
                  })}
                  <td className="totals-column">{frontNineTotals.aviatorTotal}</td>
                  <td className="totals-column">{backNineTotals.aviatorTotal}</td>
                  <td className="totals-column">
                    {frontNineTotals.aviatorTotal + backNineTotals.aviatorTotal}
                  </td>
                </tr>
              )}

              {/* Producer players for Best Ball */}
              {isBestBall ? (
                producerPlayersList.map((player) => (
                  <tr key={player.id} className="producer-row">
                    <td className="player-name">
                      {player.name}
                      {player.handicapIndex && (
                        <span className="handicap-index">
                          ({getPlayerCourseHandicap(player.id)})
                        </span>
                      )}
                      {isAdmin && (
                        <button
                          className="edit-handicap"
                          onClick={() =>
                            handleHandicapEdit(
                              player.id,
                              getPlayerCourseHandicap(player.id)
                            )
                          }
                        >
                          ✎
                        </button>
                      )}
                    </td>
                    {allHoles.map((hole) => {
                      const key = `${hole.number}-${player.name}`;
                      const scoreList = playerScores.get(key) || [];
                      const playerScore = scoreList[0];
                      const isLowestForTeam = isLowestScore(
                        hole.number,
                        player.name,
                        "producer"
                      );

                      return (
                        <td
                          key={hole.number}
                          className={`score-cell ${
                            isLowestForTeam ? "best-score" : ""
                          }`}
                        >
                          {/* Handicap dot indicator */}
                          {playerScore?.handicapStrokes ? (
                            <span
                              className="handicap-dot"
                              title={`${player.name} gets ${playerScore.handicapStrokes} stroke(s) on this hole`}
                            ></span>
                          ) : null}

                          <input
                            type="text"
                            value={playerScore?.score ?? ""}
                            onChange={(e) =>
                              handleBestBallScoreChange(
                                e.target,
                                hole.number,
                                player.name,
                                "producer"
                              )
                            }
                            className="score-input"
                            disabled={locked || !canEditScores}
                          />
                        </td>
                      );
                    })}
                    <td className="totals-column">
                      {calculatePlayerTotal(player.name, 1, 9)}
                    </td>
                    <td className="totals-column">
                      {calculatePlayerTotal(player.name, 10, 18)}
                    </td>
                    <td className="totals-column">
                      {calculatePlayerTotal(player.name, 1, 18)}
                    </td>
                  </tr>
                ))
              ) : (
                // Regular match - just team scores for Producers
                <tr className="producer-row">
                  <td className="team-name">Producers</td>
                  {allHoles.map((hole) => {
                    const score = getScore(hole.number);
                    const status = generateMatchStatus(hole.number);
                    
                    return (
                      <td
                        key={hole.number}
                        className={`score-cell ${
                          score.winningTeam === "producer" ? "winning-score" : ""
                        }`}
                      >
                        <input
                          type="text"
                          value={score.producerScore ?? ""}
                          onChange={(e) =>
                            handleScoreInputChange(e.target, hole.number, false)
                          }
                          className="score-input"
                          disabled={locked || !canEditScores}
                        />
                      </td>
                    );
                  })}
                  <td className="totals-column">{frontNineTotals.producerTotal}</td>
                  <td className="totals-column">{backNineTotals.producerTotal}</td>
                  <td className="totals-column">
                    {frontNineTotals.producerTotal + backNineTotals.producerTotal}
                  </td>
                </tr>
              )}

              {/* Team scores row for Best Ball */}
              {isBestBall && (
                <>
                  <tr className="team-score-row aviator-row">
                    <td className="team-name">Aviators Team</td>
                    {allHoles.map((hole) => {
                      const score = getScore(hole.number);
                      const status = generateMatchStatus(hole.number);
                      
                      return (
                        <td
                          key={hole.number}
                          className={`score-cell ${
                            score.winningTeam === "aviator" ? "winning-score" : ""
                          }`}
                        >
                          <span className="team-score-value">
                            {score.aviatorScore ?? ""}
                          </span>
                          <span className={`match-status ${status.color}`}>
                            {status.status}
                          </span>
                        </td>
                      );
                    })}
                    <td className="totals-column">{frontNineTotals.aviatorTotal}</td>
                    <td className="totals-column">{backNineTotals.aviatorTotal}</td>
                    <td className="totals-column">
                      {frontNineTotals.aviatorTotal + backNineTotals.aviatorTotal}
                    </td>
                  </tr>
                  <tr className="team-score-row producer-row">
                    <td className="team-name">Producers Team</td>
                    {allHoles.map((hole) => {
                      const score = getScore(hole.number);
                      
                      return (
                        <td
                          key={hole.number}
                          className={`score-cell ${
                            score.winningTeam === "producer" ? "winning-score" : ""
                          }`}
                        >
                          <span className="team-score-value">
                            {score.producerScore ?? ""}
                          </span>
                        </td>
                      );
                    })}
                    <td className="totals-column">{frontNineTotals.producerTotal}</td>
                    <td className="totals-column">{backNineTotals.producerTotal}</td>
                    <td className="totals-column">
                      {frontNineTotals.producerTotal + backNineTotals.producerTotal}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  // Helper function to calculate player total for a range of holes
  function calculatePlayerTotal(playerName: string, start: number, end: number): string {
    let total = 0;
    let validHoles = 0;

    for (let i = start; i <= end; i++) {
      const key = `${i}-${playerName}`;
      const scoreList = playerScores.get(key) || [];
      const playerScore = scoreList[0];

      if (playerScore?.score !== null && playerScore?.score !== undefined) {
        total += playerScore.score;
        validHoles++;
      }
    }

    return validHoles > 0 ? total.toString() : "";
  }
};

export default EnhancedMatchScorecard;
