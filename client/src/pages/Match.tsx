import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import MatchHeader from "@/components/MatchHeader";
import EnhancedMatchScorecard from "@/components/EnhancedMatchScorecard";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ChevronLeft, Edit, Save, Lock, Unlock } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";

interface MatchProps {
  id: number;
}

interface MatchData {
  id: number;
  roundId: number;
  name: string;
  status: string;
  currentHole: number;
  leadingTeam: string | null;
  leadAmount: number;
  result: string | null;
  locked?: boolean;
}

interface RoundData {
  id: number;
  name: string;
  matchType: string;
  courseName: string;
  startTime: string;
  aviatorScore: number;
  producerScore: number;
  date: string;
  isComplete: boolean;
  courseId?: number;
}

interface HoleData {
  id: number;
  number: number;
  par: number;
}

interface ScoreData {
  id: number;
  matchId: number;
  holeNumber: number;
  aviatorScore: number | null;
  producerScore: number | null;
  winningTeam: string | null;
  matchStatus: string | null;
}

const Match = ({ id }: { id: number }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [matchSummary, setMatchSummary] = useState({
    aviatorTotal: 0,
    producerTotal: 0,
    result: "",
    leadingTeam: "",
    matchPlayResult: "",
  });
  const [editMatchData, setEditMatchData] = useState({
    name: "",
  });
  const [selectedAviatorPlayers, setSelectedAviatorPlayers] = useState<any[]>([]);
  const [selectedProducerPlayers, setSelectedProducerPlayers] = useState<any[]>([]);

  // Check if admin mode is enabled via URL parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setIsAdminMode(urlParams.get("admin") === "true");
  }, []);

  // Fetch match data
  const { data: match, isLoading: isMatchLoading } = useQuery<MatchData>({
    queryKey: [`/api/matches/${id}`],
  });

  // Fetch scores for this match
  const { data: scores, isLoading: isScoresLoading } = useQuery<ScoreData[]>({
    queryKey: [`/api/scores?matchId=${id}`],
  });

  // Fetch round data
  const { data: round, isLoading: isRoundLoading } = useQuery<RoundData>({
    queryKey: [`/api/rounds/${match?.roundId}`],
    enabled: !!match?.roundId,
  });

  // Fetch holes data for the specific course of this round
  const { data: holes, isLoading: isHolesLoading } = useQuery<HoleData[]>({
    queryKey: [`/api/holes`, round?.courseId],
    queryFn: async () => {
      if (!round?.courseId) return [];
      const response = await fetch(`/api/holes?courseId=${round.courseId}`);
      if (!response.ok) throw new Error('Failed to fetch holes');
      return response.json();
    },
    enabled: !!round?.courseId,
  });

  // Fetch players data for match editing
  const { data: players = [], isLoading: isPlayersLoading } = useQuery({
    queryKey: ["/api/players"],
  });

  // Fetch match participants to populate selected players
  const { data: participants = [], isLoading: isParticipantsLoading } = useQuery({
    queryKey: [`/api/match-players?matchId=${id}`],
    enabled: !!id,
  });

  const { isAdmin } = useAuth();

  // Update lock status when match data changes
  useEffect(() => {
    if (match) {
      setIsLocked(!!match.locked);
    }
  }, [match]);

  // Function to update score
  const updateScoreMutation = useMutation({
    mutationFn: async (scoreData: any) => {
      const existingScore = scores?.find(
        (s) => s.holeNumber === scoreData.holeNumber,
      );

      if (existingScore) {
        // Update existing score
        return apiRequest("PUT", `/api/scores/${existingScore.id}`, scoreData);
      } else {
        // Create new score
        return apiRequest("POST", "/api/scores", scoreData);
      }
    },
    onSuccess: () => {
      // Invalidate the scores query to refetch the data
      queryClient.invalidateQueries({ queryKey: [`/api/scores?matchId=${id}`] });
    },
    onError: (error) => {
      toast({
        title: "Error updating score",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Function to update match
  const updateMatchMutation = useMutation({
    mutationFn: async (matchData: any) => {
      return apiRequest("PUT", `/api/matches/${matchData.id}`, matchData);
    },
    onSuccess: () => {
      toast({
        title: "Match completed",
        description: "The match has been marked as completed.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error completing match",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Toggle lock mutation
  const toggleLockMutation = useMutation({
    mutationFn: async (locked: boolean) => {
      if (!match) return;
      return apiRequest("PUT", `/api/matches/${match.id}`, {
        locked: locked,
      });
    },
    onSuccess: () => {
      setIsLocked(!isLocked);
      queryClient.invalidateQueries({ queryKey: [`/api/matches/${id}`] });
      toast({
        title: isLocked ? "Match unlocked" : "Match locked",
        description: isLocked 
          ? "The match has been unlocked for editing." 
          : "The match has been locked to prevent further edits.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating match lock status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const isLoading =
    isMatchLoading || isScoresLoading || isHolesLoading || isRoundLoading || isPlayersLoading || isParticipantsLoading;

  // Calculate proper match play result (e.g., "3&2", "4&3", "1 UP")
  const calculateMatchPlayResult = (completedScores: ScoreData[]): string => {
    if (!completedScores.length) return "";

    let aviatorPoints = 0;
    let producerPoints = 0;
    let ties = 0;

    // Sort scores by hole number
    const sortedScores = [...completedScores].sort(
      (a, b) => a.holeNumber - b.holeNumber,
    );

    // Calculate wins and ties for each hole
    sortedScores.forEach((score) => {
      if (score.aviatorScore === null || score.producerScore === null) return;

      if (score.aviatorScore < score.producerScore) {
        aviatorPoints += 1;
      } else if (score.producerScore < score.aviatorScore) {
        producerPoints += 1;
      } else {
        aviatorPoints += 0.5;
        producerPoints += 0.5;
        ties++;
      }
    });

    // Calculate lead and holes remaining
    const lead = Math.abs(aviatorPoints - producerPoints);
    const highestHolePlayed = Math.max(
      ...sortedScores.map((s) => s.holeNumber),
    );
    const holesRemaining = 18 - highestHolePlayed;
    const totalCompleted = sortedScores.length;

    // Match play result format
    if (lead === 0 && totalCompleted === 18) {
      // Tied match after all holes
      return "AS";
    } else if (lead > holesRemaining) {
      // Match clinched before 18 holes
      const leadingTeam = aviatorPoints > producerPoints ? "aviators" : "producers";
      return `${lead} UP`;
    } else if (lead > 0 && totalCompleted === 18) {
      // Match completed with a winner after 18 holes
      return `${lead} UP`;
    }

    return "";
  };

  // Check if match is completed or should be completed
  useEffect(() => {
    if (!scores || !match || match.status === "completed") return;

    // Calculate completedHoles and check for match completion conditions
    const completedScores = scores.filter(
      (score) => score.aviatorScore !== null && score.producerScore !== null,
    );

    // If all 18 holes are filled or match is clinched
    if (
      completedScores.length === 18 ||
      match.leadAmount >
        18 - Math.max(...completedScores.map((s) => s.holeNumber), 0)
    ) {
      // Calculate totals for the summary
      let aviatorTotal = 0;
      let producerTotal = 0;
      completedScores.forEach((score) => {
        if (score.aviatorScore) aviatorTotal += score.aviatorScore;
        if (score.producerScore) producerTotal += score.producerScore;
      });

      // Calculate the match play result
      const matchPlayResult = calculateMatchPlayResult(completedScores);

      // Set match summary data
      setMatchSummary({
        aviatorTotal,
        producerTotal,
        result: matchPlayResult,
        leadingTeam: match.leadingTeam || "tied",
        matchPlayResult,
      });

      // Mark match as completed and update result in database
      updateMatchMutation.mutate({
        id: match.id,
        status: "completed",
        result: matchPlayResult,
        leadingTeam: match.leadingTeam,
        leadAmount: match.leadAmount,
      });

      // Show completion dialog
      setShowCompletionDialog(true);
    }
  }, [scores, match]);

  // Handle score update
  const handleScoreUpdate = (
    holeNumber: number,
    aviatorScore: number | null,
    producerScore: number | null,
  ) => {
    // Check if the match is locked
    if (isLocked) {
      toast({
        title: "Match locked",
        description: "Cannot update scores for a locked match",
        variant: "destructive",
      });
      return;
    }

    // Allow updates even if one of the scores is null
    const scoreData = {
      matchId: id,
      holeNumber,
      aviatorScore,
      producerScore,
    };

    updateScoreMutation.mutate(scoreData);
  };

  // Update match status from "upcoming" to "in_progress" when first score is entered
  useEffect(() => {
    if (!match || !scores || match.status !== "upcoming") return;

    // Check if any scores exist
    const hasScores = scores.some(
      (score) => score.aviatorScore !== null || score.producerScore !== null,
    );

    // If scores exist, update match status to in_progress
    if (hasScores) {
      updateMatchMutation.mutate({
        id: match.id,
        status: "in_progress",
      });
    }
  }, [scores, match]);

  // Handle editing match - Load participants into selected players
  useEffect(() => {
    if (match) {
      setEditMatchData({
        name: match.name,
      });
    }

    if (participants && participants.length > 0 && players && players.length > 0) {
      const aviators = participants
        .filter((p: any) => p.team === "aviators")
        .map((p: any) => players.find((player: any) => player.id === p.playerId))
        .filter(Boolean);

      const producers = participants
        .filter((p: any) => p.team === "producers")
        .map((p: any) => players.find((player: any) => player.id === p.playerId))
        .filter(Boolean);

      setSelectedAviatorPlayers(aviators);
      setSelectedProducerPlayers(producers);
    }
  }, [match, participants, players]);

  // Handle lock toggle
  const handleToggleLock = () => {
    toggleLockMutation.mutate(!isLocked);
  };

  const handleOpenEditDialog = () => {
    setShowEditDialog(true);
  };

  // Create a mutation for adding match participants
  const addParticipantMutation = useMutation({
    mutationFn: async (participantData: any) => {
      return apiRequest("POST", "/api/match-players", participantData);
    },
  });

  // Create a mutation for deleting match participants
  const deleteParticipantMutation = useMutation({
    mutationFn: async (participantId: number) => {
      return apiRequest("DELETE", `/api/match-players/${participantId}`);
    },
  });

  const handleEditMatchSubmit = async () => {
    if (!match) return;

    try {
      // First update match name
      await updateMatchMutation.mutateAsync({
        id: match.id,
        name: editMatchData.name,
      });

      // Find which players are new vs. existing
      const existingAviatorPlayerIds = participants
        .filter((p: any) => p.team === "aviators")
        .map((p: any) => p.playerId);

      const existingProducerPlayerIds = participants
        .filter((p: any) => p.team === "producers")
        .map((p: any) => p.playerId);

      // Players to add
      const newAviatorPlayers = selectedAviatorPlayers
        .filter((p: any) => !existingAviatorPlayerIds.includes(p.id));

      const newProducerPlayers = selectedProducerPlayers
        .filter((p: any) => !existingProducerPlayerIds.includes(p.id));

      // Players to remove
      const aviatorPlayersToRemove = participants
        .filter((p: any) => 
          p.team === "aviators" && 
          !selectedAviatorPlayers.some((s: any) => s.id === p.playerId)
        );

      const producerPlayersToRemove = participants
        .filter((p: any) => 
          p.team === "producers" && 
          !selectedProducerPlayers.some((s: any) => s.id === p.playerId)
        );

      // Remove players that are no longer selected
      for (const player of [...aviatorPlayersToRemove, ...producerPlayersToRemove]) {
        await deleteParticipantMutation.mutateAsync(player.id);
      }

      // Add new aviator players
      for (const player of newAviatorPlayers) {
        await addParticipantMutation.mutateAsync({
          matchId: match.id,
          playerId: player.id,
          team: "aviators"
        });
      }

      // Add new producer players
      for (const player of newProducerPlayers) {
        await addParticipantMutation.mutateAsync({
          matchId: match.id,
          playerId: player.id,
          team: "producers"
        });
      }

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: [`/api/matches/${match.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/match-players?matchId=${match.id}`] });

      setShowEditDialog(false);
      toast({
        title: "Match updated",
        description: "The match details have been updated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Failed to update match",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleBackToAdminMatches = () => {
    if (match && match.roundId) {
      window.location.href = `/rounds/${match.roundId}`;
    } else {
      window.location.href = "/";
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      {isLoading || !match ? (
        <>
          <div className="mb-6">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-36 w-full" />
          </div>
          <Skeleton className="h-64 w-full mb-6" />
          <Skeleton className="h-48 w-full" />
        </>
      ) : (
        <>
          {/* Updated header section - now visible for all users, but with admin features conditional */}
            <div className="mb-4 flex items-center justify-end">

            <div className="flex items-center space-x-2">
              {isAdminMode && (
                <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded text-xs font-medium">
                  Admin View
                </div>
              )}

              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleLock}
                  className="ml-2"
                >
                  {isLocked ? (
                    <>
                      <Unlock className="mr-2 h-4 w-4" />
                      Unlock Match
                    </>
                  ) : (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Lock Match
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {/* Match Header */}
          <MatchHeader
            id={match.id}
            name={match.name}
            roundId={match.roundId}
            roundName={round?.name}
            matchType={round?.matchType}
            leadingTeam={match.leadingTeam}
            leadAmount={match.leadAmount}
            currentHole={match.currentHole}
            status={match.status}
            result={match.result}
          />

          {/* Enhanced Match Scorecard */}
          <EnhancedMatchScorecard
            matchId={id}
            holes={holes || []}
            scores={scores || []}
            onScoreUpdate={handleScoreUpdate}
            matchStatus={match.status}
            matchType={round?.matchType || ""}
            locked={isLocked}
            participants={participants}
          />
        </>
      )}

      {/* Match Completion Dialog */}
      <AlertDialog
        open={showCompletionDialog}
        onOpenChange={setShowCompletionDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Match Complete</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-4">
                <p className="text-lg font-semibold">Final Score:</p>
                <div className="flex justify-between items-center">
                  <div className="bg-aviator text-white px-4 py-2 rounded">
                    <p className="font-bold">The Aviators</p>
                    <p className="text-2xl text-center">
                      {matchSummary.aviatorTotal}
                    </p>
                  </div>
                  <div className="text-xl font-bold">vs</div>
                  <div className="bg-producer text-white px-4 py-2 rounded">
                    <p className="font-bold">The Producers</p>
                    <p className="text-2xl text-center">
                      {matchSummary.producerTotal}
                    </p>
                  </div>
                </div>

                <div className="mt-4 text-center">
                  <p className="text-lg font-semibold">Match Play Result:</p>
                  <p className="text-xl mt-2">
                    {matchSummary.leadingTeam === "aviators"
                      ? "The Aviators"
                      : matchSummary.leadingTeam === "producers"
                        ? "The Producers"
                        : "Match"}{" "}
                    {matchSummary.matchPlayResult !== "AS" ? "won" : "tied"}{" "}
                    <span className="font-bold">
                      {matchSummary.matchPlayResult !== "AS" && match ? 
                        `${matchSummary.matchPlayResult.split(" ")[0]}&${18 - (match.currentHole || 1)}` : 
                        matchSummary.matchPlayResult}
                    </span>
                  </p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Close</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Match Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Match</DialogTitle>
            <DialogDescription>
              Update the match details below.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="match-name">Match Name</Label>
              <Input
                id="match-name"
                value={editMatchData.name}
                onChange={(e) =>
                  setEditMatchData({ ...editMatchData, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Aviator Players</Label>
              <div className="grid grid-cols-1 gap-2">
                {players
                  ?.filter((p: any) => p.teamId === 1) // Assuming teamId 1 is for Aviators
                  .map((player: any) => (
                    <div key={player.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`aviator-${player.id}`}
                        checked={selectedAviatorPlayers.some(p => p.id === player.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAviatorPlayers([...selectedAviatorPlayers, player]);
                          } else {
                            setSelectedAviatorPlayers(
                              selectedAviatorPlayers.filter((p) => p.id !== player.id)
                            );
                          }
                        }}
                      />
                      <Label htmlFor={`aviator-${player.id}`} className="cursor-pointer">
                        {player.name}
                      </Label>
                    </div>
                  ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Producer Players</Label>
              <div className="grid grid-cols-1 gap-2">
                {players
                  ?.filter((p: any) => p.teamId === 2) // Assuming teamId 2 is for Producers
                  .map((player: any) => (
                    <div key={player.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`producer-${player.id}`}
                        checked={selectedProducerPlayers.some(p => p.id === player.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedProducerPlayers([...selectedProducerPlayers, player]);
                          } else {
                            setSelectedProducerPlayers(
                              selectedProducerPlayers.filter((p) => p.id !== player.id)
                            );
                          }
                        }}
                      />
                      <Label htmlFor={`producer-${player.id}`} className="cursor-pointer">
                        {player.name}
                      </Label>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditMatchSubmit}>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Match;