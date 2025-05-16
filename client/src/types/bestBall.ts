export interface BestBallPlayerScore {
  player: string;
  score: number | null;
  teamId: 'aviator' | 'producer';
  playerId: number;
  handicapStrokes: number;
  netScore: number | null;
}

export interface BestBallMatch {
  id: number;
  roundId: number;
  team1Id: number;
  team2Id: number;
  team1Score: number;
  team2Score: number;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface BestBallHole {
  number: number;
  par: number;
  handicapRank: number;
}

export interface BestBallTeam {
  id: number;
  name: string;
  players: BestBallPlayer[];
}

export interface BestBallPlayer {
  id: number;
  name: string;
  handicapIndex: number;
  teamId: number;
} 