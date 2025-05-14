import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, UserPlus, Trash } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import aviatorsText from "@/assets/aviators-text.svg";
import producersText from "@/assets/producers-text.svg";

interface Player {
  id: number;
  name: string;
  teamId: number;
  wins: number;
  losses: number;
  ties: number;
}

interface Team {
  id: number;
  name: string;
  colorCode: string;
}

const AdminPlayersPage = () => {
  const [_, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTeam, setActiveTeam] = useState<number>(1);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const [playerToDelete, setPlayerToDelete] = useState<number | null>(null);
  const [playerFormData, setPlayerFormData] = useState({
    name: "",
    teamId: 1,
    wins: 0,
    losses: 0,
    ties: 0
  });

  const { data: teams, isLoading: isTeamsLoading } = useQuery<Team[]>({
    queryKey: ['/api/teams'],
  });

  const { data: players, isLoading: isPlayersLoading } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  const isLoading = isTeamsLoading || isPlayersLoading;

  // Group players by team and sort them by record
  const playersByTeam = players?.reduce((acc: Record<number, Player[]>, player: Player) => {
    if (!acc[player.teamId]) {
      acc[player.teamId] = [];
    }
    acc[player.teamId].push(player);
    return acc;
  }, {});

  const calculateWinPercentage = (player: Player) => {
    const total = player.wins + player.losses + player.ties;
    if (total === 0) return 0;
    return (player.wins + player.ties * 0.5) / total;
  };

  if (playersByTeam) {
    Object.keys(playersByTeam).forEach(teamId => {
      playersByTeam[Number(teamId)].sort((a, b) => {
        const aPercentage = calculateWinPercentage(a);
        const bPercentage = calculateWinPercentage(b);

        if (bPercentage !== aPercentage) {
          return bPercentage - aPercentage;
        }
        if (b.wins !== a.wins) {
          return b.wins - a.wins;
        }
        return a.name.localeCompare(b.name);
      });
    });
  }

  const addPlayerMutation = useMutation({
    mutationFn: async (playerData: any) => {
      const res = await apiRequest("POST", "/api/players", playerData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      toast({
        title: "Player added",
        description: "New player has been added successfully",
        duration: 1000,
      });
      setIsAddDialogOpen(false);
      resetPlayerForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to add player",
        description: error.message,
        variant: "destructive",
        duration: 1000,
      });
    },
  });

  const deletePlayerMutation = useMutation({
    mutationFn: async (playerId: number) => {
      const res = await apiRequest("DELETE", `/api/players/${playerId}`, {});
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/players'] });
      toast({
        title: "Player deleted",
        description: "Player has been removed successfully",
        duration: 1000,
      });
      setIsConfirmDeleteOpen(false);
      setPlayerToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete player",
        description: error.message,
        variant: "destructive",
        duration: 1000,
      });
    },
  });

  const handleOpenAddDialog = () => {
    resetPlayerForm();
    setPlayerFormData(prev => ({ ...prev, teamId: activeTeam }));
    setIsAddDialogOpen(true);
  };

  const resetPlayerForm = () => {
    setPlayerFormData({
      name: "",
      teamId: activeTeam,
      wins: 0,
      losses: 0,
      ties: 0
    });
  };

  const handlePlayerInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setPlayerFormData({
      ...playerFormData,
      [name]: name === 'teamId' ? parseInt(value) : name === 'name' ? value : parseInt(value) || 0
    });
  };

  const handlePlayerFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    addPlayerMutation.mutate(playerFormData);
  };

  const handleDeleteClick = (playerId: number) => {
    setPlayerToDelete(playerId);
    setIsConfirmDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (playerToDelete) {
      deletePlayerMutation.mutate(playerToDelete);
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="font-heading text-2xl font-bold mb-6">Team Rosters Management</h1>

      {isLoading ? (
        <div className="space-y-6">
          <div>
            <Skeleton className="h-10 w-36 mb-3" />
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex justify-between items-center border-b-2 border-gray-200 pb-4">
            <div 
              className={`cursor-pointer transition-opacity ${
                activeTeam === 1 ? 'opacity-100' : 'opacity-30'
              }`}
              onClick={() => setActiveTeam(1)}
            >
              <img src={aviatorsText} alt="The Aviators" className="h-8" />
            </div>
            <div 
              className={`cursor-pointer transition-opacity ${
                activeTeam === 2 ? 'opacity-100' : 'opacity-30'
              }`}
              onClick={() => setActiveTeam(2)}
            >
              <img src={producersText} alt="The Producers" className="h-8" />
            </div>
          </div>

          <div className="flex justify-end mb-4">
            <Button onClick={handleOpenAddDialog}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add Player
            </Button>
          </div>

          <div className="divide-y">
            {playersByTeam?.[activeTeam]?.map((player: Player) => {
              const teamColor = activeTeam === 1 ? 'rgba(0, 74, 127, 0.05)' : 'rgba(128, 0, 0, 0.05)';
              return (
                <div 
                  key={player.id} 
                  className="py-3 flex justify-between items-center px-3 rounded-md"
                  style={{ backgroundColor: teamColor }}
                >
                  <span className="font-medium">{player.name}</span>
                  <div className="flex items-center space-x-3">
                    <span className={`px-3 py-1 rounded-md text-white font-mono ${
                      player.wins > player.losses 
                        ? 'bg-green-600' 
                        : player.losses > player.wins 
                          ? 'bg-red-600' 
                          : 'bg-gray-500'
                    }`}>
                      {player.wins}-{player.losses}-{player.ties}
                    </span>
                    {player.wins + player.losses + player.ties > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {((player.wins / (player.wins + player.losses + player.ties)) * 100).toFixed(0)}%
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClick(player.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-100"
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Player Dialog */}
      {isAddDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Add New Player</h2>
            <form onSubmit={handlePlayerFormSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Player Name
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={playerFormData.name}
                    onChange={handlePlayerInputChange}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Team
                  </label>
                  <select
                    name="teamId"
                    value={playerFormData.teamId}
                    onChange={handlePlayerInputChange}
                    className="w-full px-3 py-2 border rounded-md"
                    required
                  >
                    {teams?.map(team => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
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
                  disabled={addPlayerMutation.isPending}
                >
                  {addPlayerMutation.isPending ? (
                    <span className="flex items-center">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </span>
                  ) : (
                    "Add Player"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {isConfirmDeleteOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg shadow-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-2">Confirm Deletion</h2>
            <p className="mb-4 text-destructive">
              Are you sure you want to delete this player? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsConfirmDeleteOpen(false);
                  setPlayerToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={confirmDelete}
                disabled={deletePlayerMutation.isPending}
              >
                {deletePlayerMutation.isPending ? (
                  <span className="flex items-center">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  "Delete Player"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPlayersPage;