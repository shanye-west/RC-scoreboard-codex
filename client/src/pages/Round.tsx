import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import RoundHeader from "@/components/RoundHeader";
import MatchesList from "@/components/MatchesList";
import { Badge } from "@/components/ui/badge";

interface RoundProps {
  id: number;
}

interface RoundData {
  id: number;
  name: string;
  matchType: string;
  courseName: string;
  startTime: string;
  aviatorScore: number;
  producerScore: number;
  pendingAviatorScore?: number;
  pendingProducerScore?: number;
  date: string;
  isComplete: boolean;
}

interface Player {
  id: number;
  name: string;
  teamId: number;
}

interface Match {
  id: number;
  name: string;
  status: string;
  aviatorPlayers: string;
  producerPlayers: string;
  leadingTeam: string | null;
  leadAmount: number;
  result: string | null;
  currentHole: number;
  roundId: number;
}

interface MatchFormData {
  name: string;
  aviatorPlayerIds: number[];
  producerPlayerIds: number[];
}

const Round = ({ id }: RoundProps) => {
  const { isAdmin } = useAuth();
  const { toast } = useToast();
  const [isCreateMatchDialogOpen, setIsCreateMatchDialogOpen] = useState(false);
  const [matchFormData, setMatchFormData] = useState<MatchFormData>({
    name: "",
    aviatorPlayerIds: [],
    producerPlayerIds: [],
  });
  
  // Keep track of how many players we need for each team based on match type
  const [playersPerTeam, setPlayersPerTeam] = useState(1);
  
  // Fetch players for match creation
  const { data: players = [], isLoading: isPlayersLoading } = useQuery<Player[]>({
    queryKey: ['/api/players'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/players');
      if (!response) throw new Error('No response received');
      return response.json();
    },
    enabled: isAdmin && isCreateMatchDialogOpen,
  });
  
  // Fetch round data
  const { data: round, isLoading: isRoundLoading } = useQuery<RoundData>({
    queryKey: [`/api/rounds/${id}`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/rounds/${id}`);
      if (!response) throw new Error('No response received');
      return response.json();
    },
  });

  // Fetch match participants for this round
  const { data: roundParticipants = [], isLoading: isParticipantsLoading } = useQuery<any[]>({
    queryKey: [`/api/match-players?roundId=${id}`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/match-players?roundId=${id}`);
      if (!response) throw new Error('No response received');
      return response.json();
    },
    enabled: isAdmin && isCreateMatchDialogOpen,
  });

  // Fetch matches for this round
  const { data: matches = [], isLoading: isMatchesLoading } = useQuery<Match[]>({
    queryKey: [`/api/matches?roundId=${id}`],
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/matches?roundId=${id}`);
      if (!response) throw new Error('No response received');
      return response.json();
    },
  });
  
  // Create match mutation
  const createMatchMutation = useMutation({
    mutationFn: async (formData: MatchFormData) => {
      // First create the match
      const matchPayload = {
        name: formData.name,
        roundId: id,
        status: "not_started",
        currentHole: 1,
      };
      
      const matchRes = await apiRequest("POST", `/api/matches`, matchPayload);
      if (!matchRes) throw new Error('No response received');
      const newMatch = await matchRes.json();
      
      // Then add all the aviator players
      const aviatorPromises = formData.aviatorPlayerIds.map(playerId => {
        const playerPayload = {
          matchId: newMatch.id,
          playerId,
          team: "aviators",
        };
        return apiRequest("POST", `/api/match-players`, playerPayload);
      });
      
      // Add all the producer players
      const producerPromises = formData.producerPlayerIds.map(playerId => {
        const playerPayload = {
          matchId: newMatch.id,
          playerId,
          team: "producers",
        };
        return apiRequest("POST", `/api/match-players`, playerPayload);
      });
      
      // Wait for all players to be added
      await Promise.all([...aviatorPromises, ...producerPromises]);
      
      return newMatch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/matches?roundId=${id}`] });
      toast({
        title: "Match created",
        description: "New match has been added successfully",
        duration: 3000,
      });
      setIsCreateMatchDialogOpen(false);
      resetMatchForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create match",
        description: error.message,
        variant: "destructive",
        duration: 3000,
      });
    },
  });
  
  // Set the required players per team based on the match type
  useEffect(() => {
    if (round) {
      if (round.matchType === "4-man Team Scramble") {
        setPlayersPerTeam(4);
      } else if (
        round.matchType === "2-man Team Scramble" || 
        round.matchType === "2-man Team Shamble" || 
        round.matchType === "2-man Team Best Ball" ||
        round.matchType === "Alternate Shot"
      ) {
        setPlayersPerTeam(2);
      } else {
        // Singles Match
        setPlayersPerTeam(1);
      }
    }
  }, [round]);
  
  // Handle name input change
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMatchFormData({
      ...matchFormData,
      name: e.target.value,
    });
  };
  
  // Handle adding a player to a team
  const handleAddPlayer = (playerId: number, team: 'aviator' | 'producer') => {
    if (team === 'aviator') {
      if (matchFormData.aviatorPlayerIds.length < playersPerTeam) {
        setMatchFormData({
          ...matchFormData,
          aviatorPlayerIds: [...matchFormData.aviatorPlayerIds, playerId],
        });
      }
    } else {
      if (matchFormData.producerPlayerIds.length < playersPerTeam) {
        setMatchFormData({
          ...matchFormData,
          producerPlayerIds: [...matchFormData.producerPlayerIds, playerId],
        });
      }
    }
  };
  
  // Handle removing a player from a team
  const handleRemovePlayer = (playerId: number, team: 'aviator' | 'producer') => {
    if (team === 'aviator') {
      setMatchFormData({
        ...matchFormData,
        aviatorPlayerIds: matchFormData.aviatorPlayerIds.filter(id => id !== playerId),
      });
    } else {
      setMatchFormData({
        ...matchFormData,
        producerPlayerIds: matchFormData.producerPlayerIds.filter(id => id !== playerId),
      });
    }
  };
  
  // Form submission handler
  const handleMatchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate that we have the correct number of players per team
    if (matchFormData.aviatorPlayerIds.length !== playersPerTeam || 
        matchFormData.producerPlayerIds.length !== playersPerTeam) {
      toast({
        title: "Invalid player selection",
        description: `You must select exactly ${playersPerTeam} player(s) for each team`,
        variant: "destructive",
        duration: 3000,
      });
      return;
    }
    
    createMatchMutation.mutate(matchFormData);
  };
  
  // Reset form
  const resetMatchForm = () => {
    setMatchFormData({
      name: "",
      aviatorPlayerIds: [],
      producerPlayerIds: [],
    });
  };

  // Get a list of players already participating in matches in this round from the API
  const playersInRound = roundParticipants.map(participant => participant.playerId);
  
  // Check if a player is already participating in any match in this round
  const isPlayerInRound = (playerId: number) => {
    return playersInRound.includes(playerId);
  };

  // Get player name by ID
  const getPlayerName = (playerId: number) => {
    const player = players.find(p => p.id === playerId);
    return player ? player.name : "Unknown Player";
  };

  const isLoading = isRoundLoading || isMatchesLoading;

  return (
    <div className="container mx-auto px-4 py-6">
      {isLoading ? (
        <>
          <div className="mb-6">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-36 w-full" />
          </div>
          <Skeleton className="h-6 w-28 mb-3" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full" />
            ))}
          </div>
        </>
      ) : (
        <>
          {round && (
            <>
              {/* Round Header */}
              <RoundHeader 
                id={round.id}
                name={round.name}
                matchType={round.matchType}
                courseName={round.courseName || ''}
                startTime={round.startTime || ''}
                aviatorScore={round.aviatorScore || 0}
                producerScore={round.producerScore || 0}
                pendingAviatorScore={round.pendingAviatorScore || 0}
                pendingProducerScore={round.pendingProducerScore || 0}
                date={round.date}
                matchCount={matches?.length || 0}
              />
              
              {/* Admin Controls */}
              {isAdmin && (
                <div className="mb-5 mt-4">
                  <Button 
                    onClick={() => setIsCreateMatchDialogOpen(true)}
                    className="flex items-center space-x-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add New Match</span>
                  </Button>
                </div>
              )}
            
              {/* Matches List */}
              <MatchesList matches={matches || []} />
              
              {/* Create Match Dialog */}
              {isCreateMatchDialogOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-background rounded-lg shadow-lg max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-xl font-bold">Add New Match</h2>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setIsCreateMatchDialogOpen(false)}
                        className="h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <form onSubmit={handleMatchFormSubmit}>
                      <div className="space-y-6">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground mb-2">
                            Match Type: <span className="font-bold text-foreground">{round.matchType}</span>
                          </p>
                          <p className="text-sm text-muted-foreground mb-4">
                            You need to select {playersPerTeam} player{playersPerTeam > 1 ? 's' : ''} for each team
                          </p>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium mb-1">
                            Match Name
                          </label>
                          <input
                            type="text"
                            name="name"
                            value={matchFormData.name}
                            onChange={handleNameChange}
                            className="w-full px-3 py-2 border rounded-md"
                            required
                          />
                        </div>
                        
                        {isPlayersLoading || isParticipantsLoading ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : (
                          <>
                            {/* Aviator Team Players Selection */}
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium">
                                  Aviators Team Players ({matchFormData.aviatorPlayerIds.length}/{playersPerTeam})
                                </label>
                              </div>
                              
                              {/* Selected Aviator Players */}
                              {matchFormData.aviatorPlayerIds.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {matchFormData.aviatorPlayerIds.map(playerId => (
                                    <Badge key={playerId} className="bg-blue-600">
                                      {getPlayerName(playerId)}
                                      <button 
                                        type="button"
                                        onClick={() => handleRemovePlayer(playerId, 'aviator')}
                                        className="ml-1 text-xs"
                                      >
                                        <X className="h-3 w-3 inline" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              
                              {/* Available Aviator Players */}
                              <div className="grid grid-cols-2 gap-2">
                                {players
                                  .filter(p => p.teamId === 1)
                                  .filter(p => !matchFormData.aviatorPlayerIds.includes(p.id))
                                  .map(player => (
                                    <Button
                                      key={player.id}
                                      type="button" 
                                      variant="outline" 
                                      size="sm"
                                      disabled={
                                        isPlayerInRound(player.id) || 
                                        matchFormData.aviatorPlayerIds.length >= playersPerTeam
                                      }
                                      onClick={() => handleAddPlayer(player.id, 'aviator')}
                                      className="text-xs justify-start"
                                    >
                                      <span className="truncate">{player.name}</span>
                                      {isPlayerInRound(player.id) && (
                                        <span className="ml-1 text-xs text-muted-foreground">(in match)</span>
                                      )}
                                    </Button>
                                  ))
                                }
                              </div>
                              <p className="text-xs text-gray-500 mt-1">
                                Players can only participate in one match per round
                              </p>
                            </div>
                            
                            {/* Producer Team Players Selection */}
                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium">
                                  Producers Team Players ({matchFormData.producerPlayerIds.length}/{playersPerTeam})
                                </label>
                              </div>
                              
                              {/* Selected Producer Players */}
                              {matchFormData.producerPlayerIds.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {matchFormData.producerPlayerIds.map(playerId => (
                                    <Badge key={playerId} className="bg-red-600">
                                      {getPlayerName(playerId)}
                                      <button 
                                        type="button"
                                        onClick={() => handleRemovePlayer(playerId, 'producer')}
                                        className="ml-1 text-xs"
                                      >
                                        <X className="h-3 w-3 inline" />
                                      </button>
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              
                              {/* Available Producer Players */}
                              <div className="grid grid-cols-2 gap-2">
                                {players
                                  .filter(p => p.teamId === 2)
                                  .filter(p => !matchFormData.producerPlayerIds.includes(p.id))
                                  .map(player => (
                                    <Button
                                      key={player.id}
                                      type="button" 
                                      variant="outline" 
                                      size="sm"
                                      disabled={
                                        isPlayerInRound(player.id) || 
                                        matchFormData.producerPlayerIds.length >= playersPerTeam
                                      }
                                      onClick={() => handleAddPlayer(player.id, 'producer')}
                                      className="text-xs justify-start"
                                    >
                                      <span className="truncate">{player.name}</span>
                                      {isPlayerInRound(player.id) && (
                                        <span className="ml-1 text-xs text-muted-foreground">(in match)</span>
                                      )}
                                    </Button>
                                  ))
                                }
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      
                      <div className="flex justify-end mt-6 space-x-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsCreateMatchDialogOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button 
                          type="submit"
                          disabled={
                            createMatchMutation.isPending || 
                            isPlayersLoading || 
                            !matchFormData.name ||
                            matchFormData.aviatorPlayerIds.length !== playersPerTeam ||
                            matchFormData.producerPlayerIds.length !== playersPerTeam
                          }
                        >
                          {createMatchMutation.isPending ? (
                            <span className="flex items-center">
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Creating...
                            </span>
                          ) : (
                            "Create Match"
                          )}
                        </Button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Round;