import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { BestBallScore, PlayerScore } from "@shared/schema";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import "./BestBallScorecard.css";

// Add styles directly in the component
const styles = {
  scorecardContainer: {
    margin: 0,
    padding: 0,
    fontFamily: 'var(--font-sans)',
  },
  scorecardGrid: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '130px 40px repeat(9, minmax(32px, 1fr)) 50px repeat(9, minmax(32px, 1fr)) 50px 50px',
    gridAutoRows: '36px',
    border: '1px solid hsl(var(--border))',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    backgroundColor: 'hsl(var(--background))',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
  },
  scorecardCell: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    borderRight: '1px solid hsl(var(--border))',
    borderBottom: '1px solid hsl(var(--border))',
    fontSize: '0.9rem',
  },
  headerRow: {
    fontWeight: 600,
    backgroundColor: 'hsl(var(--muted))',
  },
  playerHeader: {
    fontWeight: 600,
    backgroundColor: 'hsl(var(--muted))',
  },
  handicapHeader: {
    fontWeight: 600,
    backgroundColor: 'hsl(var(--muted))',
  },
  holeNumber: {
    fontWeight: 600,
    backgroundColor: 'hsl(var(--muted))',
  },
  totalHeader: {
    fontWeight: 600,
    backgroundColor: 'hsl(var(--muted))',
  },
  parRow: {
    backgroundColor: 'hsl(var(--muted))',
  },
  handicapRow: {
    backgroundColor: 'hsl(var(--muted))',
  },
  parLabel: {
    textAlign: 'left',
    paddingLeft: '10px',
    fontWeight: 600,
  },
  handicapLabel: {
    textAlign: 'left',
    paddingLeft: '10px',
    fontWeight: 600,
  },
  parValue: {
    fontWeight: 500,
  },
  handicapValue: {
    fontWeight: 500,
  },
  empty: {
    backgroundColor: 'hsl(var(--muted))',
  },
  teamHeader: {
    gridColumn: 1,
    fontWeight: 600,
    textAlign: 'left',
    paddingLeft: '10px',
  },
  teamHeaderAviators: {
    backgroundColor: 'var(--aviator-bg)',
    color: 'var(--aviator-text)',
  },
  teamHeaderProducers: {
    backgroundColor: 'var(--producer-bg)',
    color: 'var(--producer-text)',
  },
  playerName: {
    textAlign: 'left',
    paddingLeft: '10px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  playerNameAviator: {
    color: 'var(--aviator-text)',
    borderLeft: '4px solid var(--aviator-accent)',
  },
  playerNameProducer: {
    color: 'var(--producer-text)',
    borderLeft: '4px solid var(--producer-accent)',
  },
  playerHandicap: {
    fontWeight: 500,
  },
  scoreInputCell: {
    position: 'relative',
    padding: '2px',
  },
  scoreInput: {
    width: '100%',
    height: '100%',
    border: 'none',
    textAlign: 'center',
    fontSize: '14px',
    background: 'transparent',
    outline: 'none',
  },
  bestScore: {
    backgroundColor: 'rgba(var(--success-rgb), 0.1)',
  },
  netScore: {
    position: 'absolute',
    bottom: '2px',
    right: '2px',
    fontSize: '9px',
    color: 'hsl(var(--muted-foreground))',
  },
  handicapDot: {
    color: 'hsl(var(--destructive))',
    fontSize: '12px',
    marginLeft: '1px',
  },
  playerTotal: {
    fontWeight: 600,
    backgroundColor: 'hsl(var(--muted))',
  },
  teamTotal: {
    fontWeight: 600,
    backgroundColor: 'hsl(var(--accent))',
  },
};

// Player score interface for Best Ball
interface BestBallPlayerScore {
  player: string;
  score: number | null;
  teamId: string;
  playerId: number;
  handicapStrokes?: number;
  netScore?: number | null;
  isBestBall?: boolean;
}

// Score interface for team totals
interface HoleScore {
  holeNumber: number;
  aviatorScore: number | null;
  producerScore: number | null;
}

interface ScorecardProps {
  matchId: number;
  holes: any[];
  aviatorPlayersList?: any[];
  producerPlayersList?: any[];
  participants: any[];
  scores: HoleScore[];
  locked?: boolean;
  isAviators?: boolean;
  isProducers?: boolean;
  isBestBall?: boolean;
  matchData?: any;
  roundHandicaps?: any[];
  /** Callback for updating team scores */
  onScoreUpdate?: (
    hole: number,
    aviatorScore: number | null,
    producerScore: number | null,
  ) => void;
  /** @deprecated use onScoreUpdate instead */
  onUpdateScores?: (scores: HoleScore[]) => void;
  canEditScores?: boolean;
}

/**
 * Enhanced Match Scorecard Component
 * 
 * Renders a match scorecard with individual and team scores
 * Supports different match formats including:
 * - Best Ball (2-man team with net scores)
 * - Singles
 * - Team formats
 * 
 * Features:
 * - Editable scores with permissions control
 * - Handicap calculations
 * - Live score updates
 * - Mobile-friendly design
 */
const EnhancedMatchScorecard: React.FC<ScorecardProps> = ({
  matchId,
  holes = [],
  aviatorPlayersList = [], // Now received as prop
  producerPlayersList = [], // Now received as prop
  participants = [],
  scores = [],
  locked = false,
  isAviators = false, // This prop seems unused, consider removing if not needed
  isProducers = false, // This prop seems unused, consider removing if not needed
  isBestBall = false, // Now received as prop
  matchData = null,
  roundHandicaps = [],
  onScoreUpdate,
  onUpdateScores,
  canEditScores = true,
}) => {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  
  const [playerScores, setPlayerScores] = useState<Map<string, BestBallPlayerScore[]>>(new Map());
  const [playerTotals, setPlayerTotals] = useState<Map<string, number>>(new Map());
  const [playerFrontNineTotals, setPlayerFrontNineTotals] = useState<Map<string, number>>(new Map());
  const [playerBackNineTotals, setPlayerBackNineTotals] = useState<Map<string, number>>(new Map());

  // Local copy of team scores so we can edit before persisting
  const [teamScores, setTeamScores] = useState<HoleScore[]>([]);
  
  const [handicapDialogOpen, setHandicapDialogOpen] = useState(false);
  const [currentHandicapPlayer, setCurrentHandicapPlayer] = useState<number | null>(null);
  const [handicapValue, setHandicapValue] = useState<number>(0);
  const [playerHandicaps, setPlayerHandicaps] = useState<Map<number, number>>(new Map());
  const [holeArray, setHoleArray] = useState<any[]>([]);

  // Keep local team score state in sync with scores prop
  useEffect(() => {
    setTeamScores(scores);
  }, [scores]);
  
  // Load match scores
  const { data: matchScores, isLoading: scoresLoading } = useQuery<HoleScore[]>({
    queryKey: [`/api/scores?matchId=${matchId}`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/scores?matchId=${matchId}`);
      if (!response) throw new Error('No response for match scores');
      return response.json();
    },
    enabled: !!matchId,
  });
  
  // Load individual player scores from best ball table if this is a best ball match
  const { data: individualScores, isLoading: individualScoresLoading } = useQuery<BestBallScore[]>({
    queryKey: [`/api/best-ball-scores/${matchId}`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/best-ball-scores/${matchId}`);
      if (!response) throw new Error('No response for best ball scores');
      return response.json();
    },
    enabled: !!matchId && isBestBall,
  });
  
  // Load player scores from the player_scores table
  const { data: existingPlayerScores, isLoading: existingScoresLoading } = useQuery<PlayerScore[]>({
    queryKey: [`/api/player-scores?matchId=${matchId}`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/player-scores?matchId=${matchId}`);
      if (!response) throw new Error('No response for player scores');
      return response.json();
    },
    enabled: !!matchId,
  });
  
  // Mutation for saving best ball scores
  const saveScoreMutation = useMutation({
    mutationFn: async (score: {
      matchId: number;
      playerId: number;
      holeNumber: number;
      score: number | null;
      handicapStrokes: number;
      netScore: number | null;
    }) => {
      const response = await fetch('/api/best-ball-scores', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(score),
      });
      
      if (!response.ok) {
        throw new Error('Failed to save best ball score');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/best-ball-scores/${matchId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/player-scores?matchId=${matchId}`] });
    },
    onError: (error) => {
      console.error('Error saving score:', error);
      toast({
        title: 'Error',
        description: 'Failed to save score. Please try again.',
        variant: 'destructive',
      });
    },
  });
  
  // Mutation for saving player scores
  const savePlayerScoreMutation = useMutation({
    mutationFn: (data: {
      playerId: number;
      matchId: number;
      holeNumber: number;
      score: number;
      tournamentId?: number;
    }) => {
      return apiRequest("POST", "/api/player-scores", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/player-scores?matchId=${matchId}`] });
    },
    onError: (error) => {
      console.error('Error saving player score:', error);
    },
  });

  // Get player course handicap (from handicaps state or roundHandicaps prop)
  const getPlayerCourseHandicap = useCallback((playerId: number): number => {
    // First check our local state for any temporarily updated handicaps
    if (playerHandicaps.has(playerId)) {
      return playerHandicaps.get(playerId) || 0;
    }
    
    // Otherwise fall back to the roundHandicaps data
    const playerHandicap = roundHandicaps?.find(h => h.playerId === playerId);
    return playerHandicap?.courseHandicap || 0;
  }, [playerHandicaps, roundHandicaps]);

  // Load individual scores from best ball table
  useEffect(() => {
    if (!isBestBall || !individualScores || individualScores.length === 0) {
      return;
    }
    
    console.log("Loading scores from best_ball_player_scores table:", individualScores.length, "scores found");
    
    // BUILD AND SET THE PLAYER SCORES AS A SINGLE OPERATION
    setPlayerScores(prevScores => {
      const newPlayerScores = new Map(prevScores);
      
      individualScores.forEach(score => {
        const player = [...aviatorPlayersList, ...producerPlayersList].find(p => p.id === score.playerId);
        
        if (!player) return;
        
        const teamId = player.teamId === 1 ? "aviator" : "producer";
        const playerKey = `${score.holeNumber}-${player.name}`;
        const teamKey = `${score.holeNumber}-${teamId}`;
        
        // Create player score object
        const playerScoreObj = {
          player: player.name,
          score: score.score,
          teamId,
          playerId: player.id,
          handicapStrokes: score.handicapStrokes || 0,
          netScore: score.netScore,
          isBestBall: false, // Will be set in a later step
        };
        
        // Add to player-specific and team collections
        newPlayerScores.set(playerKey, [playerScoreObj]);
        
        const existingTeamScores = newPlayerScores.get(teamKey) || [];
        const existingIndex = existingTeamScores.findIndex(s => s.playerId === player.id);
        
        if (existingIndex >= 0) {
          existingTeamScores[existingIndex] = playerScoreObj;
        } else {
          existingTeamScores.push(playerScoreObj);
        }
        
        newPlayerScores.set(teamKey, existingTeamScores);
      });
      
      // Calculate best ball scores for all holes
      if (holes && holes.length > 0) {
        holes.forEach(hole => {
          const holeNumber = hole.number;
          const aviatorTeamKey = `${holeNumber}-aviator`;
          const producerTeamKey = `${holeNumber}-producer`;
          
          // CALCULATE BEST BALL FOR AVIATORS
          const aviatorScores = newPlayerScores.get(aviatorTeamKey) || [];
          if (aviatorScores.length > 0) {
            // Reset all isBestBall flags initially
            aviatorScores.forEach(s => { s.isBestBall = false; });
            
            // Filter valid scores and find lowest net
            const validScores = aviatorScores.filter(s => s.score !== null);
            
            if (validScores.length > 0) {
              // Make sure all net scores are calculated
              validScores.forEach(s => {
                if (s.netScore === null && s.score !== null) {
                  s.netScore = Math.max(0, s.score - (s.handicapStrokes || 0));
                }
              });
              
              // Find lowest net score
              const lowestNetPlayer = validScores.reduce((lowest, current) => {
                const lowestNet = lowest.netScore ?? 99;
                const currentNet = current.netScore ?? 99;
                return currentNet < lowestNet ? current : lowest;
              }, validScores[0]);
              
              // Mark as best ball
              if (lowestNetPlayer) {
                lowestNetPlayer.isBestBall = true;
              }
            }
          }
          
          // CALCULATE BEST BALL FOR PRODUCERS
          const producerScores = newPlayerScores.get(producerTeamKey) || [];
          if (producerScores.length > 0) {
            // Reset all isBestBall flags initially
            producerScores.forEach(s => { s.isBestBall = false; });
            
            // Filter valid scores and find lowest net
            const validScores = producerScores.filter(s => s.score !== null);
            
            if (validScores.length > 0) {
              // Make sure all net scores are calculated
              validScores.forEach(s => {
                if (s.netScore === null && s.score !== null) {
                  s.netScore = Math.max(0, s.score - (s.handicapStrokes || 0));
                }
              });
              
              // Find lowest net score
              const lowestNetPlayer = validScores.reduce((lowest, current) => {
                const lowestNet = lowest.netScore ?? 99;
                const currentNet = current.netScore ?? 99;
                return currentNet < lowestNet ? current : lowest;
              }, validScores[0]);
              
              // Mark as best ball
              if (lowestNetPlayer) {
                lowestNetPlayer.isBestBall = true;
              }
            }
          }
        });

        // Build team score array using lowest net from each team
        const newTeamScores: HoleScore[] = holes.map(h => {
          const atk = `${h.number}-aviator`;
          const ptk = `${h.number}-producer`;
          const aVals = (newPlayerScores.get(atk) || []).filter(s => s.score !== null);
          const pVals = (newPlayerScores.get(ptk) || []).filter(s => s.score !== null);

          const bestA = aVals.length
            ? aVals.reduce((l, c) => (c.netScore! < l.netScore! ? c : l)).netScore
            : null;
          const bestP = pVals.length
            ? pVals.reduce((l, c) => (c.netScore! < l.netScore! ? c : l)).netScore
            : null;

          const existing = scores.find(s => s.holeNumber === h.number);
          return {
            holeNumber: h.number,
            aviatorScore: bestA ?? existing?.aviatorScore ?? null,
            producerScore: bestP ?? existing?.producerScore ?? null,
          } as HoleScore;
        });

        setTeamScores(newTeamScores);
      }

      return newPlayerScores;
    });
  }, [individualScores, aviatorPlayersList, producerPlayersList, matchId, holes, getPlayerCourseHandicap]);
  
  // Handle score changes when a user inputs a new score
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
    
    // Parse input value
    let numValue = null;
    if (value !== "") {
      const parsed = parseInt(value);
      if (!isNaN(parsed)) {
        numValue = parsed;
      }
    }
    
    // Find player
    const playerId = teamId === "aviator"
      ? aviatorPlayersList.find((p: any) => p.name === playerName)?.id
      : producerPlayersList.find((p: any) => p.name === playerName)?.id;
    
    if (!playerId) {
      console.warn("Could not find player ID for", playerName);
      return;
    }
    
    // Get handicap information
    const courseHandicap = getPlayerCourseHandicap(playerId);
    const hole = holes.find(h => h.number === holeNumber);
    if (!hole) {
      console.warn("Could not find hole", holeNumber);
      return;
    }
    
    const handicapRank = hole.handicapRank || 0;
    
    // Calculate handicap strokes
    let handicapStrokes = 0;
    if (isBestBall && handicapRank > 0 && courseHandicap >= handicapRank) {
      handicapStrokes = 1;
      if (handicapRank === 1 && courseHandicap >= 19) {
        handicapStrokes = 2;
      }
    }
    
    // Calculate net score
    const netScore = numValue !== null ? Math.max(0, numValue - handicapStrokes) : null;
    
    // Create player score object
    const playerScoreObj: BestBallPlayerScore = {
      player: playerName,
      score: numValue,
      teamId,
      playerId,
      handicapStrokes,
      netScore
    };
    
    // Update local state immediately for responsive UI
    setPlayerScores(prevScores => {
      const newScores = new Map(prevScores);
      
      // Update player's individual score
      const playerKey = `${holeNumber}-${playerName}`;
      newScores.set(playerKey, [playerScoreObj]);
      
      // Update team collection
      const teamKey = `${holeNumber}-${teamId}`;
      const teamScoreList = [...(newScores.get(teamKey) || [])];
      const existingIndex = teamScoreList.findIndex(s => s.playerId === playerId);
      
      if (existingIndex >= 0) {
        teamScoreList[existingIndex] = playerScoreObj;
      } else {
        teamScoreList.push(playerScoreObj);
      }

      newScores.set(teamKey, teamScoreList);

      // Calculate best ball for this hole only
      if (isBestBall) {
        // Reset isBestBall flags
        teamScoreList.forEach(s => { s.isBestBall = false; });

        // Filter valid scores
        const validScores = teamScoreList.filter(s => s.score !== null);
        
        if (validScores.length > 0) {
          // Calculate net scores if needed
          validScores.forEach(s => {
            if (s.netScore === null && s.score !== null) {
              s.netScore = Math.max(0, s.score - (s.handicapStrokes || 0));
            }
          });
          
          // Find lowest net score
          const lowestScorePlayer = validScores.reduce((lowest, current) => {
            const lowestNet = lowest.netScore ?? 99;
            const currentNet = current.netScore ?? 99;
            return currentNet < lowestNet ? current : lowest;
          }, validScores[0]);
          
          // Mark best ball
          if (lowestScorePlayer) {
            lowestScorePlayer.isBestBall = true;
          }

          // Update team score for this hole using lowest net
          const best = validScores.reduce(
            (l, c) => ((c.netScore ?? 99) < (l.netScore ?? 99) ? c : l),
            validScores[0],
          );
          setTeamScores((prev) =>
            prev.map((sc) =>
              sc.holeNumber === holeNumber
                ? {
                    ...sc,
                    aviatorScore:
                      teamId === 'aviator'
                        ? best.netScore ?? sc.aviatorScore
                        : sc.aviatorScore,
                    producerScore:
                      teamId === 'producer'
                        ? best.netScore ?? sc.producerScore
                        : sc.producerScore,
                  }
                : sc,
            ),
          );
        }
      }

      return newScores;
    });
    
    // Save score to database
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
        }
      }
    } catch (error) {
      console.error("Error saving score:", error);
    }
    
    // Auto-blur input for better mobile UX
    setTimeout(() => {
      if (value !== "1" && value !== "") {
        target.blur();
      }
    }, 100);
  }; 

  // Handle changes to team scores for scramble/shamble formats
  const handleTeamScoreChange = (
    holeNumber: number,
    teamId: 'aviator' | 'producer',
    value: string,
  ) => {
    if (!canEditScores || locked) return;

    const num = value === '' ? null : parseInt(value);

    setTeamScores(prev => {
      const updated = prev.map(s =>
        s.holeNumber === holeNumber
          ? {
              ...s,
              aviatorScore: teamId === 'aviator' ? num : s.aviatorScore,
              producerScore: teamId === 'producer' ? num : s.producerScore,
            }
          : s,
      );

      const score = updated.find(s => s.holeNumber === holeNumber);
      if (onScoreUpdate && score) {
        onScoreUpdate(holeNumber, score.aviatorScore, score.producerScore);
      }
      return updated;
    });
  };

  // Function to get player score for rendering in inputs
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
  
  // Function to determine if a player score is the lowest (best ball)
  const isLowestScore = (
    holeNumber: number,
    playerName: string,
    teamId: string,
  ): boolean => {
    const teamKey = `${holeNumber}-${teamId}`;
    const holeScores = playerScores.get(teamKey) || [];
    
    // Find this player's score object
    const currentPlayerScoreObj = holeScores.find(
      (p) => p.player === playerName,
    );
    
    if (!currentPlayerScoreObj || currentPlayerScoreObj.score === null) {
      return false;
    }
    
    // Filter to only scores that aren't null
    const validScores = holeScores.filter((s) => s.score !== null);
    
    if (validScores.length === 0) return false;
    
    // Find the player with isBestBall flag
    const bestBallPlayer = validScores.find(s => s.isBestBall);
    
    if (bestBallPlayer) {
      return bestBallPlayer.playerId === currentPlayerScoreObj.playerId;
    }
    
    // Fallback if flag isn't set: sort by net score
    validScores.forEach(s => {
      if (s.netScore === null && s.score !== null) {
        s.netScore = s.score - (s.handicapStrokes || 0);
      }
    });
    
    const sortedScores = [...validScores].sort((a, b) => {
      const aNetScore = a.netScore ?? 99;
      const bNetScore = b.netScore ?? 99;
      return aNetScore - bNetScore;
    });
    
    // The lowest net score is the best ball
    const lowestScorePlayer = sortedScores[0];
    return lowestScorePlayer.playerId === currentPlayerScoreObj.playerId;
  };
  
  // Get the team score for a hole
  const getScoreInputValue = (holeNumber: number, teamId: string): string => {
    const score = teamScores.find((s) => s.holeNumber === holeNumber);
    if (!score) return "";

    const value = teamId === "aviator" ? score.aviatorScore : score.producerScore;
    return value !== null ? value.toString() : "";
  };
  
  // Calculate team totals and player totals
  useEffect(() => {
    // Skip if no scores or holes
    if (!playerScores.size || !holes.length) return;

    // Calculate player totals
    const newPlayerTotals = new Map<string, number>();
    const newPlayerFrontNineTotals = new Map<string, number>();
    const newPlayerBackNineTotals = new Map<string, number>();
    
    // Process both teams
    const allPlayers = [...aviatorPlayersList, ...producerPlayersList];
    
    allPlayers.forEach(player => {
      let playerTotal = 0;
      let frontNineTotal = 0;
      let backNineTotal = 0;
      
      // Calculate score for each hole
      holes.forEach(hole => {
        const playerKey = `${hole.number}-${player.name}`;
        const playerScore = playerScores.get(playerKey)?.[0];
        
        if (playerScore?.score !== null && playerScore?.score !== undefined) {
          const score = playerScore.score;
          playerTotal += score;
          
          if (hole.number <= 9) {
            frontNineTotal += score;
          } else {
            backNineTotal += score;
          }
        }
      });
      
      // Only set totals if player has at least one score
      if (playerTotal > 0) {
        newPlayerTotals.set(player.name, playerTotal);
      }
      
      if (frontNineTotal > 0) {
        newPlayerFrontNineTotals.set(player.name, frontNineTotal);
      }
      
      if (backNineTotal > 0) {
        newPlayerBackNineTotals.set(player.name, backNineTotal);
      }
    });
    
    // Only update state if values have changed
    const currentTotals = JSON.stringify(Array.from(newPlayerTotals.entries()));
    const currentFrontNine = JSON.stringify(Array.from(newPlayerFrontNineTotals.entries()));
    const currentBackNine = JSON.stringify(Array.from(newPlayerBackNineTotals.entries()));
    
    const prevTotals = JSON.stringify(Array.from(playerTotals.entries()));
    const prevFrontNine = JSON.stringify(Array.from(playerFrontNineTotals.entries()));
    const prevBackNine = JSON.stringify(Array.from(playerBackNineTotals.entries()));
    
    if (currentTotals !== prevTotals) {
      setPlayerTotals(newPlayerTotals);
    }
    if (currentFrontNine !== prevFrontNine) {
      setPlayerFrontNineTotals(newPlayerFrontNineTotals);
    }
    if (currentBackNine !== prevBackNine) {
      setPlayerBackNineTotals(newPlayerBackNineTotals);
    }
  }, [playerScores, holes, aviatorPlayersList, producerPlayersList, playerTotals, playerFrontNineTotals, playerBackNineTotals]);
  
  // Handle handicap edit dialog
  const handleHandicapEdit = (playerId: number, currentHandicap: number) => {
    setCurrentHandicapPlayer(playerId);
    setHandicapValue(currentHandicap);
    setHandicapDialogOpen(true);
  };
  
  const saveHandicap = () => {
    if (currentHandicapPlayer === null) return;
    
    setPlayerHandicaps(prev => {
      const newHandicaps = new Map(prev);
      newHandicaps.set(currentHandicapPlayer, handicapValue);
      return newHandicaps;
    });
    
    setHandicapDialogOpen(false);
    
    // Recalculate scores with new handicap
    if (holes) {
      holes.forEach(hole => {
        // TODO: Implement recalculation logic for the affected player
      });
    }
  };
  
  // Check if a player should get a stroke on a hole
  const getHandicapStrokes = (playerId: number, holeNumber: number): number => {
    const hole = holes.find((h) => h.number === holeNumber);
    if (!hole) return 0;
    
    const handicapRank = hole.handicapRank || 0;
    if (handicapRank <= 0) return 0;
    
    const courseHandicap = getPlayerCourseHandicap(playerId);
    if (courseHandicap <= 0) return 0;
    
    // Calculate strokes
    if (courseHandicap >= handicapRank) {
      let strokes = 1;
      
      // Double stroke on #1 handicap hole if handicap is high enough
      if (handicapRank === 1 && courseHandicap >= 19) {
        strokes = 2;
      }
      
      return strokes;
    }
    
    return 0;
  };
  
  // Check if a hole is greyed out (can't be edited)
  const isHoleGreyedOut = (holeNumber: number): boolean => {
    if (locked) return true;
    const completedHoles = teamScores
      .filter((s) => s.aviatorScore !== null && s.producerScore !== null)
      .map((s) => s.holeNumber);
    if (completedHoles.length === 0) return false;
    const maxCompletedHole = Math.max(...completedHoles);
    // Original logic: return holeNumber < maxCompletedHole - 1;
    // Let's adjust to allow editing current and past holes if not locked by admin
    // For now, keeping original logic to see logs first
    const greyedOut = holeNumber < maxCompletedHole - 1;
    // console.log(`[EnhancedMatchScorecard] isHoleGreyedOut for hole ${holeNumber}: ${greyedOut} (locked: ${locked}, maxCompletedHole: ${maxCompletedHole})`);
    return greyedOut;
  };
  
  // Helper for match status text
  const generateMatchStatus = (holeNumber: number): { text: string; color: string } => {
    // Check if this hole has been played
    const thisHoleScore = teamScores.find((s) => s.holeNumber === holeNumber);
    if (!thisHoleScore || thisHoleScore.aviatorScore === null || thisHoleScore.producerScore === null) {
      return { text: "-", color: "text-gray-400" }; // Hole not completed yet
    }
    
    // Get completed holes up to this one
    const completedScores = teamScores
      .filter(s => s.holeNumber <= holeNumber && s.aviatorScore !== null && s.producerScore !== null)
      .sort((a, b) => a.holeNumber - b.holeNumber);
    
    if (completedScores.length === 0) return { text: "-", color: "text-gray-400" };
    
    // Calculate running score
    let aviatorWins = 0;
    let producerWins = 0;
    
    for (const score of completedScores) {
      if (score.aviatorScore! < score.producerScore!) {
        aviatorWins++;
      } else if (score.producerScore! < score.aviatorScore!) {
        producerWins++;
      }
    }
    
    const diff = aviatorWins - producerWins;
    let text = "AS"; // All Square
    let color = "text-black";

    if (diff > 0) {
      text = `${diff} UP`;
      color = "text-aviator";
    } else if (diff < 0) {
      text = `${Math.abs(diff)} UP`;
      color = "text-producer";
    }
    
    return { text, color };
  };

  // Render the scorecard
  const allHoles = [...holes].sort((a, b) => a.number - b.number);
  const frontNine = [...holes].filter((h) => h.number <= 9).sort((a, b) => a.number - b.number);
  const backNine = [...holes].filter((h) => h.number > 9).sort((a, b) => a.number - b.number);

  const aviatorTeamTotal = teamScores
    .filter((s) => s.aviatorScore !== null)
    .reduce((acc, s) => acc + (s.aviatorScore || 0), 0);

  const producerTeamTotal = teamScores
    .filter((s) => s.producerScore !== null)
    .reduce((acc, s) => acc + (s.producerScore || 0), 0);

  // Memoize hole arrays to prevent re-renders if holes prop doesn't change
  const frontNineHoles = useMemo(() => holeArray.slice(0, 9), [holeArray]);
  const backNineHoles = useMemo(() => holeArray.slice(9, 18), [holeArray]);

  // Helper to get player score object for a hole
  const getPlayerScoreForHole = (playerId: number, holeNumber: number): BestBallPlayerScore | undefined => {
    const player = [...aviatorPlayersList, ...producerPlayersList].find(p => p.id === playerId);
    if (!player) return undefined;
    // The key in playerScores map might include player.name. Ensure consistency.
    // For simplicity, let's assume playerScores map is keyed correctly or adapt access.
    // This part needs to correctly retrieve from the playerScores map.
    // Assuming playerScores stores arrays of scores per player-hole key like `${holeNumber}-${player.name}`
    // and we need the first/only score object from that array.
    const scoresForPlayerHole = playerScores.get(`${holeNumber}-${player.name}`);
    return scoresForPlayerHole?.[0];
  };


  if (scoresLoading || individualScoresLoading || existingScoresLoading) {
    return null; // Or some loading indicator
  }

  return (
    <div style={styles.scorecardContainer}>
      <Card>
        <CardHeader className="pb-1">
          <CardTitle>Match Scorecard</CardTitle>
        </CardHeader>
        <CardContent>
          {scoresLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : (
            <Tabs defaultValue="all">
              <TabsList className="grid grid-cols-3 w-full mb-4">
                <TabsTrigger value="all">All Holes</TabsTrigger>
                <TabsTrigger value="front">Front 9</TabsTrigger>
                <TabsTrigger value="back">Back 9</TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="overflow-x-auto">
                <div className="scorecard-wrapper">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 px-2 text-left sticky-column bg-gray-100">Hole</th>
                        {allHoles.map((hole) => (
                          <th key={hole.number} className="py-2 px-2 text-center">
                            {hole.number}
                          </th>
                        ))}
                        <th className="py-2 px-2 text-center bg-gray-100">IN</th>
                        <th className="py-2 px-2 text-center bg-gray-200">TOT</th>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 px-2 text-left sticky-column bg-gray-100">Par</th>
                        {allHoles.map((hole) => (
                          <th key={hole.number} className="py-2 px-2 text-center">
                            {hole.par}
                          </th>
                        ))}
                        <th className="py-2 px-2 text-center bg-gray-100">
                          {allHoles
                            .filter((h) => h.number > 9)
                            .reduce((acc, hole) => acc + hole.par, 0)}
                        </th>
                        <th className="py-2 px-2 text-center bg-gray-200">
                          {allHoles.reduce((acc, hole) => acc + hole.par, 0)}
                        </th>
                      </tr>
                      <tr className="border-b border-gray-200">
                        <th className="py-2 px-2 text-left sticky-column bg-gray-100">HCP</th>
                        {allHoles.map((hole) => (
                          <th key={hole.number} className="py-2 px-2 text-center">
                            {hole.handicapRank}
                          </th>
                        ))}
                        <th className="py-2 px-2 text-center bg-gray-100"></th>
                        <th className="py-2 px-2 text-center bg-gray-200"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Aviator Players */}
                      {isBestBall && aviatorPlayersList.length > 0 && (
                        <>
                          {aviatorPlayersList.map((player) => (
                            <tr
                              key={player.id}
                              className="border-b border-gray-200 hover:bg-gray-50"
                            >
                              <td className="py-2 px-2 sticky-column bg-gray-50">
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
                              {/* Aviator Player Scores */}
                              {allHoles.map((hole) => {
                                const isLowest = isLowestScore(
                                  hole.number,
                                  player.name,
                                  "aviator",
                                );
                                // console.log(`[EnhancedMatchScorecard] Rendering Aviator Player Input for hole ${hole.number}, player ${player.name}: locked=${locked}, canEditScores=${canEditScores}, isBestBall=${isBestBall}, isHoleGreyedOut=${isHoleGreyedOut(hole.number)}`);
                                return (
                                  <td key={hole.number} className="py-2 px-2 text-center scorecard-cell">
                                    <div className="relative">
                                      {/* Handicap Strokes Indicators */}
                                      {(() => {
                                        const handicapStrokes = playerScores.get(`${hole.number}-${player.name}`)?.[0]?.handicapStrokes;
                                        return handicapStrokes && handicapStrokes > 0 ? (
                                          <div className="handicap-strokes">
                                            {Array.from({ length: handicapStrokes }).map((_, i) => (
                                              <div key={i} className="handicap-indicator"></div>
                                            ))}
                                          </div>
                                        ) : null;
                                      })()}
                                      <input
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        data-strokes={playerScores.get(`${hole.number}-${player.name}`)?.[0]?.handicapStrokes || 0}
                                        className={`score-input w-8 h-8 text-center border border-gray-300 rounded ${isHoleGreyedOut(hole.number) ? "bg-gray-200" : ""} ${!isLowest ? "non-counting-score" : ""} ${(playerScores.get(`${hole.number}-${player.name}`)?.[0]?.handicapStrokes ?? 0) > 0 ? "handicap-stroke" : ""}`}
                                        value={getPlayerScoreValue(
                                          hole.number,
                                          player.name,
                                          "aviator",
                                        )}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
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
                                        disabled={locked || !canEditScores}
                                      />
                                      {/* Net Score Display */}
                                        {playerScores.get(`${hole.number}-${player.name}`)?.[0]?.score !== null &&
                                         (playerScores.get(`${hole.number}-${player.name}`)?.[0]?.handicapStrokes ?? 0) > 0 && (
                                        <span className="net-score">
                                          ({playerScores.get(`${hole.number}-${player.name}`)?.[0]?.netScore})
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

                        {/* Aviator Team Scores */}
                        {allHoles.map((hole) => (
                          <td key={hole.number} className="py-2 px-2 text-center">
                            {isBestBall ? (
                              <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded ${
                                getScoreInputValue(hole.number, "aviator") ? "bg-aviator text-white" : "bg-white text-black"
                              }`}>
                                {getScoreInputValue(hole.number, "aviator")}
                              </div>
                            ) : (
                              <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="score-input w-8 h-8 text-center border border-gray-300 rounded"
                                value={getScoreInputValue(hole.number, "aviator")}
                                onChange={(e) => handleTeamScoreChange(hole.number, 'aviator', e.target.value)}
                                // Log for team score input
                                onFocus={() => console.log(`[EnhancedMatchScorecard] Rendering Aviator Team Input for hole ${hole.number}: locked=${locked}, canEditScores=${canEditScores}, isBestBall=${isBestBall}`)}
                                disabled={locked || !canEditScores}
                              />
                            )}
                          </td>
                        ))}
                        <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                          {teamScores
                            .filter(
                              (s) =>
                                s.holeNumber > 9 &&
                                s.holeNumber <= 18 &&
                                s.aviatorScore !== null,
                            )
                            .reduce((acc, s) => acc + (s.aviatorScore || 0), 0)}
                        </td>
                        <td className="py-2 px-2 text-center font-semibold bg-gray-200">
                          {aviatorTeamTotal}
                        </td>
                      </tr>

                      {/* Producer Players */}
                      {isBestBall && producerPlayersList.length > 0 && (
                        <>
                          {producerPlayersList.map((player) => (
                            <tr
                              key={player.id}
                              className="border-b border-gray-200 hover:bg-gray-50"
                            >
                              <td className="py-2 px-2 sticky-column bg-gray-50">
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
                              {/* Producer Player Scores */}
                              {allHoles.map((hole) => {
                                const isLowest = isLowestScore(
                                  hole.number,
                                  player.name,
                                  "producer",
                                );
                                // console.log(`[EnhancedMatchScorecard] Rendering Producer Player Input for hole ${hole.number}, player ${player.name}: locked=${locked}, canEditScores=${canEditScores}, isBestBall=${isBestBall}, isHoleGreyedOut=${isHoleGreyedOut(hole.number)}`);
                                return (
                                  <td key={hole.number} className="py-2 px-2 text-center scorecard-cell">
                                    <div className="relative">
                                      {/* Handicap Strokes Indicators */}
                                      {(() => {
                                        const handicapStrokes = playerScores.get(`${hole.number}-${player.name}`)?.[0]?.handicapStrokes;
                                        return handicapStrokes && handicapStrokes > 0 ? (
                                          <div className="handicap-strokes">
                                            {Array.from({ length: handicapStrokes }).map((_, i) => (
                                              <div key={i} className="handicap-indicator"></div>
                                            ))}
                                          </div>
                                        ) : null;
                                      })()}
                                      <input
                                        type="tel"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        data-strokes={playerScores.get(`${hole.number}-${player.name}`)?.[0]?.handicapStrokes || 0}
                                        className={`score-input w-8 h-8 text-center border border-gray-300 rounded ${isHoleGreyedOut(hole.number) ? "bg-gray-200" : ""} ${!isLowest ? "non-counting-score" : ""} ${(playerScores.get(`${hole.number}-${player.name}`)?.[0]?.handicapStrokes ?? 0) > 0 ? "handicap-stroke" : ""}`}
                                        value={getPlayerScoreValue(
                                          hole.number,
                                          player.name,
                                          "producer",
                                        )}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
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
                                        disabled={locked || !canEditScores}
                                      />
                                      {/* Net Score Display */}
                                        {playerScores.get(`${hole.number}-${player.name}`)?.[0]?.score !== null &&
                                         (playerScores.get(`${hole.number}-${player.name}`)?.[0]?.handicapStrokes ?? 0) > 0 && (
                                        <span className="net-score">
                                          ({playerScores.get(`${hole.number}-${player.name}`)?.[0]?.netScore})
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

                      {/* Team Producers Row */}
                      <tr className="border-b border-gray-200">
                        <td className="py-2 px-2 font-semibold sticky-column bg-producer text-white">
                          <div>The Producers</div>
                        </td>

                        {/* Producer Team Scores */}
                        {allHoles.map((hole) => (
                          <td key={hole.number} className="py-2 px-2 text-center">
                            {isBestBall ? (
                              <div className={`score-display w-16 h-8 inline-flex items-center justify-center border border-gray-300 rounded ${
                                getScoreInputValue(hole.number, "producer") ? "bg-producer text-white" : "bg-white text-black"
                              }`}>
                                {getScoreInputValue(hole.number, "producer")}
                              </div>
                            ) : (
                              <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                className="score-input w-8 h-8 text-center border border-gray-300 rounded"
                                value={getScoreInputValue(hole.number, "producer")}
                                onChange={(e) => handleTeamScoreChange(hole.number, 'producer', e.target.value)}
                                // Log for team score input
                                onFocus={() => console.log(`[EnhancedMatchScorecard] Rendering Producer Team Input for hole ${hole.number}: locked=${locked}, canEditScores=${canEditScores}, isBestBall=${isBestBall}`)}
                                disabled={locked || !canEditScores}
                              />
                            )}
                          </td>
                        ))}
                        <td className="py-2 px-2 text-center font-semibold bg-gray-100">
                          {teamScores
                            .filter(
                              (s) =>
                                s.holeNumber > 9 &&
                                s.holeNumber <= 18 &&
                                s.producerScore !== null,
                            )
                            .reduce((acc, s) => acc + (s.producerScore || 0), 0)}
                        </td>
                        <td className="py-2 px-2 text-center font-semibold bg-gray-200">
                          {producerTeamTotal}
                        </td>
                      </tr>

                      {/* Match Status Row */}
                      <tr className="border-b border-gray-200">
                        <td className="py-2 px-2 font-semibold sticky-column bg-gray-100">
                          Match Status
                        </td>
                        {allHoles.map((hole) => {
                          const status = generateMatchStatus(hole.number);
                          return (
                            <td key={hole.number} className="py-2 px-2 text-center">
                              <span className={`font-bold ${status.color}`}>
                                {status.text}
                              </span>
                            </td>
                          );
                        })}
                        <td className="py-2 px-2 text-center bg-gray-100"></td>
                        <td className="py-2 px-2 text-center bg-gray-200"></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </TabsContent>

              {/* Front Nine Tab Content */}
              <TabsContent value="front" className="overflow-x-auto">
                <div className="scorecard-wrapper">
                  <div className="text-center py-8 text-gray-500">
                    Front 9 view coming soon. Use "All Holes" tab for now.
                  </div>
                </div>
              </TabsContent>

              {/* Back Nine Tab Content */}
              <TabsContent value="back" className="overflow-x-auto">
                <div className="scorecard-wrapper">
                  <div className="text-center py-8 text-gray-500">
                    Back 9 view coming soon. Use "All Holes" tab for now.
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Handicap Edit Dialog */}
      <Dialog open={handicapDialogOpen} onOpenChange={setHandicapDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Player Course Handicap</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="handicap">Course Handicap</Label>
              <Input
                id="handicap"
                type="number"
                min="0"
                max="36"
                value={handicapValue}
                onChange={(e) => setHandicapValue(parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={saveHandicap}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EnhancedMatchScorecard;