export interface Player {
  id: number;
  name: string;
  teamId: number;
  handicapIndex?: number | null;
  userId?: number;
}

export interface Hole {
  id: number;
  number: number;
  par: number;
  handicapRank?: number | null;
}

export interface BestBallPlayerScore {
  id?: number;
  matchId: number;
  playerId: number;
  holeNumber: number;
  score: number;
  handicapStrokes: number;
  netScore: number;
  updatedAt?: string;
}

export interface MatchParticipant {
  matchId: number;
  playerId: number;
  team: string;
  playerName?: string;
} 