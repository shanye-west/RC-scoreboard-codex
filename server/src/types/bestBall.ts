export interface BestBallPlayerScore {
  id: number;
  match_id: number;
  player_id: number;
  hole_number: number;
  score: number | null;
  handicap_strokes: number;
  net_score: number | null;
  player_name: string;
  team_id: number;
  created_at: Date;
  updated_at: Date;
}

export interface BestBallMatch {
  id: number;
  round_id: number;
  team1_id: number;
  team2_id: number;
  team1_score: number;
  team2_score: number;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: Date;
  updated_at: Date;
} 