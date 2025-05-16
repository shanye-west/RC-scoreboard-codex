import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  saveScoreToLocalStorage,
  getPendingScores,
  getScoreFromLocalStorage,
  markScoreAsSynced,
  getMatchScoresFromLocalStorage
} from "@/lib/offlineStorage";

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
      const playerName = [...aviatorPlayersList, ...producerPlayersList].find((p: Player) => p.id === playerId)?.name || `Player ${playerId}`;
      
      // Find the hole with the matching number
      const hole = holes.find((h: Hole) => h.number === holeNumber);
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
    
    const participantPlayerIds = participants?.map((p: { playerId: number }) => p.playerId) || [];
    const userPlayers = allPlayers.filter((player: { userId: number }) => player.userId === user.id);
    const userPlayerIds = userPlayers.map((player: { id: number }) => player.id);
    
    // Check if any of user's players are participants in this match
    return userPlayerIds.some((id: number) => participantPlayerIds.includes(id));
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
      const player = [...aviatorPlayersList, ...producerPlayersList].find((p: Player) => p.id === variables.playerId);
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
            const playerIndex = teamScores.findIndex((s: BestBallPlayerScore) => s.player === player.name);
            
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

  // Fix for: Parameter 'p' implicitly has an 'any' type
  const aviatorPlayersList = useMemo(() => {
    if (!Array.isArray(participants)) return [];

    return participants
      .filter((p: { team: string }) => p.team === "aviator" || p.team === "aviators")
      .map((p: { playerId: number }) => {
        if (!Array.isArray(allPlayers)) return { id: p.playerId, name: `Player ${p.playerId}`, teamId: 1 };

        // Find the player details from allPlayers
        const playerDetails = allPlayers.find((player: any) => player.id === p.playerId);
        return playerDetails || { id: p.playerId, name: `Player ${p.playerId}`, teamId: 1 };
      });
  }, [participants, allPlayers]);

  const producerPlayersList = useMemo(() => {
    if (!Array.isArray(participants)) return [];

    return participants
      .filter((p: { team: string }) => p.team === "producer" || p.team === "producers")
      .map((p: { playerId: number }) => {
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
  
  // Add a ref to track if handicap strokes have been loaded
  const handicapStrokesLoaded = useRef(false);

  // Load saved player scores from the database
  useEffect(() => {
    if (!existingPlayerScores || existingPlayerScores.length === 0) return;
    
    console.log("Loading saved player scores from database:", existingPlayerScores);
    
    // Create a new Map to hold all loaded scores
    const loadedScores = new Map();
    
    // Process each saved player score
    existingPlayerScores.forEach((savedScore: any) => {
      const { playerId, holeNumber, score, handicapStrokes = 0 } = savedScore;
      
      // Find the player from our lists
      const player = [...aviatorPlayersList, ...producerPlayersList].find((p: Player) => p.id === playerId);
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
      const playerIndex = teamScores.findIndex((p: BestBallPlayerScore) => p.playerId === playerId);
      
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
    
  }, [existingPlayerScores, holes, aviatorPlayersList, producerPlayersList]);
  
  // Load handicap strokes for all players on all holes
  useEffect(() => {
    if (!isBestBall || !matchData?.roundId) return;
    
    // Skip if we've already loaded handicap strokes
    if (handicapStrokesLoaded.current) return;
    
    console.log("Loading handicap strokes for all players");
    
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
          
          // Update the Map with new data
          setPlayerScores(prev => {
            const newMap = new Map(prev);
            newMap.set(key, existingScores);
            return newMap;
          });
        } catch (error) {
          console.error(`Error loading handicap for player ${player.name} on hole ${hole.number}:`, error);
        }
      }
    };
    
    // Load for all players in the match
    const allMatchPlayers = [...aviatorPlayersList, ...producerPlayersList];
    allMatchPlayers.forEach(player => {
      loadPlayerHandicapData(player);
    });
    
    // Mark as loaded
    handicapStrokesLoaded.current = true;
    
  }, [matchData?.roundId, isBestBall, aviatorPlayersList, producerPlayersList, holes, playerHandicaps]);

  // Compute player score totals
  const playerTotals = useMemo(() => {
    const totals = new Map<string, number>();

    // Process all players
    [...aviatorPlayersList, ...producerPlayersList].forEach((player) => {
      let playerTotal = 0;

      // Calculate this player's total across all holes
      for (let i = 1; i <= 18; i++) {
        const key = `${i}-${player.name}`;
        const playerScoreObj = playerScores.get(key);

        if (
          playerScoreObj &&
          playerScoreObj.length > 0 &&
          playerScoreObj[0].score !== null
        ) {
          playerTotal += playerScoreObj[0].score!;
        }
      }

      // Store the player's total
      totals.set(player.name, playerTotal);
    });

    return totals;
  }, [playerScores, aviatorPlayersList, producerPlayersList]);

  // Calculate front nine totals for each player
  const playerFrontNineTotals = useMemo(() => {
    const totals = new Map<string, number>();

    // Process all players
    [...aviatorPlayersList, ...producerPlayersList].forEach((player) => {
      let playerTotal = 0;

      // Calculate this player's front nine total
      for (let i = 1; i <= 9; i++) {
        const key = `${i}-${player.name}`;
        const playerScoreObj = playerScores.get(key);

        if (
          playerScoreObj &&
          playerScoreObj.length > 0 &&
          playerScoreObj[0].score !== null
        ) {
          playerTotal += playerScoreObj[0].score!;
        }
      }

      // Store the player's front nine total
      totals.set(player.name, playerTotal);
    });

    return totals;
  }, [playerScores, aviatorPlayersList, producerPlayersList]);

  // Calculate back nine totals for each player
  const playerBackNineTotals = useMemo(() => {
    const totals = new Map<string, number>();

    // Process all players
    [...aviatorPlayersList, ...producerPlayersList].forEach((player) => {
      let playerTotal = 0;

      // Calculate this player's back nine total
      for (let i = 10; i <= 18; i++) {
        const key = `${i}-${player.name}`;
        const playerScoreObj = playerScores.get(key);

        if (
          playerScoreObj &&
          playerScoreObj.length > 0 &&
          playerScoreObj[0].score !== null
        ) {
          playerTotal += playerScoreObj[0].score!;
        }
      }

      // Store the player's back nine total
      totals.set(player.name, playerTotal);
    });

    return totals;
  }, [playerScores, aviatorPlayersList, producerPlayersList]);

  // Get a score for a specific hole number
  const getScore = (holeNumber: number): Score | undefined => {
    // Sort scores by ID to get the latest score for a hole
    const sortedScores = [...scores].sort((a, b) => b.id - a.id);
    return sortedScores.find((s) => s.holeNumber === holeNumber);
  };

  // Determine the last completed hole based on scores
  const lastCompletedHole = useMemo(() => {
    const completedHoles = scores
      .filter((s) => s.aviatorScore !== null && s.producerScore !== null)
      .map((s) => s.holeNumber);

    return completedHoles.length > 0 ? Math.max(...completedHoles) : 0;
  }, [scores]);

  // Check if a hole is or should be greyed out (e.g., match is over)
  const isHoleGreyedOut = (holeNumber: number): boolean => {
    if (locked) return true;

    if (matchStatus !== "completed") return false;

    // Find the match-deciding hole
    const completedScores = scores.filter(
      (s) => s.aviatorScore !== null && s.producerScore !== null,
    );
    if (completedScores.length === 0) return false;

    // Count aviator wins vs producer wins
    let aviatorWins = 0;
    let producerWins = 0;

    // Sort scores by hole number
    const sortedScores = [...completedScores].sort(
      (a, b) => a.holeNumber - b.holeNumber,
    );

    // Calculate the running score and find the deciding hole
    let decidingHole = 18; // Default to 18 if match goes all the way

    for (const score of sortedScores) {
      if (score.aviatorScore! < score.producerScore!) {
        aviatorWins++;
      } else if (score.producerScore! < score.aviatorScore!) {
        producerWins++;
      }

      const lead = Math.abs(aviatorWins - producerWins);
      const holesRemaining = 18 - score.holeNumber;

      // If lead is greater than remaining holes, match is decided
      if (lead > holesRemaining) {
        decidingHole = score.holeNumber;
        break;
      }
    }

    // Grey out holes after the deciding hole
    return holeNumber > decidingHole;
  };

  // Get background class for a hole based on scores
  const getHoleClass = (holeNumber: number): string => {
    const score = getScore(holeNumber);
    let classes = "";

    // Grey out if hole is after the match was decided
    if (isHoleGreyedOut(holeNumber)) {
      return "bg-gray-200 opacity-50"; // Greyed out and disabled
    }

    if (!score || !score.aviatorScore || !score.producerScore) return classes;

    if (score.aviatorScore < score.producerScore) {
      classes += "bg-green-100"; // Aviators win
    } else if (score.producerScore < score.aviatorScore) {
      classes += "bg-green-100"; // Producers win
    }

    return classes;
  };

  // Get the score value for a specific hole and team
  const getScoreInputValue = (
    holeNumber: number,
    team: "aviator" | "producer",
  ): string => {
    const score = getScore(holeNumber);
    if (!score) return "";

    const value = team === "aviator" ? score.aviatorScore : score.producerScore;
    return value !== null ? value.toString() : "";
  };

  // Helper function to safely get player score value with null checks
  const safeGetPlayerScoreValue = (scores: BestBallPlayerScore[] | undefined): string => {
    if (!scores || scores.length === 0) return "";
    const score = scores[0].score;
    return score !== null && score !== undefined ? score.toString() : "";
  };

  // Helper function to safely get handicap strokes with stronger typing
  const safeGetHandicapStrokes = (scores: BestBallPlayerScore[] | undefined): number => {
    if (!scores || scores.length === 0) return 0;
    return scores[0].handicapStrokes || 0;
  };

  // Helper function to safely get net score with stronger typing
  const safeGetNetScore = (scores: BestBallPlayerScore[] | undefined): number | null => {
    if (!scores || scores.length === 0) return null;
    return scores[0].netScore || null;
  };

  // Fix "Object is possibly 'undefined'" errors in the getPlayerScoreValue function
  const getPlayerScoreValue = (
    holeNumber: number,
    playerName: string,
    teamId: string,
  ): string => {
    // For individual player scores, check for player-specific key first
    const playerKey = `${holeNumber}-${playerName}`;
    const playerSpecificScores = playerScores.get(playerKey);

    if (playerSpecificScores && playerSpecificScores.length > 0) {
      const score = playerSpecificScores[0].score;
      if (score !== null && score !== undefined) {
        return score.toString();
      }
    }

    // Then check team scores
    const teamKey = `${holeNumber}-${teamId}`;
    const holeScores = playerScores.get(teamKey) || [];
    const playerScore = holeScores.find((ps) => ps.player === playerName);

    if (playerScore?.score !== null && playerScore?.score !== undefined) {
      return playerScore.score.toString();
    }

    return "";
  };

  // Handle score input change for regular match types
  const handleScoreChange = (
    holeNumber: number,
    team: "aviator" | "producer",
    value: string,
    target: HTMLInputElement,
  ) => {
    // Check if user has permission to edit scores
    if (!canEditScores) {
      console.log("User doesn't have permission to update scores");
      return;
    }
    
    let numValue: number | null = null;

    // Only parse if the value is not empty
    if (value !== "") {
      // Ensure we're parsing a valid number
      const parsed = parseInt(value);
      if (!isNaN(parsed)) {
        numValue = parsed;
      }
    }

    if (team === "aviator") {
      const producerScore = getScore(holeNumber)?.producerScore || null;
      onScoreUpdate(holeNumber, numValue, producerScore);
    } else {
      const aviatorScore = getScore(holeNumber)?.aviatorScore || null;
      onScoreUpdate(holeNumber, aviatorScore, numValue);
    }
    //Added Keyboard Closing Logic
    setTimeout(() => {
      if (value !== "1" && value !== "") {
          target.blur();
      }
    }, 100);
  };

  // Reference to track if we've initialized scores from local storage
  const localStorageLoaded = useRef(false);
  
  // Function to sync pending scores from local storage
  const syncPendingScores = async () => {
    try {
      const pendingScores = getPendingScores();
      if (pendingScores.length === 0) return;
      
      console.log(`Attempting to sync ${pendingScores.length} pending scores`);
      
      const failedScores: string[] = [];
      
      for (const scoreKey of pendingScores) {
        try {
          const scoreData = getScoreFromLocalStorage(scoreKey);
          if (!scoreData || !scoreData.matchId) continue; // Skip invalid data
          
          // Attempt to save to server
          await saveScoreToServer(scoreData);
          
          // Mark as synced in local storage
          markScoreAsSynced(scoreKey);
        } catch (error) {
          console.error(`Failed to sync score ${scoreKey}:`, error);
          failedScores.push(scoreKey);
        }
      }
      
      console.log(`Synced ${pendingScores.length - failedScores.length} scores, ${failedScores.length} failed`);
      
      // Refresh data if any scores were synced
      if (pendingScores.length !== failedScores.length) {
        queryClient.invalidateQueries({ queryKey: [`/api/best-ball-scores/${matchId}`] });
        queryClient.invalidateQueries({ queryKey: [`/api/player-scores?matchId=${matchId}`] });
      }
    } catch (error) {
      console.error("Error syncing pending scores:", error);
    }
  };
  
  // Helper function to save score to server
  const saveScoreToServer = async (score: {
    matchId: number;
    playerId: number;
    holeNumber: number;
    score: number | null;
    handicapStrokes?: number;
    netScore?: number | null;
  }) => {
    // Ensure handicapStrokes is never undefined
    const scoreToSave = {
      ...score,
      handicapStrokes: score.handicapStrokes || 0,
      netScore: score.netScore || null
    };
    
    // First try best_ball_player_scores
    const bestBallResponse = await fetch('/api/best-ball-scores', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(scoreToSave),
    });
    
    if (!bestBallResponse.ok) {
      console.warn('Failed to save to best_ball_player_scores, will retry later');
    }
    
    // Always try to save to player_scores table for redundancy if score is not null
    if (score.score !== null) {
      try {
        await apiRequest("POST", `/api/player-scores`, {
          playerId: score.playerId,
          matchId: score.matchId,
          holeNumber: score.holeNumber,
          score: score.score,
          tournamentId: matchData?.tournamentId
        });
      } catch (error) {
        console.warn("Failed to save to player_scores table:", error);
      }
    }
    
    return bestBallResponse;
  };
  
  // Attempt to sync pending scores when component mounts or network is restored
  useEffect(() => {
    // Try to sync on component mount
    syncPendingScores();
    
    // Set up network status listener to sync when back online
    const handleOnline = () => {
      console.log("Network connection restored, syncing pending scores");
      syncPendingScores();
    };
    
    window.addEventListener('online', handleOnline);
    
    // Clean up
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [matchId]);

  // Mutation for saving individual scores with offline support
  const saveScoreMutation = useMutation({
    mutationFn: async (score: {
      matchId: number;
      playerId: number;
      holeNumber: number;
      score: number | null;
      handicapStrokes: number;
      netScore: number | null;
    }) => {
      // Always save to local storage first for offline resilience
      saveScoreToLocalStorage(score);
      
      try {
        // Attempt to save to server
        const response = await saveScoreToServer(score);
        return response.json();
      } catch (error) {
        console.error("Failed to save score to server:", error);
        // Even though server save failed, we've saved to local storage
        // Return a success response to avoid UI disruption
        return {
          message: "Score saved offline. Will sync when connection is restored.",
          offlineOnly: true,
          ...score
        };
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/best-ball-scores/${matchId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/player-scores?matchId=${matchId}`] });
    },
    onError: (error) => {
      console.error('Error saving score:', error);
      // Notify user of error
      alert('Failed to save score. Please try again.');
    },
  });

  // Reference to track if we've already loaded scores to prevent infinite loops
  const individualScoresLoaded = useRef(false);

  // Load individual scores into state when they're fetched
  useEffect(() => {
    // Only process scores if they exist and haven't been loaded yet
    if (Array.isArray(individualScores) && individualScores.length > 0 && !individualScoresLoaded.current) {
      console.log("Loading scores from best_ball_player_scores table:", individualScores.length, "scores found");
      
      // Set flag to prevent infinite loops
      individualScoresLoaded.current = true;
      
      const newPlayerScores = new Map();
      const allParticipants = [...aviatorPlayersList, ...producerPlayersList];
      
      individualScores.forEach((score: any) => {
        const player = allParticipants.find((p: Player) => p.id === score.playerId);
        
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
          
          // Check if player already exists in team scores
          const existingIndex = teamScores.findIndex((s: any) => s.playerId === score.playerId);
          if (existingIndex >= 0) {
            teamScores[existingIndex] = scoreObj;
          } else {
            teamScores.push(scoreObj);
          }
          
          newPlayerScores.set(teamKey, teamScores);
          
          // Update player-specific scores
          newPlayerScores.set(playerKey, [scoreObj]);
        }
      });
      
      // Only update state if we actually have new scores
      if (newPlayerScores.size > 0) {
        setPlayerScores(newPlayerScores);
      }
    }
  }, [individualScores, aviatorPlayersList, producerPlayersList]);
  
  // Fix for: Type 'MapIterator<[string, BestBallPlayerScore[]]>' can only be iterated through
  const updateBestBallScores = (
    holeNumber: number,
    currentScores: Map<string, BestBallPlayerScore[]>,
  ) => {
    if (!isBestBall || !onBestBallScoreUpdate) return;
    
    // Get all player scores for this hole
    const playerScoresForHole: BestBallPlayerScore[] = [];
    
    // Extract team scores from the map using Array.from instead of iterator
    Array.from(currentScores.entries()).forEach(([key, scores]) => {
      if (key.startsWith(`${holeNumber}-`) && !key.includes("-aviator") && !key.includes("-producer")) {
        // This is a player's key for this hole
        if (scores && scores.length > 0) {
          // Make sure the score has all required fields
          const scoreWithDefaults = {
            ...scores[0],
            handicapStrokes: scores[0].handicapStrokes || 0,
            netScore: scores[0].netScore || (scores[0].score !== null ? scores[0].score - (scores[0].handicapStrokes || 0) : null)
          };
          playerScoresForHole.push(scoreWithDefaults);
        }
      }
    });
    
    // Update the match scores
    if (playerScoresForHole.length > 0) {
      onBestBallScoreUpdate(holeNumber, playerScoresForHole);
    }
  };

  // Reference for fallback scores loading
  const fallbackScoresLoaded = useRef(false);
  
  // Fix for: Type 'Set<any>' can only be iterated through
  // Fallback mechanism to load scores from player_scores if best_ball_scores aren't available
  useEffect(() => {
    // Only run if best ball match, we have existing player scores, we don't have individual scores, and we haven't loaded yet
    if (isBestBall && 
        Array.isArray(existingPlayerScores) && existingPlayerScores.length > 0 && 
        (!Array.isArray(individualScores) || individualScores.length === 0) &&
        !fallbackScoresLoaded.current) {
      
      // Mark as loaded to prevent infinite loops
      fallbackScoresLoaded.current = true;
      
      console.log("Fallback: Loading scores from player_scores table:", existingPlayerScores.length, "scores found");
      const newPlayerScores = new Map();
      
      existingPlayerScores.forEach((score: any) => {
        const player = [...aviatorPlayersList, ...producerPlayersList]
          .find((p: Player) => p.id === score.playerId);
        
        if (player) {
          const teamKey = `${score.holeNumber}-${player.teamId === 1 ? 'aviator' : 'producer'}`;
          const playerKey = `${score.holeNumber}-${player.name}`;
          
          // Calculate handicap strokes based on player's course handicap
          const courseHandicap = getPlayerCourseHandicap(score.playerId);
          const hole = holes.find(h => h.number === score.holeNumber);
          const handicapRank = hole?.handicapRank || 0;
          
          let handicapStrokes = 0;
          if (handicapRank > 0 && courseHandicap >= handicapRank) {
            handicapStrokes = 1;
            if (handicapRank === 1 && courseHandicap >= 19) {
              handicapStrokes = 2;
            }
          }
          
          const netScore = score.score !== null ? score.score - handicapStrokes : null;
          
          const scoreObj = {
            player: player.name,
            score: score.score,
            teamId: player.teamId === 1 ? 'aviator' : 'producer',
            playerId: score.playerId,
            handicapStrokes: handicapStrokes,
            netScore: netScore
          };
          
          // Update team scores
          const teamScores = newPlayerScores.get(teamKey) || [];
          teamScores.push(scoreObj);
          newPlayerScores.set(teamKey, teamScores);
          
          // Add individual player score
          newPlayerScores.set(playerKey, [scoreObj]);
        }
      });
      
      // Only update if we have scores
      if (newPlayerScores.size > 0) {
        setPlayerScores(newPlayerScores);
        
        // Also update best ball scores for each hole
        // Fix the Set iteration by converting to array first
        const uniqueHoleSet = new Set<number>();
        existingPlayerScores.forEach((s: any) => {
          if (s.holeNumber) uniqueHoleSet.add(s.holeNumber);
        });
        const uniqueHoles = Array.from(uniqueHoleSet);
        
        uniqueHoles.forEach(holeNumber => {
          updateBestBallScores(holeNumber, newPlayerScores);
        });
      }
    }
  }, [existingPlayerScores, individualScores, aviatorPlayersList, producerPlayersList, isBestBall, holes]);

  // Update handlePlayerScoreChange to use the mutation
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
    
    const courseHandicap = getPlayerCourseHandicap(playerId);
    const hole = holes.find(h => h.number === holeNumber);
    const handicapRank = hole?.handicapRank || 0;
    
    let handicapStrokes = 0;
    if (isBestBall && handicapRank > 0 && courseHandicap >= handicapRank) {
      handicapStrokes = 1;
      if (handicapRank === 1 && courseHandicap >= 19) {
        handicapStrokes = 2;
      }
    }
    
    const netScore = numValue !== null ? numValue - handicapStrokes : null;

    // Save to database with error handling
    try {
      await saveScoreMutation.mutateAsync({
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

    // Update local state
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

    // Persist the player score to the database if it's a valid score
    if (playerId && numValue !== null) {
      try {
        savePlayerScoreMutation.mutate({
          playerId,
          matchId,
          holeNumber,
          score: numValue,
          tournamentId: matchData?.tournamentId
        });
      } catch (error) {
        console.error("Error saving player score:", error);
      }
    }

    // Calculate the best score for each team and update the match
    updateBestBallScores(holeNumber, newPlayerScores);

    setTimeout(() => {
      if (value !== "1" && value !== "") {
        target.blur();
      }
    }, 100);
  };

  // Define isLowestScore function that was missing
  const isLowestScore = (
    holeNumber: number,
    playerName: string,
    teamId: string,
  ): boolean => {
    if (!isBestBall) return true; // Not applicable for non-Best Ball matches

    const key = `${holeNumber}-${teamId}`;
    const holeScores = playerScores.get(key) || [];

    if (holeScores.length < 2) return true; // If only one player, they are the best

    // Find current player's score
    const currentPlayerScoreObj = holeScores.find(
      (ps) => ps.player === playerName,
    );
    
    // For best ball with handicaps, use net scores
    if (isBestBall) {
      if (!currentPlayerScoreObj || currentPlayerScoreObj.score === null) {
        return false; // No score recorded
      }
      
      // Calculate current player's net score
      const currentPlayerScore = currentPlayerScoreObj.score;
      const currentPlayerHandicapStrokes = currentPlayerScoreObj.handicapStrokes || 0;
      const currentPlayerNetScore = currentPlayerScore - currentPlayerHandicapStrokes;
      
      // Find the minimum net score in this team for this hole
      let lowestNetScore = Infinity;
      
      for (const playerScore of holeScores) {
        if (playerScore.score !== null) {
          const netScore = playerScore.score - (playerScore.handicapStrokes || 0);
          if (netScore < lowestNetScore) {
            lowestNetScore = netScore;
          }
        }
      }
      
      if (lowestNetScore === Infinity) return false;
      
      // Check if this player has the lowest net score
      return currentPlayerNetScore === lowestNetScore;
    } else {
      // Use gross scores for other match types
      const currentPlayerScore = currentPlayerScoreObj?.score;
      
      if (currentPlayerScore === null || currentPlayerScore === undefined)
        return false;
      
      // Find the minimum score in this team for this hole (excluding nulls)
      const validScores = holeScores
        .filter((s) => s.score !== null && s.score !== undefined)
        .map((s) => s.score || Infinity);
        
      if (validScores.length === 0) return false;
      
      const lowestScore = Math.min(...validScores);
      
      // Check if this player has the lowest score
      return currentPlayerScore === lowestScore;
    }
  };

  const generateMatchStatus = (
    holeNumber: number,
  ): { text: string; color: string } => {
    // Check if this hole has been played
    const thisHoleScore = scores.find((s) => s.holeNumber === holeNumber);
    if (
      !thisHoleScore ||
      thisHoleScore.aviatorScore === null ||
      thisHoleScore.producerScore === null
    ) {
      return { text: "-", color: "text-gray-400" }; // Hole not completed yet
    }

    const completedScores = scores
      .filter(
        (s) =>
          s.holeNumber <= holeNumber &&
          s.aviatorScore !== null &&
          s.producerScore !== null,
      )
      .sort((a, b) => a.holeNumber - b.holeNumber);

    if (completedScores.length === 0)
      return { text: "-", color: "text-gray-400" };

    let aviatorWins = 0;
    let producerWins = 0;

    // Calculate running score
    for (const score of completedScores) {
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

  // Calculate totals for front nine (1-9)
  const frontNineTotals = useMemo(() => {
    let aviatorTotal = 0;
    let producerTotal = 0;
    let parTotal = 0;

    for (let i = 1; i <= 9; i++) {
      const hole = holes.find((h) => h.number === i);
      const score = getScore(i);

      if (hole) {
        parTotal += hole.par;
      }

      if (score?.aviatorScore) {
        aviatorTotal += score.aviatorScore;
      }

      if (score?.producerScore) {
        producerTotal += score.producerScore;
      }
    }

    return {
      aviatorTotal,
      producerTotal,
      parTotal,
    };
  }, [holes, scores]);

  // Calculate totals for back nine (10-18)
  const backNineTotals = useMemo(() => {
    let aviatorTotal = 0;
    let producerTotal = 0;
    let parTotal = 0;

    for (let i = 10; i <= 18; i++) {
      const hole = holes.find((h) => h.number === i);
      const score = getScore(i);

      if (hole) {
        parTotal += hole.par;
      }

      if (score?.aviatorScore) {
        aviatorTotal += score.aviatorScore;
      }

      if (score?.producerScore) {
        producerTotal += score.producerScore;
      }
    }

    return {
      aviatorTotal,
      producerTotal,
      parTotal,
    };
  }, [holes, scores]);

  // Helper function for getting player name from id
  const getPlayerName = (playerId: number): string => {
    // Use explicit type for player to fix "Parameter 'p' implicitly has an 'any' type"
    const player = [...aviatorPlayersList, ...producerPlayersList].find((p: Player) => p.id === playerId);
    return player?.name || `Player ${playerId}`;
  };

  // Helper function to get handicap indicators safely
  const renderHandicapIndicators = (holeNumber: number, playerName: string) => {
    const key = `${holeNumber}-${playerName}`;
    const scores = playerScores.get(key);
    const handicapStrokes = safeGetHandicapStrokes(scores);
    
    if (handicapStrokes <= 0) return null;
    
    return (
      <div className="handicap-strokes">
        {Array.from({ length: handicapStrokes }).map((_, i) => (
          <div key={i} className="handicap-indicator"></div>
        ))}
      </div>
    );
  };
  
  // Helper to determine if score input should show handicap stroke styling
  const hasHandicapStroke = (holeNumber: number, playerName: string): boolean => {
    const key = `${holeNumber}-${playerName}`;
    return safeGetHandicapStrokes(playerScores.get(key)) > 0;
  };

  return (
    <div className="scorecard-container">
      <div>
        {/* All 18 Holes in a single table with horizontal scrolling */}
        <table className="w-full text-sm scorecard-table">
          <thead>
            <tr className="bg-gray-100">
              <th className="py-2 px-2 text-left font-semibold sticky-column bg-gray-100">
                Hole
              </th>
              {/* Front Nine Holes */}
              {frontNine.map((hole) => (
                <th
                  key={hole.number}
                  className="py-2 px-2 text-center font-semibold"
                >
                  {hole.number}
                </th>
              ))}
              <th className="py-2 px-2 text-center font-semibold bg-gray-200">
                OUT
              </th>
              {/* Back Nine Holes */}
              {backNine.map((hole) => (
                <th
                  key={hole.number}
                  className="py-2 px-2 text-center font-semibold"
                >
                  {hole.number}
                </th>
              ))}
              <th className="py-2 px-2 text-center font-semibold bg-gray-200">
                IN
              </th>
              <th className="py-2 px-2 text-center font-semibold bg-gray-300">
                TOTAL
              </th>
            </tr>
            <tr className="bg-gray-50">
              <th className="py-2 px-2 text-left font-semibold sticky-column bg-gray-50">
                Par
              </th>
              {/* Front Nine Pars */}
              {frontNine.map((hole) => (
                <td key={hole.number} className="py-2 px-2 text-center">
                  {hole.par}
                  {hole.handicapRank && (
                    <span className="ml-1 text-xs text-blue-600 font-semibold">
                      ({hole.handicapRank})
                    </span>
                  )}
                </td>
              ))}
              <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                {frontNineTotals.parTotal}
              </td>
              {/* Back Nine Pars */}
              {backNine.map((hole) => (
                <td key={hole.number} className="py-2 px-2 text-center">
                  {hole.par}
                  {hole.handicapRank && (
                    <span className="ml-1 text-xs text-blue-600 font-semibold">
                      ({hole.handicapRank})
                    </span>
                  )}
                </td>
              ))}
              <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                {backNineTotals.parTotal}
              </td>
              <td className="py-2 px-2 text-center font-semibold bg-gray-200">
                {frontNineTotals.parTotal + backNineTotals.parTotal}
              </td>
            </tr>
          </thead>
          <tbody>
            {/* Aviator Players Rows for Best Ball - displayed above team row */}
            {isBestBall && (
              <>
                {aviatorPlayersList.map((player: any) => (
                  <tr key={player.id} className="border-b border-gray-200">
                    <td className="py-2 px-2 sticky-column bg-white border-l-4 border-aviator">
                      <div className="flex justify-between items-center">
                        <div className="text-xs font-medium text-black leading-tight">
                          <div className="font-semibold">{player.name}</div>
                          <div className="text-blue-600">
                            HCP: {getPlayerCourseHandicap(player.id)}
                          </div>
                        </div>
                        {canEditScores && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 p-1 ml-1 text-xs"
                            onClick={() => handleHandicapEdit(player.id, getPlayerCourseHandicap(player.id))}
                          >
                            Edit
                          </Button>
                        )}
                      </div>
                    </td>
                    {/* Front Nine Aviator Player Scores */}
                    {frontNine.map((hole) => {
                      const isLowest = isLowestScore(
                        hole.number,
                        player.name,
                        "aviator",
                      );
                      return (
                        <td key={hole.number} className="py-2 px-2 text-center scorecard-cell">
                          <div className="relative">
                            {/* Handicap Strokes Indicators - Use the helper function */}
                            {renderHandicapIndicators(hole.number, player.name)}
                            <input
                              type="tel"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              data-strokes={safeGetHandicapStrokes(playerScores.get(`${hole.number}-${player.name}`))}
                              className={`score-input w-8 h-8 text-center border border-gray-300 rounded 
                                ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed" : ""} 
                                ${!isLowest ? "non-counting-score" : ""}
                                ${hasHandicapStroke(hole.number, player.name) ? "handicap-stroke" : ""}`}
                              value={safeGetPlayerScoreValue(playerScores.get(`${hole.number}-${player.name}`))}
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
                            {safeGetNetScore(playerScores.get(`${hole.number}-${player.name}`)) !== null && 
                             safeGetHandicapStrokes(playerScores.get(`${hole.number}-${player.name}`)) > 0 && (
                              <span className="net-score">
                                ({safeGetNetScore(playerScores.get(`${hole.number}-${player.name}`))})
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                                {playerFrontNineTotals.get(player.name) || ""}
                              </td>
                              {/* Back Nine Aviator Player Scores */}
                              {backNine.map((hole) => {
                                const isLowest = isLowestScore(
                                  hole.number,
                                  player.name,
                                  "aviator",
                                );
                                return (
                                  <td key={hole.number} className="py-2 px-2 text-center scorecard-cell">
                                    <div className="relative">
                                      {/* Handicap Strokes Indicators */}
                                      {renderHandicapIndicators(hole.number, player.name)}
                                      <input
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        data-strokes={safeGetHandicapStrokes(playerScores.get(`${hole.number}-${player.name}`))}
                                        className={`score-input w-8 h-8 text-center border border-gray-300 rounded 
                                          ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed" : ""} 
                                          ${!isLowest ? "non-counting-score" : ""}
                                          ${hasHandicapStroke(hole.number, player.name) ? "handicap-stroke" : ""}`}
                                        value={safeGetPlayerScoreValue(playerScores.get(`${hole.number}-${player.name}`))}
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
                                      {safeGetNetScore(playerScores.get(`${hole.number}-${player.name}`)) !== null && 
                                       safeGetHandicapStrokes(playerScores.get(`${hole.number}-${player.name}`)) > 0 && (
                                        <span className="net-score">
                                          ({safeGetNetScore(playerScores.get(`${hole.number}-${player.name}`))})
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                              <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                                {playerBackNineTotals.get(player.name) || ""}
                              </td>
                              <td className="py-2 px-2 text-center font-semibold bg-gray-200">
                                {playerTotals.get(player.name) || ""}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}

                    {/* Team Aviators Row */}
                    <tr className="border-b border-gray-200">
                      <td className="py-2 px-2 font-semibold sticky-column bg-aviator text-white">
                        <div>The Aviators</div>
                      </td>

                      {/* Front Nine Aviator Scores */}
                      {frontNine.map((hole) => (
                        <td key={hole.number} className="py-2 px-2 text-center">
                          {isBestBall ? (
                            <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded ${
                              getScoreInputValue(hole.number, "aviator") ? "bg-aviator text-white" : "bg-white text-black"
                            }`}>
                              {getScoreInputValue(hole.number, "aviator") || ""}
                            </div>
                          ) : canEditScores ? (
                            <input
                              type="tel"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className={`score-input w-16 h-8 text-center border border-gray-300 rounded 
                                ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed text-black" : 
                                  getScoreInputValue(hole.number, "aviator") ? "bg-aviator text-white" : "bg-white text-black"}`}
                              value={getScoreInputValue(hole.number, "aviator")}
                              onChange={(e) =>
                                handleScoreChange(
                                  hole.number,
                                  "aviator",
                                  e.target.value,
                                  e.target
                                )
                              }
                              min="1"
                              max="12"
                              disabled={isHoleGreyedOut(hole.number) || locked}
                            />
                          ) : (
                            <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded ${
                              getScoreInputValue(hole.number, "aviator") ? "bg-aviator text-white" : "bg-white text-black"
                            }`}>
                              {getScoreInputValue(hole.number, "aviator") || ""}
                            </div>
                          )}
                        </td>
                      ))}
                      <td className="py-2 px-2 text-center font-semibold bg-gray-100 text-aviator">
                        {frontNineTotals.aviatorTotal > 0
                          ? frontNineTotals.aviatorTotal
                          : ""}
                      </td>

                      {/* Back Nine Aviator Scores */}
                      {backNine.map((hole) => (
                        <td key={hole.number} className="py-2 px-2 text-center">
                          {isBestBall ? (
                            <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded ${
                              getScoreInputValue(hole.number, "aviator") ? "bg-aviator text-white" : "bg-white text-black"
                            }`}>
                              {getScoreInputValue(hole.number, "aviator") || ""}
                            </div>
                          ) : canEditScores ? (
                            <input
                              type="tel"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className={`score-input w-16 h-8 text-center border border-gray-300 rounded 
                                ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed text-black" : 
                                  getScoreInputValue(hole.number, "aviator") ? "bg-aviator text-white" : "bg-white text-black"}`}
                              value={getScoreInputValue(hole.number, "aviator")}
                              onChange={(e) =>
                                handleScoreChange(
                                  hole.number,
                                  "aviator",
                                  e.target.value,
                                  e.target
                                )
                              }
                              min="1"
                              max="12"
                              disabled={isHoleGreyedOut(hole.number) || locked}
                            />
                          ) : (
                            <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded ${
                              getScoreInputValue(hole.number, "aviator") ? "bg-aviator text-white" : "bg-white text-black"
                            }`}>
                              {getScoreInputValue(hole.number, "aviator") || ""}
                            </div>
                          )}
                        </td>
                      ))}
                      <td className="py-2 px-2 text-center font-semibold bg-gray-100 text-aviator">
                        {backNineTotals.aviatorTotal > 0
                          ? backNineTotals.aviatorTotal
                          : ""}
                      </td>
                      <td className="py-2 px-2 text-center font-semibold bg-gray-200 text-aviator">
                        {frontNineTotals.aviatorTotal + backNineTotals.aviatorTotal > 0
                          ? frontNineTotals.aviatorTotal + backNineTotals.aviatorTotal
                          : ""}
                      </td>
                    </tr>

                    {/* Match Status Row - Moved between teams */}
                    <tr className="border-b border-gray-200">
                      <td className="py-2 px-2 sticky-column bg-gray-100">
                        <div className="text-sm font-bold">Match Status</div>
                      </td>
                      {/* Front Nine Match Status */}
                      {frontNine.map((hole) => {
                        const status = generateMatchStatus(hole.number);
                        return (
                          <td key={hole.number} className="py-2 px-2 text-center">
                            <div className={`text-sm font-bold ${status.color}`}>
                              {status.text}
                            </div>
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center bg-gray-100"></td>
                      {/* Back Nine Match Status */}
                      {backNine.map((hole) => {
                        const status = generateMatchStatus(hole.number);
                        return (
                          <td key={hole.number} className="py-2 px-2 text-center">
                            <div className={`text-sm font-bold ${status.color}`}>
                              {status.text}
                            </div>
                          </td>
                        );
                      })}
                      <td className="py-2 px-2 text-center bg-gray-100"></td>
                      <td className="py-2 px-2 text-center bg-gray-200"></td>
                    </tr>

                    {/* Team Producers Row */}
                    <tr className="border-b border-gray-200">
                      <td className="py-2 px-2 font-semibold sticky-column bg-producer text-white">
                        <div>The Producers</div>
                      </td>

                      {/* Front Nine Producer Scores */}
                      {frontNine.map((hole) => (
                        <td key={hole.number} className="py-2 px-2 text-center">
                          {isBestBall ? (
                            <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded ${
                              getScoreInputValue(hole.number, "producer") ? "bg-producer text-white" : "bg-white text-black"
                            }`}>
                              {getScoreInputValue(hole.number, "producer") || ""}
                            </div>
                          ) : canEditScores ? (
                            <input
                              type="tel"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className={`score-input w-16 h-8 text-center border border-gray-300 rounded 
                                ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed text-black" : 
                                  getScoreInputValue(hole.number, "producer") ? "bg-producer text-white" : "bg-white text-black"}`}
                              value={getScoreInputValue(hole.number, "producer")}
                              onChange={(e) =>
                                handleScoreChange(
                                  hole.number,
                                  "producer",
                                  e.target.value,
                                  e.target
                                )
                              }
                              min="1"
                              max="12"
                              disabled={isHoleGreyedOut(hole.number) || locked}
                            />
                          ) : (
                            <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded ${
                              getScoreInputValue(hole.number, "producer") ? "bg-producer text-white" : "bg-white text-black"
                            }`}>
                              {getScoreInputValue(hole.number, "producer") || ""}
                            </div>
                          )}
                        </td>
                      ))}
                      <td className="py-2 px-2 text-center font-semibold bg-gray-100 text-producer">
                        {frontNineTotals.producerTotal > 0
                          ? frontNineTotals.producerTotal
                          : ""}
                      </td>

                      {/* Back Nine Producer Scores */}
                      {backNine.map((hole) => (
                        <td key={hole.number} className="py-2 px-2 text-center">
                          {isBestBall ? (
                            <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded ${
                              getScoreInputValue(hole.number, "producer") ? "bg-producer text-white" : "bg-white text-black"
                            }`}>
                              {getScoreInputValue(hole.number, "producer") || ""}
                            </div>
                          ) : canEditScores ? (
                            <input
                              type="tel"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              className={`score-input w-16 h-8 text-center border border-gray-300 rounded 
                                ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed text-black" : 
                                  getScoreInputValue(hole.number, "producer") ? "bg-producer text-white" : "bg-white text-black"}`}
                              value={getScoreInputValue(hole.number, "producer")}
                              onChange={(e) =>
                                handleScoreChange(
                                  hole.number,
                                  "producer",
                                  e.target.value,
                                  e.target
                                )
                              }
                              min="1"
                              max="12"
                              disabled={isHoleGreyedOut(hole.number) || locked || !canEditScores}
                            />
                          ) : (
                            <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded ${
                              getScoreInputValue(hole.number, "producer") ? "bg-producer text-white" : "bg-white text-black"
                            }`}>
                              {getScoreInputValue(hole.number, "producer") || ""}
                            </div>
                          )}
                        </td>
                      ))}
                      <td className="py-2 px-2 text-center font-semibold bg-gray-100 text-producer">
                        {backNineTotals.producerTotal > 0
                          ? backNineTotals.producerTotal
                          : ""}
                      </td>
                      <td className="py-2 px-2 text-center font-semibold bg-gray-200 text-producer">
                        {frontNineTotals.producerTotal + backNineTotals.producerTotal > 0
                          ? frontNineTotals.producerTotal + backNineTotals.producerTotal
                          : ""}
                      </td>
                    </tr>

                    {/* Producer Players Rows for Best Ball - displayed below team row */}
                    {isBestBall && (
                      <>
                        {producerPlayersList.map((player: any) => (
                          <tr key={player.id} className="border-b border-gray-200">
                            <td className="py-2 px-2 sticky-column bg-white border-l-4 border-producer">
                              <div className="flex justify-between items-center">
                                <div className="text-xs font-medium text-black leading-tight">
                                  <div className="font-semibold">{player.name}</div>
                                  <div className="text-blue-600">
                                    HCP: {getPlayerCourseHandicap(player.id)}
                                  </div>
                                </div>
                                {canEditScores && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 p-1 ml-1 text-xs"
                                    onClick={() => handleHandicapEdit(player.id, getPlayerCourseHandicap(player.id))}
                                  >
                                    Edit
                                  </Button>
                                )}
                              </div>
                            </td>
                            {/* Front Nine Producer Player Scores */}
                            {frontNine.map((hole) => {
                              const isLowest = isLowestScore(
                                hole.number,
                                player.name,
                                "producer",
                              );
                              return (
                                <td key={hole.number} className="py-2 px-2 text-center scorecard-cell">
                                  <div className="relative">
                                    {/* Handicap Strokes Indicators */}
                                    {renderHandicapIndicators(hole.number, player.name)}
                                    <input
                                      type="tel"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      data-strokes={safeGetHandicapStrokes(playerScores.get(`${hole.number}-${player.name}`))}
                                      className={`score-input w-8 h-8 text-center border border-gray-300 rounded 
                                        ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed" : ""} 
                                        ${!isLowest ? "non-counting-score" : ""}
                                        ${hasHandicapStroke(hole.number, player.name) ? "handicap-stroke" : ""}`}
                                      value={safeGetPlayerScoreValue(playerScores.get(`${hole.number}-${player.name}`))}
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
                                    {safeGetNetScore(playerScores.get(`${hole.number}-${player.name}`)) !== null && 
                                     safeGetHandicapStrokes(playerScores.get(`${hole.number}-${player.name}`)) > 0 && (
                                      <span className="net-score">
                                        ({safeGetNetScore(playerScores.get(`${hole.number}-${player.name}`))})
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                              {playerFrontNineTotals.get(player.name) || ""}
                            </td>
                            {/* Back Nine Producer Player Scores */}
                            {backNine.map((hole) => {
                              const isLowest = isLowestScore(
                                hole.number,
                                player.name,
                                "producer",
                              );
                              return (
                                <td key={hole.number} className="py-2 px-2 text-center scorecard-cell">
                                  <div className="relative">
                                    {/* Handicap Strokes Indicators */}
                                    {renderHandicapIndicators(hole.number, player.name)}
                                    <input
                                      type="tel"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      data-strokes={safeGetHandicapStrokes(playerScores.get(`${hole.number}-${player.name}`))}
                                      className={`score-input w-8 h-8 text-center border border-gray-300 rounded 
                                        ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed" : ""} 
                                        ${!isLowest ? "non-counting-score" : ""}
                                        ${hasHandicapStroke(hole.number, player.name) ? "handicap-stroke" : ""}`}
                                      value={safeGetPlayerScoreValue(playerScores.get(`${hole.number}-${player.name}`))}
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
                                    {safeGetNetScore(playerScores.get(`${hole.number}-${player.name}`)) !== null && 
                                     safeGetHandicapStrokes(playerScores.get(`${hole.number}-${player.name}`)) > 0 && (
                                      <span className="net-score">
                                        ({safeGetNetScore(playerScores.get(`${hole.number}-${player.name}`))})
                                      </span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                            <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                              {playerBackNineTotals.get(player.name) || ""}
                            </td>
                            <td className="py-2 px-2 text-center font-semibold bg-gray-200">
                              {playerTotals.get(player.name) || ""}
                            </td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        };

        export default EnhancedMatchScorecard;