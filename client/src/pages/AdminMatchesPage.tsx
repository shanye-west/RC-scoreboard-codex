import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, ChevronLeft, Plus, PenSquare, Lock, Unlock } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getQueryFn, apiRequest, queryClient } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Round = {
  id: number;
  name: string;
  matchType: string;
  courseName: string;
  date: string;
  startTime: string;
  isComplete?: boolean;
};

type Match = {
  id: number;
  roundId: number;
  name: string;
  status: string;
  aviatorPlayers: string;
  producerPlayers: string;
  currentHole: number;
  leadingTeam: string | null;
  leadAmount: number;
  result: string | null;
  locked: boolean;
};

type Player = {
  id: number;
  name: string;
  teamId: number;
  wins: number;
  losses: number;
  ties: number;
};

type Team = {
  id: number;
  name: string;
  shortName: string;
  colorCode: string;
};

type SelectedPlayer = {
  id: number;
  name: string;
  teamId: number;
};

export default function AdminMatchesPage() {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [roundId, setRoundId] = useState<number | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedAviatorPlayers, setSelectedAviatorPlayers] = useState<SelectedPlayer[]>([]);
  const [selectedProducerPlayers, setSelectedProducerPlayers] = useState<SelectedPlayer[]>([]);
  const [matchFormData, setMatchFormData] = useState({
    name: "",
    aviatorPlayers: "",
    producerPlayers: "",
  });

  // Extract roundId from URL path
  useEffect(() => {
    const path = window.location.pathname;
    const matches = path.match(/\/admin\/rounds\/(\d+)\/matches/);
    if (matches && matches[1]) {
      setRoundId(parseInt(matches[1]));
    }
  }, []);

  const { data: round, isLoading: isRoundLoading } = useQuery<Round>({
    queryKey: [`/api/rounds/${roundId}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!roundId,
  });

  const { data: matches, isLoading: isMatchesLoading } = useQuery<Match[]>({
    queryKey: [`/api/matches?roundId=${roundId}`],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!roundId,
  });

  const { data: players, isLoading: isPlayersLoading } = useQuery<Player[]>({
    queryKey: ['/api/players'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const { data: teams, isLoading: isTeamsLoading } = useQuery<Team[]>({
    queryKey: ['/api/teams'],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  const addMatchMutation = useMutation({
    mutationFn: async (matchData: any) => {
      try {
        const res = await apiRequest("POST", "/api/matches", {
          ...matchData,
          roundId,
          status: "upcoming",
        });
        return await res.json();
      } catch (error: any) {
        if (error.message.includes("Player is already participating in a match in this round")) {
          throw new Error("One or more selected players are already participating in another match in this round. Each player can only play in one match per round.");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/matches?roundId=${roundId}`] });
      toast({
        title: "Match added",
        description: "New match has been added successfully",
      });
      setIsAddDialogOpen(false);
      resetMatchForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add match",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add toggle lock mutation
  const toggleLockMutation = useMutation({
    mutationFn: async ({ matchId, locked }: { matchId: number, locked: boolean }) => {
      return apiRequest("PUT", `/api/matches/${matchId}`, {
        locked
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: [`/api/matches?roundId=${roundId}`] });
      toast({
        title: variables.locked ? "Match locked" : "Match unlocked",
        description: variables.locked 
          ? "The match has been locked to prevent further edits." 
          : "The match has been unlocked for editing.",
        duration: 3000,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update match lock status",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    },
  });

  const resetMatchForm = () => {
    setMatchFormData({
      name: "",
      aviatorPlayers: "",
      producerPlayers: "",
    });
    setSelectedAviatorPlayers([]);
    setSelectedProducerPlayers([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setMatchFormData({
      ...matchFormData,
      [name]: value,
    });
  };

  // Check if a player is already in any match in this round
  const isPlayerInAnyMatch = (playerId: number): boolean => {
    if (!matches || !players) return false;
    
    // Find the player
    const player = players.find(p => p.id === playerId);
    if (!player) return false;
    
    // Check all active matches in this round
    return matches.some(match => {
      // Skip deleted matches
      if (match.deleted) return false;
      
      // Split players into arrays
      const aviatorPlayers = match.aviatorPlayers.split(',').map(p => p.trim());
      const producerPlayers = match.producerPlayers.split(',').map(p => p.trim());
      
      // Check if player's name is in either team
      return aviatorPlayers.includes(player.name) || producerPlayers.includes(player.name);
    });
  };

  // Handle selecting an Aviator player
  const handleAddAviatorPlayer = (playerId: number) => {
    if (players && roundId) {
      const player = players.find(p => p.id === Number(playerId));

      if (player) {
        // Add player to selected list if not already there
        if (!selectedAviatorPlayers.some(p => p.id === player.id)) {
          setSelectedAviatorPlayers([...selectedAviatorPlayers, player]);

          // Update form data
          const playerNames = [...selectedAviatorPlayers, player].map(p => p.name).join(", ");
          setMatchFormData({
            ...matchFormData,
            aviatorPlayers: playerNames,
          });
        }
      }
    }
  };

  // Handle selecting a Producer player
  const handleAddProducerPlayer = (playerId: number) => {
    if (players && roundId) {
      const player = players.find(p => p.id === Number(playerId));

      if (player) {
        // Add player to selected list if not already there
        if (!selectedProducerPlayers.some(p => p.id === player.id)) {
          setSelectedProducerPlayers([...selectedProducerPlayers, player]);

          // Update form data
          const playerNames = [...selectedProducerPlayers, player].map(p => p.name).join(", ");
          setMatchFormData({
            ...matchFormData,
            producerPlayers: playerNames,
          });
        }
      }
    }
  };

  // Handle removing selected players
  const removeAviatorPlayer = (playerId: number) => {
    const updatedPlayers = selectedAviatorPlayers.filter(p => p.id !== playerId);
    setSelectedAviatorPlayers(updatedPlayers);

    // Update form data
    const playerNames = updatedPlayers.map(p => p.name).join(", ");
    setMatchFormData({
      ...matchFormData,
      aviatorPlayers: playerNames,
    });
  };

  const removeProducerPlayer = (playerId: number) => {
    const updatedPlayers = selectedProducerPlayers.filter(p => p.id !== playerId);
    setSelectedProducerPlayers(updatedPlayers);

    // Update form data
    const playerNames = updatedPlayers.map(p => p.name).join(", ");
    setMatchFormData({
      ...matchFormData,
      producerPlayers: playerNames,
    });
  };

  const handleAddMatch = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate that we have selected players
    if (!matchFormData.aviatorPlayers || !matchFormData.producerPlayers) {
      toast({
        title: "Missing players",
        description: "Please select players for both teams",
        variant: "destructive",
      });
      return;
    }

    addMatchMutation.mutate(matchFormData);
  };

  const handleEditMatch = (matchId: number) => {
    window.location.href = `/admin/matches/${matchId}/edit`;
  };

  const handleViewScorecard = (matchId: number) => {
    window.location.href = `/matches/${matchId}?admin=true`;
  };

  // Handle lock toggle
  const handleToggleLock = (e: React.MouseEvent, matchId: number, currentLockState: boolean) => {
    e.stopPropagation();
    toggleLockMutation.mutate({ 
      matchId, 
      locked: !currentLockState 
    });
  };

  if (!isAdmin) {
    return <div>Access denied. You must be an admin to view this page.</div>;
  }

  if (isRoundLoading || isMatchesLoading || isPlayersLoading || isTeamsLoading || !roundId) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 px-4 max-w-5xl">
      <div className="flex flex-col space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="flex items-center"
              onClick={() => window.location.href = "/rounds"}
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Back to Rounds
            </Button>
            <h1 className="text-2xl font-bold">Manage Matches</h1>
          </div>
          <Button 
            onClick={() => setIsAddDialogOpen(true)}
            className="flex items-center"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Match
          </Button>
        </div>

        <Card className="bg-muted/20">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row justify-between">
              <div>
                <h2 className="text-xl font-semibold">{round?.name}</h2>
                <p className="text-muted-foreground">{round?.matchType} - {round?.date}</p>
                <p className="text-muted-foreground">{round?.courseName} - {round?.startTime}</p>
              </div>
              <div className="mt-2 md:mt-0">
                <span className="text-sm font-medium">Status: </span>
                <span className={`text-sm ${round?.isComplete ? "text-green-600" : "text-amber-600"}`}>
                  {round?.isComplete ? "Completed" : "In Progress"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <h2 className="text-xl font-semibold mt-4">Match List</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {matches && matches.filter(m => m.status !== 'deleted').length > 0 ? (
            matches
              .filter(m => m.status !== 'deleted')
              .map((match) => (
                <Card key={match.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{match.name}</CardTitle>
                    <CardDescription>
                      Status: {match.status === 'completed' ? 
                        <span className="text-green-600">Completed</span> : 
                        match.status === 'in_progress' ? 
                        <span className="text-amber-600">In Progress</span> : 
                        <span className="text-blue-600">Upcoming</span>
                      }
                      {match.locked && (
                        <span className="ml-2 text-gray-500 inline-flex items-center">
                          <Lock className="h-3 w-3 mr-1" /> Locked
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium text-blue-600">The Aviators</p>
                        <p className="text-sm text-muted-foreground">{match.aviatorPlayers}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-red-600">The Producers</p>
                        <p className="text-sm text-muted-foreground">{match.producerPlayers}</p>
                      </div>
                    </div>
                    {match.status !== 'upcoming' && (
                      <div className="flex justify-between mt-2">
                        <div>
                          <span className="text-sm">
                            {match.leadingTeam ? 
                              `${match.leadingTeam === 'aviator' ? 'Aviators' : 'Producers'} lead by ${match.leadAmount}` : 
                              'Match is tied'
                            }
                          </span>
                        </div>
                        <div>
                          <span className="text-sm">
                            {match.status === 'completed' ? 
                              (match.result ? `Result: ${match.result}` : 'Completed') : 
                              `Hole: ${match.currentHole}/18`
                            }
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="pt-2 flex flex-col space-y-2">
                    <Button 
                      variant="outline" 
                      className="w-full flex items-center"
                      onClick={() => handleEditMatch(match.id)}
                    >
                      <PenSquare className="h-4 w-4 mr-2" />
                      Edit Match
                    </Button>

                    <Button 
                      variant="default" 
                      className="w-full flex items-center"
                      onClick={() => handleViewScorecard(match.id)}
                    >
                      <PenSquare className="h-4 w-4 mr-2" />
                      View Scorecard
                    </Button>

                    {/* Add Lock/Unlock Button */}
                    <Button 
                      variant="outline" 
                      className="w-full flex items-center"
                      onClick={(e) => handleToggleLock(e, match.id, !!match.locked)}
                    >
                      {match.locked ? (
                        <>
                          <Unlock className="h-4 w-4 mr-2" />
                          Unlock Match
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4 mr-2" />
                          Lock Match
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              ))
          ) : (
            <Card className="col-span-full">
              <CardContent className="flex flex-col items-center justify-center p-8">
                <p className="text-muted-foreground mb-4">No matches found for this round.</p>
                <Button onClick={() => setIsAddDialogOpen(true)}>
                  Add First Match
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Add Match Dialog */}
      {isAddDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Add New Match</h2>
            <form onSubmit={handleAddMatch}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Match Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={matchFormData.name}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border rounded-md"
                    placeholder="e.g., Match 1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Aviator Players
                  </label>
                  <div className="space-y-3">
                    <Select onValueChange={(value) => handleAddAviatorPlayer(Number(value))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select an Aviator player" />
                      </SelectTrigger>
                      <SelectContent>
                        {players?.filter(p => 
                          // Only show Aviator players
                          p.teamId === 1 && 
                          // Not already selected in this form
                          !selectedAviatorPlayers.some(sp => sp.id === p.id) &&
                          !selectedProducerPlayers.some(sp => sp.id === p.id) &&
                          // Not already in another match in this round
                          !isPlayerInAnyMatch(p.id)
                        ).map(player => (
                          <SelectItem key={player.id} value={player.id.toString()}>
                            {player.name} ({player.wins}-{player.losses}-{player.ties})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Selected Aviator Players */}
                    {selectedAviatorPlayers.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-1">Selected Aviator Players:</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedAviatorPlayers.map(player => (
                            <div key={player.id} className="flex items-center gap-1 bg-blue-100 p-1 rounded">
                              <span className="text-sm">{player.name}</span>
                              <button 
                                type="button"
                                onClick={() => removeAviatorPlayer(player.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <input
                      type="hidden"
                      name="aviatorPlayers"
                      value={matchFormData.aviatorPlayers}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Producer Players
                  </label>
                  <div className="space-y-3">
                    <Select onValueChange={(value) => handleAddProducerPlayer(Number(value))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a Producer player" />
                      </SelectTrigger>
                      <SelectContent>
                        {players?.filter(p => 
                          // Only show Producer players
                          p.teamId === 2 && 
                          // Not already selected in this form
                          !selectedProducerPlayers.some(sp => sp.id === p.id) &&
                          !selectedAviatorPlayers.some(sp => sp.id === p.id) &&
                          // Not already in another match in this round
                          !isPlayerInAnyMatch(p.id)
                        ).map(player => (
                          <SelectItem key={player.id} value={player.id.toString()}>
                            {player.name} ({player.wins}-{player.losses}-{player.ties})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Selected Producer Players */}
                    {selectedProducerPlayers.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium mb-1">Selected Producer Players:</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedProducerPlayers.map(player => (
                            <div key={player.id} className="flex items-center gap-1 bg-red-100 p-1 rounded">
                              <span className="text-sm">{player.name}</span>
                              <button 
                                type="button"
                                onClick={() => removeProducerPlayer(player.id)}
                                className="text-red-500 hover:text-red-700"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <input
                      type="hidden"
                      name="producerPlayers"
                      value={matchFormData.producerPlayers}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-6 space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  disabled={addMatchMutation.isPending}
                >
                  {addMatchMutation.isPending ? (
                    <span className="flex items-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </span>
                  ) : (
                    "Add Match"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}