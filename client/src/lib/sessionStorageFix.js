/**
 * This utility provides a fixed version of the session storage handling
 * for the BestBall scorecard component
 */

/**
 * Loads individual player scores without using sessionStorage
 * @param {Array} individualScores - Array of scores from the database
 * @param {Array} aviatorPlayersList - List of Aviator players
 * @param {Array} producerPlayersList - List of Producer players
 * @param {Function} setPlayerScores - State setter function for player scores
 * @param {Function} getPlayerCourseHandicap - Function to get player handicap
 * @param {Array} holes - Hole information including handicap ranks
 */
export function loadIndividualScores(
  individualScores, 
  aviatorPlayersList, 
  producerPlayersList, 
  setPlayerScores,
  getPlayerCourseHandicap,
  holes
) {
  if (!individualScores || individualScores.length === 0 || 
      aviatorPlayersList.length === 0 || producerPlayersList.length === 0) {
    return;
  }
  
  console.log("Loading scores from best_ball_player_scores table:", individualScores.length, "scores found");
  
  // Always load scores regardless of session storage
  console.log("Loading and displaying scores from database...");
  
  // Build the new scores
  setPlayerScores(prevScores => {
    // Start with previous scores to maintain handicap information
    const newPlayerScores = new Map(prevScores);
    
    individualScores.forEach(score => {
      const player = [...aviatorPlayersList, ...producerPlayersList]
        .find(p => p.id === score.playerId);
      
      if (!player) return;
      
      // Create keys for this score
      const teamKey = `${score.holeNumber}-${player.teamId === 1 ? 'aviator' : 'producer'}`;
      const playerKey = `${score.holeNumber}-${player.name}`;
      
      // Get handicap strokes (either from the score or from existing data)
      const existingData = prevScores.get(playerKey) || [];
      const handicapStrokes = score.handicapStrokes !== undefined ? 
        score.handicapStrokes : 
        (existingData.length > 0 ? existingData[0].handicapStrokes : 0);
      
      // Calculate net score
      let netScore = null;
      if (score.score !== null) {
        netScore = Math.max(0, score.score - handicapStrokes);
      }
      
      // Create the player score object
      const playerScoreObj = {
        player: player.name,
        score: score.score,
        teamId: player.teamId === 1 ? "aviator" : "producer",
        playerId: player.id,
        handicapStrokes,
        netScore,
        isBestBall: false, // Will be set later
      };
      
      // Add to player-specific collection
      newPlayerScores.set(playerKey, [playerScoreObj]);
      
      // Update team collection
      let teamScores = newPlayerScores.get(teamKey) || [];
      
      // Check if this player already has a score in the team collection
      const existingIndex = teamScores.findIndex(s => s.playerId === player.id);
      if (existingIndex >= 0) {
        teamScores[existingIndex] = playerScoreObj;
      } else {
        teamScores.push(playerScoreObj);
      }
      
      newPlayerScores.set(teamKey, teamScores);
    });
    
    return newPlayerScores;
  });
}

/**
 * Loads fallback scores from player_scores table without using sessionStorage
 * @param {Array} existingPlayerScores - Scores from player_scores table
 * @param {Array} individualScores - Scores from best_ball_player_scores table
 * @param {Array} aviatorPlayersList - List of Aviator players
 * @param {Array} producerPlayersList - List of Producer players
 * @param {Function} setPlayerScores - State setter function
 * @param {Function} getPlayerCourseHandicap - Function to get handicap
 * @param {Array} holes - Hole information
 */
export function loadFallbackScores(
  existingPlayerScores, 
  individualScores, 
  aviatorPlayersList, 
  producerPlayersList, 
  setPlayerScores,
  getPlayerCourseHandicap,
  holes
) {
  if (!existingPlayerScores || existingPlayerScores.length === 0 || 
      (individualScores && individualScores.length > 0) ||
      aviatorPlayersList.length === 0 || producerPlayersList.length === 0) {
    return;
  }
  
  console.log("Fallback: Loading scores from player_scores table:", existingPlayerScores.length, "scores found");
  
  setPlayerScores(prevScores => {
    const newPlayerScores = new Map(prevScores);
    
    existingPlayerScores.forEach(score => {
      const player = [...aviatorPlayersList, ...producerPlayersList]
        .find(p => p.id === score.playerId);
      
      if (!player) return;
      
      // Create key for this score
      const teamKey = `${score.holeNumber}-${player.teamId === 1 ? 'aviator' : 'producer'}`;
      const playerKey = `${score.holeNumber}-${player.name}`;
      
      // Get handicap information
      let handicapStrokes = 0;
      const hole = holes.find(h => h.number === score.holeNumber);
      
      if (hole && hole.handicapRank) {
        const courseHandicap = getPlayerCourseHandicap(player.id);
        if (courseHandicap >= hole.handicapRank) {
          handicapStrokes = 1;
          // Double stroke for #1 handicap hole if player's handicap is high enough
          if (hole.handicapRank === 1 && courseHandicap >= 19) {
            handicapStrokes = 2;
          }
        }
      }
      
      // Calculate net score
      const netScore = score.score !== null ? 
        Math.max(0, score.score - handicapStrokes) : null;
      
      // Create the player score object
      const playerScoreObj = {
        player: player.name,
        score: score.score,
        teamId: player.teamId === 1 ? "aviator" : "producer",
        playerId: player.id,
        handicapStrokes,
        netScore,
        isBestBall: false, // Will be set later
      };
      
      // Add to player-specific collection
      newPlayerScores.set(playerKey, [playerScoreObj]);
      
      // Update team collection
      let teamScores = newPlayerScores.get(teamKey) || [];
      
      // Check if this player already has a score in the team collection
      const existingIndex = teamScores.findIndex(s => s.playerId === player.id);
      if (existingIndex >= 0) {
        teamScores[existingIndex] = playerScoreObj;
      } else {
        teamScores.push(playerScoreObj);
      }
      
      newPlayerScores.set(teamKey, teamScores);
    });
    
    console.log("Fallback scores loaded");
    return newPlayerScores;
  });
}

// Export other fixed functions as needed