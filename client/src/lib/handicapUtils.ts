/**
 * Utility functions for handling handicap strokes in the golf app
 */

// Get the localStorage key for a player's handicap
export const getPlayerHandicapKey = (playerId: number, roundId: number): string => {
  return `handicap_player_${playerId}_round_${roundId}`;
};

// Get the localStorage key for a player's handicap strokes on a hole
export const getHandicapStrokesKey = (playerId: number, holeNumber: number, matchId: number): string => {
  return `handicap_strokes_player_${playerId}_hole_${holeNumber}_match_${matchId}`;
};

// Save a player's course handicap to localStorage
export const savePlayerCourseHandicap = (playerId: number, roundId: number, courseHandicap: number): void => {
  try {
    const key = getPlayerHandicapKey(playerId, roundId);
    localStorage.setItem(key, courseHandicap.toString());
  } catch (error) {
    console.error("Failed to save player course handicap to localStorage:", error);
  }
};

// Get a player's course handicap from localStorage
export const getPlayerCourseHandicapFromStorage = (playerId: number, roundId: number): number => {
  try {
    const key = getPlayerHandicapKey(playerId, roundId);
    const handicap = localStorage.getItem(key);
    return handicap ? parseInt(handicap) : 0;
  } catch (error) {
    console.error("Failed to get player course handicap from localStorage:", error);
    return 0;
  }
};

// Save handicap strokes for a player on a hole to localStorage
export const saveHandicapStrokes = (
  playerId: number, 
  holeNumber: number, 
  matchId: number, 
  handicapStrokes: number
): void => {
  try {
    const key = getHandicapStrokesKey(playerId, holeNumber, matchId);
    localStorage.setItem(key, handicapStrokes.toString());
  } catch (error) {
    console.error("Failed to save handicap strokes to localStorage:", error);
  }
};

// Get handicap strokes for a player on a hole from localStorage
export const getHandicapStrokesFromStorage = (playerId: number, holeNumber: number, matchId: number): number => {
  try {
    const key = getHandicapStrokesKey(playerId, holeNumber, matchId);
    const strokes = localStorage.getItem(key);
    return strokes ? parseInt(strokes) : 0;
  } catch (error) {
    console.error("Failed to get handicap strokes from localStorage:", error);
    return 0;
  }
};

// Calculate handicap strokes based on course handicap and hole rank
export const calculateHandicapStrokes = (courseHandicap: number, handicapRank: number): number => {
  if (handicapRank <= 0) return 0;
  
  // Basic stroke allocation: if player's handicap is >= hole rank, they get a stroke
  if (courseHandicap >= handicapRank) {
    // Special case: on the #1 handicap hole, players with 19+ handicap get 2 strokes
    if (handicapRank === 1 && courseHandicap >= 19) {
      return 2;
    }
    return 1;
  }
  
  return 0;
};