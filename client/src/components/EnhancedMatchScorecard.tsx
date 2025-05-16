import { useMemo, useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

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
  playerId: number;
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
  players?: any[]; // All players
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
  participants: propParticipants,
  players: propPlayers,
}: MatchScorecardProps) => {
  const isBestBall = matchType.includes("Best Ball");
  const queryClient = useQueryClient();

  // State for player scores in Best Ball format
  const [playerScores, setPlayerScores] = useState<Map<string, BestBallPlayerScore[]>>(new Map());
  const [playerTotals, setPlayerTotals] = useState<Map<string, number>>(new Map());
  const [frontNineTotals, setFrontNineTotals] = useState<Map<string, number>>(new Map());
  const [backNineTotals, setBackNineTotals] = useState<Map<string, number>>(new Map());
  const [isEditingHandicap, setIsEditingHandicap] = useState(false);
  const [currentEditPlayer, setCurrentEditPlayer] = useState<number | null>(null);
  const [newHandicap, setNewHandicap] = useState<string>("");
  const [handicapMap, setHandicapMap] = useState<Map<number, number>>(new Map());

  // Fetch match participants if not provided via props
  const { data: fetchedParticipants = [] } = useQuery<MatchParticipant[]>({
    queryKey: [`/api/match-players?matchId=${matchId}`],
    enabled: !propParticipants || propParticipants.length === 0,
  });

  // Fetch all players for reference if not provided via props
  const { data: fetchedPlayers = [] } = useQuery<Player[]>({
    queryKey: ["/api/players"],
    enabled: !propPlayers || propPlayers.length === 0,
  });
  
  // Use props if provided, otherwise use fetched data
  const participants = propParticipants && propParticipants.length > 0 ? propParticipants : fetchedParticipants;
  const allPlayers = propPlayers && propPlayers.length > 0 ? propPlayers : fetchedPlayers;

  // Fetch player-specific scores for Best Ball matches
  const { data: bestBallScores = [] } = useQuery({
    queryKey: ['/api/player-scores', matchId],
    enabled: isBestBall && !!matchId,
  });
  
  // Fetch player handicap data for the current match
  const { data: playerHandicaps = [] } = useQuery({
    queryKey: ['/api/player-handicaps', matchId],
    enabled: isBestBall && !!matchId,
  });

  // Auth
  const { user, isAdmin } = useAuth();

  // Split holes into front and back nine
  const frontNine = useMemo(() => holes
    .filter((hole) => hole.number <= 9)
    .sort((a, b) => a.number - b.number), [holes]);

  const backNine = useMemo(() => holes
    .filter((hole) => hole.number > 9)
    .sort((a, b) => a.number - b.number), [holes]);

  // Determine if the current user can edit scores (admin or participant)
  const canEditScores = useMemo(() => {
    if (locked) return false;
    if (isAdmin) return true;
    if (!user) return false;
    
    // Find all player IDs linked to this user
    const userPlayerIds = allPlayers
      .filter((p: any) => p?.userId === user.id)
      .map((p: any) => p?.id)
      .filter(Boolean);
    
    // Check if any of the user's players are participants in this match
    return participants.some((p: any) => 
      userPlayerIds.includes(p?.playerId || p?.player?.id)
    );
  }, [isAdmin, user, allPlayers, participants, locked]);

  // Get player course handicap
  const getPlayerCourseHandicap = useCallback((playerId: number) => {
    if (handicapMap.has(playerId)) {
      return handicapMap.get(playerId) || 0;
    }
    
    const handicapData = playerHandicaps.find((h: any) => h.playerId === playerId);
    return handicapData?.courseHandicap || 0;
  }, [playerHandicaps, handicapMap]);

  // Determine if a player gets a stroke on a hole
  const getHandicapStrokes = useCallback((playerId: number, holeNumber: number) => {
    const courseHandicap = getPlayerCourseHandicap(playerId);
    if (!courseHandicap) return 0;
    
    const hole = holes.find(h => h.number === holeNumber);
    if (!hole || !hole.handicapRank) return 0;
    
    // If course handicap is 18, player gets 1 stroke on every hole
    // If course handicap is 9, player gets 1 stroke on holes with handicap rank 1-9
    // If course handicap is 27, player gets 2 strokes on holes with handicap rank 1-9, and 1 stroke on holes with handicap rank 10-18
    return hole.handicapRank <= courseHandicap % 18 ? Math.floor(courseHandicap / 18) + 1 : Math.floor(courseHandicap / 18);
  }, [holes, getPlayerCourseHandicap]);

  // Process saved scores when they arrive
  useEffect(() => {
    if (isBestBall && bestBallScores && bestBallScores.length > 0) {
      console.log("Loading saved player scores from database: ", bestBallScores);
      
      const newScores = new Map<string, BestBallPlayerScore[]>();
      
      bestBallScores.forEach((score: any) => {
        const player = allPlayers.find(p => p.id === score.playerId);
        if (!player) return;
        
        const key = `${score.holeNumber}-${player.name}`;
        const team = participants.find((p: any) => p.playerId === score.playerId)?.team || "";
        
        const handicapStrokes = score.handicapStrokes || 0;
        const netScore = score.score !== null && handicapStrokes > 0
          ? Math.max(0, score.score - handicapStrokes)
          : score.score;
        
        if (!newScores.has(key)) {
          newScores.set(key, []);
        }
        
        const playerScore: BestBallPlayerScore = {
          player: player.name,
          playerId: player.id,
          score: score.score,
          teamId: team.toLowerCase(),
          handicapStrokes,
          netScore
        };
        
        newScores.get(key)?.push(playerScore);
      });
      
      setPlayerScores(newScores);
    }
  }, [bestBallScores, allPlayers, participants, isBestBall]);

  // Update handicap map from player handicaps
  useEffect(() => {
    if (playerHandicaps && playerHandicaps.length > 0) {
      const newHandicapMap = new Map<number, number>();
      
      playerHandicaps.forEach((h: any) => {
        if (h.playerId && h.courseHandicap !== undefined) {
          newHandicapMap.set(h.playerId, h.courseHandicap);
        }
      });
      
      setHandicapMap(newHandicapMap);
    }
  }, [playerHandicaps]);

  // Calculate team scores from player scores for Best Ball
  useEffect(() => {
    if (isBestBall && playerScores.size > 0) {
      // Update scores object
      const updatedScores = [...scores];
      
      // Calculate for each hole
      for (let i = 1; i <= 18; i++) {
        const aviatorScores: (number | null)[] = [];
        const producerScores: (number | null)[] = [];
        
        // Collect all scores for this hole
        for (let [key, scoresList] of playerScores.entries()) {
          if (key.startsWith(`${i}-`)) {
            for (const scoreData of scoresList) {
              const netScore = scoreData.netScore !== null && scoreData.netScore !== undefined 
                ? scoreData.netScore 
                : scoreData.score;
              
              if (scoreData.teamId === "aviator" || scoreData.teamId === "aviators") {
                if (netScore !== null) aviatorScores.push(netScore);
              } else if (scoreData.teamId === "producer" || scoreData.teamId === "producers") {
                if (netScore !== null) producerScores.push(netScore);
              }
            }
          }
        }
        
        // Find the best score for each team
        const bestAviatorScore = aviatorScores.length > 0 ? Math.min(...aviatorScores.filter(s => s !== null)) : null;
        const bestProducerScore = producerScores.length > 0 ? Math.min(...producerScores.filter(s => s !== null)) : null;
        
        // Update the score for this hole
        const scoreIdx = updatedScores.findIndex(s => s.holeNumber === i);
        if (scoreIdx !== -1) {
          updatedScores[scoreIdx] = {
            ...updatedScores[scoreIdx],
            aviatorScore: bestAviatorScore,
            producerScore: bestProducerScore,
            winningTeam: calculateWinningTeam(bestAviatorScore, bestProducerScore)
          };
        }
      }
      
      // If the handler exists, update the parent with the updated scores
      if (onScoreUpdate && updatedScores.length > 0) {
        // Don't trigger unnecessary updates
        const hasChanged = updatedScores.some((score, idx) => 
          score.aviatorScore !== scores[idx]?.aviatorScore || 
          score.producerScore !== scores[idx]?.producerScore);
        
        if (hasChanged) {
          // We just need to update one score to trigger the parent update
          const changedScore = updatedScores.find((score, idx) => 
            score.aviatorScore !== scores[idx]?.aviatorScore || 
            score.producerScore !== scores[idx]?.producerScore);
          
          if (changedScore) {
            onScoreUpdate(
              changedScore.holeNumber,
              changedScore.aviatorScore,
              changedScore.producerScore
            );
          }
        }
      }
    }
  }, [isBestBall, playerScores, scores, onScoreUpdate]);
  
  // Save player scores to the database with mutation
  const savePlayerScoreMutation = useMutation({
    mutationFn: async (scoreData: any) => {
      // For batched updates, use the batch endpoint
      if (Array.isArray(scoreData)) {
        return await apiRequest('POST', '/api/player-scores/batch', { scores: scoreData })
          .then(res => res.json());
      }
      
      // For single updates, use the standard endpoint
      return await apiRequest(
        scoreData.id ? 'PUT' : 'POST',
        `/api/player-scores${scoreData.id ? `/${scoreData.id}` : ''}`,
        scoreData
      ).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/player-scores', matchId] });
    }
  });

  // Handler for player handicap edit
  const saveHandicapMutation = useMutation({
    mutationFn: async (data: { playerId: number, courseHandicap: number }) => {
      return await apiRequest(
        'POST',
        `/api/player-handicaps`,
        { ...data, matchId }
      ).then(res => res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/player-handicaps', matchId] });
      setIsEditingHandicap(false);
      setCurrentEditPlayer(null);
      setNewHandicap("");
    }
  });

  // Handler for opening the handicap edit dialog
  const handleHandicapEdit = (playerId: number, currentHandicap: number) => {
    setCurrentEditPlayer(playerId);
    setNewHandicap(currentHandicap.toString());
    setIsEditingHandicap(true);
  };

  // Handler for saving the new handicap
  const saveHandicap = () => {
    if (currentEditPlayer === null) return;
    
    const handicapValue = parseInt(newHandicap, 10);
    if (isNaN(handicapValue)) return;
    
    saveHandicapMutation.mutate({
      playerId: currentEditPlayer,
      courseHandicap: handicapValue
    });
    
    // Also update local handicap map for immediate UI update
    setHandicapMap(prev => {
      const newMap = new Map(prev);
      newMap.set(currentEditPlayer, handicapValue);
      return newMap;
    });
  };

  // Calculate winning team for a hole
  const calculateWinningTeam = (aviatorScore: number | null, producerScore: number | null) => {
    if (aviatorScore === null || producerScore === null) return null;
    if (aviatorScore < producerScore) return "aviator";
    if (producerScore < aviatorScore) return "producer";
    return "tie";
  };

  // Get player score value for rendering
  const getPlayerScoreValue = (holeNumber: number, playerName: string, team: string) => {
    const key = `${holeNumber}-${playerName}`;
    const scores = playerScores.get(key) || [];
    const scoreData = scores.find(s => s.player === playerName && s.teamId === team.toLowerCase());
    return scoreData?.score !== null ? scoreData?.score?.toString() : "";
  };

  // Check if a score is the lowest (best) for the team on a hole
  const isLowestScore = (holeNumber: number, playerName: string, team: string) => {
    const key = `${holeNumber}-${playerName}`;
    const playerScore = playerScores.get(key)?.[0];
    if (!playerScore || playerScore.netScore === null) return false;
    
    // Get all scores for this hole and team
    const teamScores: (number | null)[] = [];
    for (const [entryKey, scoreList] of playerScores.entries()) {
      if (entryKey.startsWith(`${holeNumber}-`) && scoreList[0]?.teamId === team.toLowerCase()) {
        if (scoreList[0].netScore !== null) {
          teamScores.push(scoreList[0].netScore);
        }
      }
    }
    
    // If this is the lowest score or tied for lowest
    return playerScore.netScore === Math.min(...teamScores.filter(s => s !== null));
  };

  // Calculate player totals
  useEffect(() => {
    const newTotals = new Map<string, number>();
    const newFrontNineTotals = new Map<string, number>();
    const newBackNineTotals = new Map<string, number>();
    
    if (playerScores.size > 0) {
      // Get unique player names
      const playerNames = new Set<string>();
      for (const [key, scoreList] of playerScores.entries()) {
        if (scoreList.length > 0) {
          playerNames.add(scoreList[0].player);
        }
      }
      
      // Calculate totals for each player
      for (const player of playerNames) {
        let frontNineTotal = 0;
        let frontNineCount = 0;
        let backNineTotal = 0;
        let backNineCount = 0;
        
        for (let i = 1; i <= 18; i++) {
          const key = `${i}-${player}`;
          const scoreData = playerScores.get(key)?.[0];
          
          if (scoreData && scoreData.score !== null) {
            if (i <= 9) {
              frontNineTotal += scoreData.score;
              frontNineCount++;
            } else {
              backNineTotal += scoreData.score;
              backNineCount++;
            }
          }
        }
        
        if (frontNineCount > 0) {
          newFrontNineTotals.set(player, frontNineTotal);
        }
        
        if (backNineCount > 0) {
          newBackNineTotals.set(player, backNineTotal);
        }
        
        if (frontNineCount > 0 || backNineCount > 0) {
          newTotals.set(player, frontNineTotal + backNineTotal);
        }
      }
    }
    
    setPlayerTotals(newTotals);
    setFrontNineTotals(newFrontNineTotals);
    setBackNineTotals(newBackNineTotals);
  }, [playerScores]);

  // Function to determine if a hole should be greyed out
  const isHoleGreyedOut = (holeNumber: number) => {
    return false; // Override this if needed for specific UI requirements
  };

  // Handle player score change for Best Ball
  const handleTeamPlayerScoreChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    holeNumber: number,
    playerName: string,
    team: string
  ) => {
    if (!canEditScores || locked) return;
    
    const value = e.target.value.trim();
    const score = value === "" ? null : parseInt(value, 10);
    
    if ((score !== null && (isNaN(score) || score < 1 || score > 15)) && value !== "") {
      return; // Invalid score
    }
    
    // Find the player
    const player = allPlayers.find((p) => p.name === playerName);
    if (!player) return;
    
    // Calculate handicap strokes for this hole
    const playerId = player.id;
    const handicapStrokes = getHandicapStrokes(playerId, holeNumber);
    
    // Calculate net score
    const netScore = score !== null && handicapStrokes > 0
      ? Math.max(0, score - handicapStrokes)
      : score;
    
    // Create a unique key for this player and hole
    const key = `${holeNumber}-${playerName}`;
    
    // Update player scores
    setPlayerScores(prev => {
      const newScores = new Map(prev);
      
      const playerScore: BestBallPlayerScore = {
        player: playerName,
        playerId,
        score,
        teamId: team.toLowerCase(),
        handicapStrokes,
        netScore
      };
      
      newScores.set(key, [playerScore]);
      return newScores;
    });
    
    // Find existing score record or prepare to create a new one
    const existingScore = bestBallScores.find((s: any) => 
      s.playerId === playerId && s.holeNumber === holeNumber
    );
    
    // Prepare data for API
    const scoreData = {
      id: existingScore?.id,
      matchId,
      playerId,
      holeNumber,
      score,
      handicapStrokes,
      netScore
    };
    
    // Send to API
    savePlayerScoreMutation.mutate(scoreData);
    
    // If onBestBallScoreUpdate exists, update parent component
    if (onBestBallScoreUpdate) {
      // Gather all scores for this hole
      const holeScores: BestBallPlayerScore[] = [];
      
      for (const [scoreKey, scoreList] of playerScores.entries()) {
        if (scoreKey.startsWith(`${holeNumber}-`)) {
          holeScores.push(...scoreList);
        }
      }
      
      // Add or update the current score
      const currentScoreIndex = holeScores.findIndex(s => s.player === playerName && s.teamId === team.toLowerCase());
      if (currentScoreIndex !== -1) {
        holeScores[currentScoreIndex] = {
          player: playerName,
          playerId,
          score,
          teamId: team.toLowerCase(),
          handicapStrokes,
          netScore
        };
      } else {
        holeScores.push({
          player: playerName,
          playerId,
          score,
          teamId: team.toLowerCase(),
          handicapStrokes,
          netScore
        });
      }
      
      onBestBallScoreUpdate(holeNumber, holeScores);
    }
  };

  // Get front nine total for a player
  const getFrontNineTotal = (playerName: string) => {
    return frontNineTotals.get(playerName) || "";
  };

  // Get back nine total for a player
  const getBackNineTotal = (playerName: string) => {
    return backNineTotals.get(playerName) || "";
  };

  return (
    <div className="overflow-x-auto pb-10 relative">
      <style>
        {`
        .scorecard-container {
          overflow-x: auto;
          width: 100%;
        }
        
        .sticky-column {
          position: sticky;
          left: 0;
          z-index: 10;
        }
        
        .non-counting-score {
          opacity: 0.5;
        }
        
        .scorecard-cell {
          min-width: 50px;
          position: relative;
        }
        
        .border-aviator {
          border-color: #0033a0;
        }
        
        .bg-aviator {
          background-color: #0033a0;
        }
        
        .border-producer {
          border-color: #c41230;
        }
        
        .bg-producer {
          background-color: #c41230;
        }
        
        .handicap-strokes {
          position: absolute;
          top: 2px;
          left: 2px;
          display: flex;
        }
        
        .handicap-indicator {
          width: 3px;
          height: 3px;
          background-color: goldenrod;
          border-radius: 50%;
          margin-right: 1px;
        }
        
        .handicap-stroke {
          border-color: goldenrod !important;
        }
        
        .net-score {
          position: absolute;
          bottom: 0;
          right: 2px;
          font-size: 8px;
          color: goldenrod;
        }
        `}
      </style>
      
      <Dialog open={isEditingHandicap} onOpenChange={setIsEditingHandicap}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Player Course Handicap</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              type="number"
              value={newHandicap}
              onChange={(e) => setNewHandicap(e.target.value)}
              min="0"
              max="36"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditingHandicap(false)}
            >
              Cancel
            </Button>
            <Button onClick={saveHandicap}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      <table className="w-full border-collapse text-sm scorecard-container">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="py-2 px-2 sticky-column bg-white z-20 text-left">Hole</th>
            {frontNine.map((hole) => (
              <th key={hole.number} className="py-2 px-2 text-center">
                {hole.number}
              </th>
            ))}
            <th className="py-2 px-2 text-center bg-gray-100">OUT</th>
            {backNine.map((hole) => (
              <th key={hole.number} className="py-2 px-2 text-center">
                {hole.number}
              </th>
            ))}
            <th className="py-2 px-2 text-center bg-gray-100">IN</th>
            <th className="py-2 px-2 text-center bg-gray-200">TOT</th>
          </tr>
          <tr className="border-b border-gray-200">
            <td className="py-2 px-2 sticky-column bg-white font-semibold">Par</td>
            {frontNine.map((hole) => (
              <td key={hole.number} className="py-2 px-2 text-center">
                {hole.par}
              </td>
            ))}
            <td className="py-2 px-2 text-center font-semibold bg-gray-100">
              {frontNine.reduce((sum, hole) => sum + (hole.par || 0), 0)}
            </td>
            {backNine.map((hole) => (
              <td key={hole.number} className="py-2 px-2 text-center">
                {hole.par}
              </td>
            ))}
            <td className="py-2 px-2 text-center font-semibold bg-gray-100">
              {backNine.reduce((sum, hole) => sum + (hole.par || 0), 0)}
            </td>
            <td className="py-2 px-2 text-center font-semibold bg-gray-200">
              {holes.reduce((sum, hole) => sum + (hole.par || 0), 0)}
            </td>
          </tr>
        </thead>
        <tbody>
          {/* Aviator Players Rows for Best Ball - displayed above team row */}
          {isBestBall && (
            <>
              {participants
                .filter((p: any) => p.team === "aviator" || p.team === "aviators")
                .map((p: any) => {
                  const player = allPlayers.find((player: any) => player.id === p.playerId);
                  if (!player) return null;
                  
                  return (
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
                              {/* Handicap Strokes Indicators - Always show if available */}
                              {getHandicapStrokes(player.id, hole.number) > 0 && (
                                <div className="handicap-strokes">
                                  {Array.from({ length: getHandicapStrokes(player.id, hole.number) }).map((_, i) => (
                                    <div key={i} className="handicap-indicator"></div>
                                  ))}
                                </div>
                              )}
                              <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                data-strokes={getHandicapStrokes(player.id, hole.number)}
                                className={`score-input w-8 h-8 text-center border border-gray-300 rounded 
                                  ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed" : ""} 
                                  ${!isLowest ? "non-counting-score" : ""}
                                  ${getHandicapStrokes(player.id, hole.number) > 0 ? "handicap-stroke" : ""}`}
                                value={getPlayerScoreValue(
                                  hole.number,
                                  player.name,
                                  "aviator",
                                )}
                                onChange={(e) => handleTeamPlayerScoreChange(e, hole.number, player.name, "aviator")}
                                readOnly={isHoleGreyedOut(hole.number) || locked || !canEditScores}
                              />
                              {/* Net Score Display - only show when score is entered and has strokes */}
                              {getPlayerScoreValue(hole.number, player.name, "aviator") !== "" && 
                               getHandicapStrokes(player.id, hole.number) > 0 && (
                                <span className="net-score">
                                  ({(parseInt(getPlayerScoreValue(hole.number, player.name, "aviator"), 10) - 
                                     getHandicapStrokes(player.id, hole.number))})
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      
                      {/* Front Nine Total Cell */}
                      <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                        {getFrontNineTotal(player.name)}
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
                              {/* Handicap Strokes Indicators - Always show if available */}
                              {getHandicapStrokes(player.id, hole.number) > 0 && (
                                <div className="handicap-strokes">
                                  {Array.from({ length: getHandicapStrokes(player.id, hole.number) }).map((_, i) => (
                                    <div key={i} className="handicap-indicator"></div>
                                  ))}
                                </div>
                              )}
                              <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                data-strokes={getHandicapStrokes(player.id, hole.number)}
                                className={`score-input w-8 h-8 text-center border border-gray-300 rounded 
                                  ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed" : ""} 
                                  ${!isLowest ? "non-counting-score" : ""}
                                  ${getHandicapStrokes(player.id, hole.number) > 0 ? "handicap-stroke" : ""}`}
                                value={getPlayerScoreValue(
                                  hole.number,
                                  player.name,
                                  "aviator",
                                )}
                                onChange={(e) => handleTeamPlayerScoreChange(e, hole.number, player.name, "aviator")}
                                readOnly={isHoleGreyedOut(hole.number) || locked || !canEditScores}
                              />
                              {/* Net Score Display - only show when score is entered and has strokes */}
                              {getPlayerScoreValue(hole.number, player.name, "aviator") !== "" && 
                               getHandicapStrokes(player.id, hole.number) > 0 && (
                                <span className="net-score">
                                  ({(parseInt(getPlayerScoreValue(hole.number, player.name, "aviator"), 10) - 
                                     getHandicapStrokes(player.id, hole.number))})
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      
                      {/* Back Nine Total Cell */}
                      <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                        {getBackNineTotal(player.name)}
                      </td>
                      
                      {/* 18-hole Total Cell */}
                      <td className="py-2 px-2 text-center font-semibold bg-gray-200">
                        {playerTotals.get(player.name) || ""}
                      </td>
                    </tr>
                  );
                })}
            </>
          )}

          {/* Team Aviators Row */}
          <tr className="border-b border-gray-200">
            <td className="py-2 px-2 font-semibold sticky-column bg-aviator text-white">
              Aviators
            </td>
            {frontNine.map((hole) => {
              const score = scores.find((s) => s.holeNumber === hole.number);
              return (
                <td
                  key={hole.number}
                  className={`py-2 px-2 text-center ${
                    score?.winningTeam === "aviator"
                      ? "bg-aviator bg-opacity-20"
                      : score?.winningTeam === "producer"
                      ? "bg-producer bg-opacity-20"
                      : score?.winningTeam === "tie"
                      ? "bg-gray-200"
                      : ""
                  }`}
                >
                  {!isBestBall && canEditScores && !locked ? (
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-8 h-8 text-center border border-gray-300 rounded"
                      value={score?.aviatorScore !== null ? score?.aviatorScore : ""}
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        if (value === "") {
                          onScoreUpdate(hole.number, null, score?.producerScore || null);
                        } else {
                          const newValue = parseInt(value, 10);
                          if (!isNaN(newValue) && newValue >= 0) {
                            onScoreUpdate(
                              hole.number,
                              newValue,
                              score?.producerScore || null
                            );
                          }
                        }
                      }}
                      min="1"
                      max="10"
                    />
                  ) : (
                    <div>{score?.aviatorScore !== null ? score?.aviatorScore : "-"}</div>
                  )}
                </td>
              );
            })}
            <td className="py-2 px-2 text-center font-semibold bg-gray-100">
              {scores
                .filter((s) => s.holeNumber <= 9)
                .reduce(
                  (sum, s) => sum + (s.aviatorScore !== null ? s.aviatorScore : 0),
                  0
                )}
            </td>
            {backNine.map((hole) => {
              const score = scores.find((s) => s.holeNumber === hole.number);
              return (
                <td
                  key={hole.number}
                  className={`py-2 px-2 text-center ${
                    score?.winningTeam === "aviator"
                      ? "bg-aviator bg-opacity-20"
                      : score?.winningTeam === "producer"
                      ? "bg-producer bg-opacity-20"
                      : score?.winningTeam === "tie"
                      ? "bg-gray-200"
                      : ""
                  }`}
                >
                  {!isBestBall && canEditScores && !locked ? (
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-8 h-8 text-center border border-gray-300 rounded"
                      value={score?.aviatorScore !== null ? score?.aviatorScore : ""}
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        if (value === "") {
                          onScoreUpdate(hole.number, null, score?.producerScore || null);
                        } else {
                          const newValue = parseInt(value, 10);
                          if (!isNaN(newValue) && newValue >= 0) {
                            onScoreUpdate(
                              hole.number,
                              newValue,
                              score?.producerScore || null
                            );
                          }
                        }
                      }}
                      min="1"
                      max="10"
                    />
                  ) : (
                    <div>{score?.aviatorScore !== null ? score?.aviatorScore : "-"}</div>
                  )}
                </td>
              );
            })}
            <td className="py-2 px-2 text-center font-semibold bg-gray-100">
              {scores
                .filter((s) => s.holeNumber > 9)
                .reduce(
                  (sum, s) => sum + (s.aviatorScore !== null ? s.aviatorScore : 0),
                  0
                )}
            </td>
            <td className="py-2 px-2 text-center font-semibold bg-gray-200">
              {scores.reduce(
                (sum, s) => sum + (s.aviatorScore !== null ? s.aviatorScore : 0),
                0
              )}
            </td>
          </tr>

          {/* Producer Players Rows for Best Ball - displayed above team row */}
          {isBestBall && (
            <>
              {participants
                .filter((p: any) => p.team === "producer" || p.team === "producers")
                .map((p: any) => {
                  const player = allPlayers.find((player: any) => player.id === p.playerId);
                  if (!player) return null;
                  
                  return (
                    <tr key={player.id} className="border-b border-gray-200">
                      <td className="py-2 px-2 sticky-column bg-white border-l-4 border-producer">
                        <div className="flex justify-between items-center">
                          <div className="text-xs font-medium text-black leading-tight">
                            <div className="font-semibold">{player.name}</div>
                            <div className="text-red-600">
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
                              {/* Handicap Strokes Indicators - Always show if available */}
                              {getHandicapStrokes(player.id, hole.number) > 0 && (
                                <div className="handicap-strokes">
                                  {Array.from({ length: getHandicapStrokes(player.id, hole.number) }).map((_, i) => (
                                    <div key={i} className="handicap-indicator"></div>
                                  ))}
                                </div>
                              )}
                              <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                data-strokes={getHandicapStrokes(player.id, hole.number)}
                                className={`score-input w-8 h-8 text-center border border-gray-300 rounded 
                                  ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed" : ""} 
                                  ${!isLowest ? "non-counting-score" : ""}
                                  ${getHandicapStrokes(player.id, hole.number) > 0 ? "handicap-stroke" : ""}`}
                                value={getPlayerScoreValue(
                                  hole.number,
                                  player.name,
                                  "producer",
                                )}
                                onChange={(e) => handleTeamPlayerScoreChange(e, hole.number, player.name, "producer")}
                                readOnly={isHoleGreyedOut(hole.number) || locked || !canEditScores}
                              />
                              {/* Net Score Display - only show when score is entered and has strokes */}
                              {getPlayerScoreValue(hole.number, player.name, "producer") !== "" && 
                               getHandicapStrokes(player.id, hole.number) > 0 && (
                                <span className="net-score">
                                  ({(parseInt(getPlayerScoreValue(hole.number, player.name, "producer"), 10) - 
                                     getHandicapStrokes(player.id, hole.number))})
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      
                      {/* Front Nine Total Cell */}
                      <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                        {getFrontNineTotal(player.name)}
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
                              {/* Handicap Strokes Indicators - Always show if available */}
                              {getHandicapStrokes(player.id, hole.number) > 0 && (
                                <div className="handicap-strokes">
                                  {Array.from({ length: getHandicapStrokes(player.id, hole.number) }).map((_, i) => (
                                    <div key={i} className="handicap-indicator"></div>
                                  ))}
                                </div>
                              )}
                              <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                data-strokes={getHandicapStrokes(player.id, hole.number)}
                                className={`score-input w-8 h-8 text-center border border-gray-300 rounded 
                                  ${isHoleGreyedOut(hole.number) ? "bg-gray-200 cursor-not-allowed" : ""} 
                                  ${!isLowest ? "non-counting-score" : ""}
                                  ${getHandicapStrokes(player.id, hole.number) > 0 ? "handicap-stroke" : ""}`}
                                value={getPlayerScoreValue(
                                  hole.number,
                                  player.name,
                                  "producer",
                                )}
                                onChange={(e) => handleTeamPlayerScoreChange(e, hole.number, player.name, "producer")}
                                readOnly={isHoleGreyedOut(hole.number) || locked || !canEditScores}
                              />
                              {/* Net Score Display - only show when score is entered and has strokes */}
                              {getPlayerScoreValue(hole.number, player.name, "producer") !== "" && 
                               getHandicapStrokes(player.id, hole.number) > 0 && (
                                <span className="net-score">
                                  ({(parseInt(getPlayerScoreValue(hole.number, player.name, "producer"), 10) - 
                                     getHandicapStrokes(player.id, hole.number))})
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      
                      {/* Back Nine Total Cell */}
                      <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                        {getBackNineTotal(player.name)}
                      </td>
                      
                      {/* 18-hole Total Cell */}
                      <td className="py-2 px-2 text-center font-semibold bg-gray-200">
                        {playerTotals.get(player.name) || ""}
                      </td>
                    </tr>
                  );
                })}
            </>
          )}

          {/* Team Producers Row */}
          <tr className="border-b border-gray-200">
            <td className="py-2 px-2 font-semibold sticky-column bg-producer text-white">
              Producers
            </td>
            {frontNine.map((hole) => {
              const score = scores.find((s) => s.holeNumber === hole.number);
              return (
                <td
                  key={hole.number}
                  className={`py-2 px-2 text-center ${
                    score?.winningTeam === "producer"
                      ? "bg-producer bg-opacity-20"
                      : score?.winningTeam === "aviator"
                      ? "bg-aviator bg-opacity-20"
                      : score?.winningTeam === "tie"
                      ? "bg-gray-200"
                      : ""
                  }`}
                >
                  {!isBestBall && canEditScores && !locked ? (
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-8 h-8 text-center border border-gray-300 rounded"
                      value={
                        score?.producerScore !== null ? score?.producerScore : ""
                      }
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        if (value === "") {
                          onScoreUpdate(
                            hole.number,
                            score?.aviatorScore || null,
                            null
                          );
                        } else {
                          const newValue = parseInt(value, 10);
                          if (!isNaN(newValue) && newValue >= 0) {
                            onScoreUpdate(
                              hole.number,
                              score?.aviatorScore || null,
                              newValue
                            );
                          }
                        }
                      }}
                      min="1"
                      max="10"
                    />
                  ) : (
                    <div>
                      {score?.producerScore !== null ? score?.producerScore : "-"}
                    </div>
                  )}
                </td>
              );
            })}
            <td className="py-2 px-2 text-center font-semibold bg-gray-100">
              {scores
                .filter((s) => s.holeNumber <= 9)
                .reduce(
                  (sum, s) => sum + (s.producerScore !== null ? s.producerScore : 0),
                  0
                )}
            </td>
            {backNine.map((hole) => {
              const score = scores.find((s) => s.holeNumber === hole.number);
              return (
                <td
                  key={hole.number}
                  className={`py-2 px-2 text-center ${
                    score?.winningTeam === "producer"
                      ? "bg-producer bg-opacity-20"
                      : score?.winningTeam === "aviator"
                      ? "bg-aviator bg-opacity-20"
                      : score?.winningTeam === "tie"
                      ? "bg-gray-200"
                      : ""
                  }`}
                >
                  {!isBestBall && canEditScores && !locked ? (
                    <input
                      type="tel"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      className="w-8 h-8 text-center border border-gray-300 rounded"
                      value={
                        score?.producerScore !== null ? score?.producerScore : ""
                      }
                      onChange={(e) => {
                        const value = e.target.value.trim();
                        if (value === "") {
                          onScoreUpdate(
                            hole.number,
                            score?.aviatorScore || null,
                            null
                          );
                        } else {
                          const newValue = parseInt(value, 10);
                          if (!isNaN(newValue) && newValue >= 0) {
                            onScoreUpdate(
                              hole.number,
                              score?.aviatorScore || null,
                              newValue
                            );
                          }
                        }
                      }}
                      min="1"
                      max="10"
                    />
                  ) : (
                    <div>
                      {score?.producerScore !== null ? score?.producerScore : "-"}
                    </div>
                  )}
                </td>
              );
            })}
            <td className="py-2 px-2 text-center font-semibold bg-gray-100">
              {scores
                .filter((s) => s.holeNumber > 9)
                .reduce(
                  (sum, s) => sum + (s.producerScore !== null ? s.producerScore : 0),
                  0
                )}
            </td>
            <td className="py-2 px-2 text-center font-semibold bg-gray-200">
              {scores.reduce(
                (sum, s) => sum + (s.producerScore !== null ? s.producerScore : 0),
                0
              )}
            </td>
          </tr>

          {/* Match Status Row */}
          <tr className="bg-gray-50 border-t-2 border-gray-300">
            <td className="py-2 px-2 font-semibold sticky-column bg-gray-50">
              Status
            </td>
            {frontNine.map((hole) => {
              const score = scores.find((s) => s.holeNumber === hole.number);
              return (
                <td key={hole.number} className="py-2 px-2 text-center text-xs">
                  {score?.matchStatus || "-"}
                </td>
              );
            })}
            <td className="py-2 px-2 text-center font-semibold bg-gray-100">
              {/* Front 9 status summary */}
            </td>
            {backNine.map((hole) => {
              const score = scores.find((s) => s.holeNumber === hole.number);
              return (
                <td key={hole.number} className="py-2 px-2 text-center text-xs">
                  {score?.matchStatus || "-"}
                </td>
              );
            })}
            <td className="py-2 px-2 text-center font-semibold bg-gray-100">
              {/* Back 9 status summary */}
            </td>
            <td className="py-2 px-2 text-center font-semibold bg-gray-200">
              {matchStatus}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default EnhancedMatchScorecard;