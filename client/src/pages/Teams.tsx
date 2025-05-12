import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocation } from "wouter";
import { useState } from "react";
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

const Teams = () => {
  const [_, navigate] = useLocation();
  const [activeTeam, setActiveTeam] = useState<number>(1); // Start with Aviators (teamId: 1)

  // Fetch teams data
  const { data: teams, isLoading: isTeamsLoading } = useQuery<Team[]>({
    queryKey: ['/api/teams'],
  });

  // Fetch players data
  const { data: players, isLoading: isPlayersLoading } = useQuery<Player[]>({
    queryKey: ['/api/players'],
  });

  const isLoading = isTeamsLoading || isPlayersLoading;

  const handleBackClick = () => {
    navigate('/');
  };

  // Group players by team and sort them by record
  const playersByTeam = players?.reduce((acc: Record<number, Player[]>, player: Player) => {
    if (!acc[player.teamId]) {
      acc[player.teamId] = [];
    }
    acc[player.teamId].push(player);
    return acc;
  }, {});
  
  // Calculate win percentage for sorting
  const calculateWinPercentage = (player: Player) => {
    const total = player.wins + player.losses + player.ties;
    if (total === 0) return 0;
    return (player.wins + player.ties * 0.5) / total;
  };
  
  // Sort players by win percentage, then by wins
  if (playersByTeam) {
    Object.keys(playersByTeam).forEach(teamId => {
      playersByTeam[Number(teamId)].sort((a, b) => {
        const aPercentage = calculateWinPercentage(a);
        const bPercentage = calculateWinPercentage(b);
        
        if (bPercentage !== aPercentage) {
          return bPercentage - aPercentage;
        }
        
        // If percentages are equal, sort by number of wins
        if (b.wins !== a.wins) {
          return b.wins - a.wins;
        }
        
        // If wins are equal, sort alphabetically
        return a.name.localeCompare(b.name);
      });
    });
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <h1 className="font-heading text-2xl font-bold mb-6">Team Rosters</h1>

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
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default Teams;