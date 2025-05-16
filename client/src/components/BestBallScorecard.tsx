import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  saveScoreToLocalStorage,
  getPendingScores,
  markScoreAsSynced,
} from "@/lib/offlineStorage";
import {
  saveHandicapStrokes,
  getHandicapStrokesFromStorage,
} from "@/lib/handicapUtils";

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
  matchId: number;
  playerId: number;
  team: string;
  playerName: string;
}

interface BestBallPlayerScore {
  id?: number;
  matchId: number;
  playerId: number;
  holeNumber: number;
  score: number | null;
  handicapStrokes: number;
  netScore: number | null;
}

interface BestBallScorecardProps {
  matchId: number;
  holes: Hole[];
  scores: Score[];
  matchStatus?: string;
  matchType: string;
  locked: boolean;
  participants?: MatchParticipant[];
  onTeamScoreUpdate?: (
    holeNumber: number,
    aviatorScore: number | null,
    producerScore: number | null,
  ) => void;
}

const BestBallScorecard = ({
  matchId,
  holes,
  scores,
  matchStatus = "in_progress",
  matchType,
  locked = false,
  participants = [],
  onTeamScoreUpdate,
}: BestBallScorecardProps) => {
  const { user, isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Track if component is mounted to prevent state updates after unmount
  const isMounted = useRef(true);
  
  // Track if we've loaded handicap strokes
  const handicapStrokesLoaded = useRef(false);
  
  // Store best ball player scores for each hole
  const [playerScores, setPlayerScores] = useState<Map<string, BestBallPlayerScore[]>>(new Map());
  
  // Track pending score submissions for retry
  const [pendingScores, setPendingScores] = useState<BestBallPlayerScore[]>([]);
  
  // Track loading states
  const [loadingHoles, setLoadingHoles] = useState<Set<number>>(new Set());

  // Get match data to find round ID for handicap calculations
  const { data: matchData } = useQuery({
    queryKey: [`/api/matches/${matchId}`],
    enabled: !!matchId,
  });

  // Get best ball scores from the database
  const { data: bestBallScores = [], isLoading: isLoadingScores } = useQuery<BestBallPlayerScore[]>({
    queryKey: [`/api/best-ball-scores/${matchId}`],
    enabled: !!matchId,
  });

  // Get all players for reference
  const { data: allPlayers = [] } = useQuery<Player[]>({
    queryKey: ["/api/players"],
  });

  // Split participants into aviator and producer teams
  const aviatorParticipants = useMemo(() => 
    participants.filter(p => p.team === "aviator" || p.team === "aviators"), 
    [participants]
  );
  
  const producerParticipants = useMemo(() => 
    participants.filter(p => p.team === "producer" || p.team === "producers"), 
    [participants]
  );

  // Create arrays of player objects with additional data
  const aviatorPlayersList = useMemo(() => {
    return aviatorParticipants.map(p => {
      const player = allPlayers.find(player => player.id === p.playerId);
      return player ? player : { id: p.playerId, name: p.playerName, teamId: 1 };
    });
  }, [aviatorParticipants, allPlayers]);

  const producerPlayersList = useMemo(() => {
    return producerParticipants.map(p => {
      const player = allPlayers.find(player => player.id === p.playerId);
      return player ? player : { id: p.playerId, name: p.playerName, teamId: 2 };
    });
  }, [producerParticipants, allPlayers]);

  // Helper function to get player's course handicap
  const getPlayerCourseHandicap = (playerId: number): number => {
    if (!matchData?.roundId) return 0;
    
    // Use localStorage for now until we have a server API for this
    const key = `handicap-${playerId}-${matchData.roundId}`;
    const storedHandicap = localStorage.getItem(key);
    
    if (storedHandicap !== null) {
      return parseInt(storedHandicap, 10);
    }
    
    // If no handicap found, return 0
    return 0;
  };

  // Helper function to calculate handicap strokes for a player on a hole
  const calculateHandicapStrokes = (player: Player, hole: Hole): number => {
    if (!player || !hole || hole.handicapRank === null || hole.handicapRank === undefined) return 0;
    
    const courseHandicap = getPlayerCourseHandicap(player.id);
    
    if (!courseHandicap) return 0;
    
    // Check if player gets a stroke on this hole
    const getsStroke = courseHandicap >= hole.handicapRank;
    
    // For very high handicaps, give a second stroke on the hardest holes
    const getsExtraStroke = getsStroke && hole.handicapRank <= 2 && courseHandicap >= 18;
    
    return getsStroke ? (getsExtraStroke ? 2 : 1) : 0;
  };

  // Get or calculate handicap strokes for a specific player on a specific hole
  const getHandicapStrokes = (player: Player, hole: Hole): number => {
    if (!player || !hole) return 0;
    
    // Try to get from storage first
    const storedStrokes = getHandicapStrokesFromStorage(player.id, hole.number, matchId);
    if (storedStrokes !== null) {
      return storedStrokes;
    }
    
    // Calculate if not found
    const strokes = calculateHandicapStrokes(player, hole);
    
    // Save for future use
    saveHandicapStrokes(player.id, hole.number, matchId, strokes);
    
    return strokes;
  };

  // Helper function to save score to server
  const saveScoreToServer = async (score: BestBallPlayerScore): Promise<boolean> => {
    try {
      const response = await fetch('/api/best-ball-scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(score),
      });
      
      if (!response.ok) {
        throw new Error(`Error saving score: ${response.statusText}`);
      }
      
      return true;
    } catch (error) {
      console.error("Failed to save score to server:", error);
      
      // Save to local storage for later retry
      saveScoreToLocalStorage(
        score.matchId,
        score.playerId,
        score.holeNumber,
        score.score,
        score.handicapStrokes,
        score.netScore
      );
      
      // Add to pending scores for retry
      setPendingScores(prev => [...prev, score]);
      
      return false;
    }
  };

  // Function to retry pending scores
  const syncPendingScores = async () => {
    const pendingScores = getPendingScores();
    
    if (pendingScores.length === 0) return;
    
    console.log(`Attempting to sync ${pendingScores.length} pending scores`);
    
    for (const score of pendingScores) {
      if (score.matchId === matchId) {
        try {
          const success = await saveScoreToServer({
            matchId: score.matchId,
            playerId: score.playerId,
            holeNumber: score.holeNumber,
            score: score.score,
            handicapStrokes: score.handicapStrokes || 0,
            netScore: score.netScore
          });
          
          if (success) {
            markScoreAsSynced(score.matchId, score.playerId, score.holeNumber);
            console.log(`Successfully synced score for player ${score.playerId} on hole ${score.holeNumber}`);
          }
        } catch (error) {
          console.error(`Failed to sync score for player ${score.playerId} on hole ${score.holeNumber}`, error);
        }
      }
    }
    
    // Refresh scores after sync
    queryClient.invalidateQueries({ queryKey: [`/api/best-ball-scores/${matchId}`] });
  };

  // Update score for a specific player
  const updatePlayerScore = async (
    player: Player, 
    holeNumber: number, 
    score: number | null
  ) => {
    if (locked || !player) return;
    
    try {
      // Add hole to loading state
      setLoadingHoles(prev => new Set([...prev, holeNumber]));
      
      const handicapStrokes = getHandicapStrokes(player, holes.find(h => h.number === holeNumber)!);
      const netScore = score !== null ? score - handicapStrokes : null;
      
      // Create score object
      const scoreData: BestBallPlayerScore = {
        matchId,
        playerId: player.id,
        holeNumber,
        score,
        handicapStrokes,
        netScore
      };
      
      // Save to server
      const success = await saveScoreToServer(scoreData);
      
      if (success) {
        // Update local state immediately
        setPlayerScores(prev => {
          const newMap = new Map(prev);
          const teamKey = `${holeNumber}-${player.teamId === 1 ? 'aviator' : 'producer'}`;
          
          // Get current team scores or initialize
          const teamScores = newMap.get(teamKey) || [];
          
          // Find if this player already has a score
          const playerIndex = teamScores.findIndex(p => p.playerId === player.id);
          
          if (playerIndex >= 0) {
            // Update existing score
            teamScores[playerIndex] = scoreData;
          } else {
            // Add new score
            teamScores.push(scoreData);
          }
          
          // Update team scores in map
          newMap.set(teamKey, teamScores);
          
          return newMap;
        });
        
        // Calculate best scores for aviator and producer teams
        updateTeamScores(holeNumber);
        
        toast({
          title: "Score saved",
          description: `${player.name}'s score for hole ${holeNumber} has been saved`,
          variant: "default",
          duration: 2000
        });
      } else {
        toast({
          title: "Score saved locally",
          description: "You're offline. Score saved locally and will sync when you're back online.",
          variant: "default",
          duration: 3000
        });
      }
    } catch (error) {
      console.error("Error updating player score:", error);
      toast({
        title: "Error saving score",
        description: "There was a problem saving the score. Please try again.",
        variant: "destructive"
      });
    } finally {
      // Remove hole from loading state
      setLoadingHoles(prev => {
        const newSet = new Set(prev);
        newSet.delete(holeNumber);
        return newSet;
      });
    }
  };

  // Update team scores based on player scores
  const updateTeamScores = (holeNumber: number) => {
    const aviatorKey = `${holeNumber}-aviator`;
    const producerKey = `${holeNumber}-producer`;
    
    const aviatorScores = playerScores.get(aviatorKey) || [];
    const producerScores = playerScores.get(producerKey) || [];
    
    // Calculate best net scores (score minus handicap strokes)
    let bestAviatorScore: number | null = null;
    let bestProducerScore: number | null = null;
    
    if (aviatorScores.length > 0) {
      const validScores = aviatorScores.filter(s => s.netScore !== null).map(s => s.netScore!);
      bestAviatorScore = validScores.length > 0 ? Math.min(...validScores) : null;
    }
    
    if (producerScores.length > 0) {
      const validScores = producerScores.filter(s => s.netScore !== null).map(s => s.netScore!);
      bestProducerScore = validScores.length > 0 ? Math.min(...validScores) : null;
    }
    
    // Update team scores if callback is provided
    if (onTeamScoreUpdate) {
      onTeamScoreUpdate(holeNumber, bestAviatorScore, bestProducerScore);
    }
  };

  // Load best ball scores into state
  useEffect(() => {
    if (!bestBallScores.length) return;
    
    const newPlayerScores = new Map<string, BestBallPlayerScore[]>();
    
    bestBallScores.forEach(score => {
      const player = [...aviatorPlayersList, ...producerPlayersList].find(p => p.id === score.playerId);
      if (!player) return;
      
      const teamKey = `${score.holeNumber}-${player.teamId === 1 ? 'aviator' : 'producer'}`;
      
      // Get current team scores or initialize
      const teamScores = newPlayerScores.get(teamKey) || [];
      
      // Ensure handicap strokes and netScore are properly set
      const handicapStrokes = score.handicapStrokes || 0;
      const netScore = score.score !== null ? score.score - handicapStrokes : null;
      
      // Create score object
      const scoreData: BestBallPlayerScore = {
        ...score,
        handicapStrokes,
        netScore
      };
      
      // Find if this player already has a score
      const playerIndex = teamScores.findIndex(p => p.playerId === player.id);
      
      if (playerIndex >= 0) {
        // Update existing score
        teamScores[playerIndex] = scoreData;
      } else {
        // Add new score
        teamScores.push(scoreData);
      }
      
      // Update team scores in map
      newPlayerScores.set(teamKey, teamScores);
    });
    
    setPlayerScores(newPlayerScores);
    
    // Calculate all team scores
    holes.forEach(hole => {
      updateTeamScores(hole.number);
    });
  }, [bestBallScores, aviatorPlayersList, producerPlayersList]);

  // Initialize handicap strokes for all players
  useEffect(() => {
    if (handicapStrokesLoaded.current || !matchData?.roundId) return;
    
    // Initialize handicap dots for all players and all holes
    const allPlayers = [...aviatorPlayersList, ...producerPlayersList];
    
    allPlayers.forEach(player => {
      holes.forEach(hole => {
        const handicapStrokes = getHandicapStrokes(player, hole);
        
        if (handicapStrokes > 0) {
          // Save for future reference
          saveHandicapStrokes(player.id, hole.number, matchId, handicapStrokes);
          
          // Also update any existing scores
          const teamKey = `${hole.number}-${player.teamId === 1 ? 'aviator' : 'producer'}`;
          const teamScores = playerScores.get(teamKey) || [];
          const playerIndex = teamScores.findIndex(p => p.playerId === player.id);
          
          if (playerIndex >= 0) {
            setPlayerScores(prev => {
              const newMap = new Map(prev);
              const scores = newMap.get(teamKey) || [];
              
              scores[playerIndex] = {
                ...scores[playerIndex],
                handicapStrokes,
                netScore: scores[playerIndex].score !== null 
                  ? scores[playerIndex].score! - handicapStrokes 
                  : null
              };
              
              newMap.set(teamKey, scores);
              return newMap;
            });
          }
        }
      });
    });
    
    handicapStrokesLoaded.current = true;
  }, [matchData, holes, aviatorPlayersList, producerPlayersList]);

  // Sync pending scores when offline/online status changes
  useEffect(() => {
    const handleOnline = () => {
      syncPendingScores();
    };
    
    window.addEventListener('online', handleOnline);
    
    // Try to sync on component mount
    syncPendingScores();
    
    return () => {
      window.removeEventListener('online', handleOnline);
      isMounted.current = false;
    };
  }, []);

  // Render a single hole score input
  const renderHoleScore = (hole: Hole) => {
    const aviatorKey = `${hole.number}-aviator`;
    const producerKey = `${hole.number}-producer`;
    
    const aviatorScores = playerScores.get(aviatorKey) || [];
    const producerScores = playerScores.get(producerKey) || [];
    
    const matchScore = scores.find(s => s.holeNumber === hole.number);
    const isHoleLoading = loadingHoles.has(hole.number);
    
    // Find the current winning team for this hole
    const winningTeam = matchScore?.winningTeam || 
      (matchScore?.aviatorScore !== null && matchScore?.producerScore !== null
        ? matchScore.aviatorScore < matchScore.producerScore 
          ? 'aviator' 
          : matchScore.producerScore < matchScore.aviatorScore 
            ? 'producer' 
            : 'tie'
        : null);
    
    return (
      <div 
        key={hole.number} 
        className={`flex flex-col rounded-md p-2 ${
          winningTeam === 'aviator' 
            ? 'border-2 border-blue-500'
            : winningTeam === 'producer'
              ? 'border-2 border-red-500'
              : winningTeam === 'tie'
                ? 'border-2 border-gray-400'
                : 'border border-gray-300'
        }`}
      >
        <div className="text-center font-semibold">
          Hole {hole.number} (Par {hole.par})
        </div>
        
        {/* Aviators Player Scores */}
        <div className="mt-2 bg-blue-100 rounded-md p-2">
          <div className="text-center font-semibold text-sm border-b border-blue-300 pb-1 mb-2">
            Aviators
          </div>
          
          {aviatorPlayersList.map(player => {
            const playerScore = aviatorScores.find(s => s.playerId === player.id);
            const handicapStrokes = getHandicapStrokes(player, hole);
            
            return (
              <div key={player.id} className="flex items-center mb-1">
                <div className="flex-1 flex items-center">
                  <span className="mr-2">{player.name}</span>
                  {handicapStrokes > 0 && (
                    <div className="flex">
                      {Array.from({ length: handicapStrokes }).map((_, i) => (
                        <div key={i} className="h-2 w-2 bg-blue-500 rounded-full mr-1" />
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="flex space-x-1">
                  {[...Array(8)].map((_, i) => {
                    const score = i + 1;
                    return (
                      <Button
                        key={score}
                        size="sm"
                        variant={playerScore?.score === score ? "default" : "outline"}
                        className="h-8 w-8 p-0"
                        disabled={locked || isHoleLoading}
                        onClick={() => updatePlayerScore(player, hole.number, score)}
                      >
                        {score}
                      </Button>
                    );
                  })}
                  
                  <Button
                    size="sm"
                    variant={playerScore?.score === null ? "default" : "outline"}
                    className="h-8 w-8 p-0"
                    disabled={locked || isHoleLoading}
                    onClick={() => updatePlayerScore(player, hole.number, null)}
                  >
                    -
                  </Button>
                </div>
              </div>
            );
          })}
          
          {/* Team Score */}
          <div className="border-t border-blue-300 pt-1 mt-2 flex items-center justify-between">
            <span className="font-medium">Best Score:</span>
            <span className="font-bold">
              {matchScore?.aviatorScore !== null ? matchScore.aviatorScore : '-'}
            </span>
          </div>
        </div>
        
        {/* Producers Player Scores */}
        <div className="mt-2 bg-red-100 rounded-md p-2">
          <div className="text-center font-semibold text-sm border-b border-red-300 pb-1 mb-2">
            Producers
          </div>
          
          {producerPlayersList.map(player => {
            const playerScore = producerScores.find(s => s.playerId === player.id);
            const handicapStrokes = getHandicapStrokes(player, hole);
            
            return (
              <div key={player.id} className="flex items-center mb-1">
                <div className="flex-1 flex items-center">
                  <span className="mr-2">{player.name}</span>
                  {handicapStrokes > 0 && (
                    <div className="flex">
                      {Array.from({ length: handicapStrokes }).map((_, i) => (
                        <div key={i} className="h-2 w-2 bg-red-500 rounded-full mr-1" />
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="flex space-x-1">
                  {[...Array(8)].map((_, i) => {
                    const score = i + 1;
                    return (
                      <Button
                        key={score}
                        size="sm"
                        variant={playerScore?.score === score ? "default" : "outline"}
                        className="h-8 w-8 p-0"
                        disabled={locked || isHoleLoading}
                        onClick={() => updatePlayerScore(player, hole.number, score)}
                      >
                        {score}
                      </Button>
                    );
                  })}
                  
                  <Button
                    size="sm"
                    variant={playerScore?.score === null ? "default" : "outline"}
                    className="h-8 w-8 p-0"
                    disabled={locked || isHoleLoading}
                    onClick={() => updatePlayerScore(player, hole.number, null)}
                  >
                    -
                  </Button>
                </div>
              </div>
            );
          })}
          
          {/* Team Score */}
          <div className="border-t border-red-300 pt-1 mt-2 flex items-center justify-between">
            <span className="font-medium">Best Score:</span>
            <span className="font-bold">
              {matchScore?.producerScore !== null ? matchScore.producerScore : '-'}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // Group holes into front 9 and back 9
  const frontNine = useMemo(() => holes.filter(h => h.number <= 9), [holes]);
  const backNine = useMemo(() => holes.filter(h => h.number > 9), [holes]);

  return (
    <div className="w-full p-2">
      {isLoadingScores ? (
        <div className="flex items-center justify-center h-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <span className="ml-2">Loading scores...</span>
        </div>
      ) : (
        <>
          <div className="text-lg font-bold mb-4">
            2-man Team Best Ball Scorecard
          </div>
          
          {/* Front Nine */}
          <div className="mb-6">
            <h3 className="text-md font-semibold mb-2">Front Nine</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {frontNine.map(renderHoleScore)}
            </div>
          </div>
          
          {/* Back Nine */}
          <div>
            <h3 className="text-md font-semibold mb-2">Back Nine</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {backNine.map(renderHoleScore)}
            </div>
          </div>
          
          {pendingScores.length > 0 && (
            <div className="mt-4 p-2 bg-yellow-100 rounded-md">
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {pendingScores.length} scores waiting to be synced
                </span>
                <Button 
                  size="sm" 
                  onClick={syncPendingScores}
                >
                  Retry Sync
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default BestBallScorecard;