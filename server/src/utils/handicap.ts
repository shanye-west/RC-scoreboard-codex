interface Hole {
  number: number;
  par: number;
  handicapRank: number;
}

interface Player {
  id: number;
  handicapIndex: number;
}

export const calculateHandicapStrokes = (
  player: Player,
  hole: Hole,
  slopeRating: number = 113
): number => {
  if (!player.handicapIndex) return 0;

  // Calculate course handicap
  const courseHandicap = Math.round(player.handicapIndex * (slopeRating / 113));
  
  // Calculate strokes based on hole handicap rank
  let strokes = 0;
  if (courseHandicap >= hole.handicapRank) {
    strokes = 1;
    // Add extra stroke for holes ranked 1-18 if course handicap is high enough
    if (hole.handicapRank <= 18 && courseHandicap >= hole.handicapRank + 18) {
      strokes = 2;
    }
  }

  return strokes;
}; 