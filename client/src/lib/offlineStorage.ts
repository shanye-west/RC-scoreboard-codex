// Offline storage helper for scores
// This provides a consistent interface for storing and retrieving scores
// when offline or when API calls fail

// Type for storing scores
interface OfflineScore {
  matchId: number;
  playerId: number;
  holeNumber: number;
  score: number | null;
  handicapStrokes?: number;
  netScore?: number | null;
  timestamp: string;
  synced: boolean;
}

// Save a score to local storage
export const saveScoreToLocalStorage = (score: {
  matchId: number;
  playerId: number;
  holeNumber: number;
  score: number | null;
  handicapStrokes?: number;
  netScore?: number | null;
}): void => {
  try {
    // Create a unique key for this score
    const scoreKey = `score_${score.matchId}_${score.playerId}_${score.holeNumber}`;
    
    // Save to local storage
    localStorage.setItem(scoreKey, JSON.stringify({
      ...score,
      timestamp: new Date().toISOString(),
      synced: false
    }));
    
    // Also maintain a list of pending scores to sync
    const pendingScores = JSON.parse(localStorage.getItem('pendingScores') || '[]');
    if (!pendingScores.includes(scoreKey)) {
      pendingScores.push(scoreKey);
      localStorage.setItem('pendingScores', JSON.stringify(pendingScores));
    }
    
    console.log(`Score saved to local storage: ${scoreKey}`);
  } catch (error) {
    console.error("Failed to save score to local storage:", error);
  }
};

// Get all pending scores from local storage
export const getPendingScores = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem('pendingScores') || '[]');
  } catch (error) {
    console.error("Failed to get pending scores from local storage:", error);
    return [];
  }
};

// Get a score from local storage
export const getScoreFromLocalStorage = (key: string): OfflineScore | null => {
  try {
    const scoreJson = localStorage.getItem(key);
    if (!scoreJson) return null;
    
    return JSON.parse(scoreJson);
  } catch (error) {
    console.error("Failed to get score from local storage:", error);
    return null;
  }
};

// Mark a score as synced in local storage
export const markScoreAsSynced = (key: string): void => {
  try {
    const scoreJson = localStorage.getItem(key);
    if (!scoreJson) return;
    
    const score = JSON.parse(scoreJson);
    score.synced = true;
    
    localStorage.setItem(key, JSON.stringify(score));
    
    // Remove from pending scores list
    const pendingScores = JSON.parse(localStorage.getItem('pendingScores') || '[]');
    const updatedPendingScores = pendingScores.filter((k: string) => k !== key);
    localStorage.setItem('pendingScores', JSON.stringify(updatedPendingScores));
  } catch (error) {
    console.error("Failed to mark score as synced:", error);
  }
};

// Remove a score from local storage
export const removeScoreFromLocalStorage = (key: string): void => {
  try {
    localStorage.removeItem(key);
    
    // Remove from pending scores list
    const pendingScores = JSON.parse(localStorage.getItem('pendingScores') || '[]');
    const updatedPendingScores = pendingScores.filter((k: string) => k !== key);
    localStorage.setItem('pendingScores', JSON.stringify(updatedPendingScores));
  } catch (error) {
    console.error("Failed to remove score from local storage:", error);
  }
};

// Get all scores for a specific match
export const getMatchScoresFromLocalStorage = (matchId: number): OfflineScore[] => {
  try {
    const scores: OfflineScore[] = [];
    
    // Loop through all localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`score_${matchId}_`)) continue;
      
      const score = getScoreFromLocalStorage(key);
      if (score) scores.push(score);
    }
    
    return scores;
  } catch (error) {
    console.error("Failed to get match scores from local storage:", error);
    return [];
  }
};