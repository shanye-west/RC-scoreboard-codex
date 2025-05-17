/**
 * A custom hook to handle player scores persistence properly with no sessionStorage reliance
 * 
 * This hook ensures that scores are always loaded from the database on page refresh,
 * fixing the issue where individual scores disappear until user interaction.
 */

import { useEffect } from 'react';

/**
 * Hook to load individual scores without being blocked by sessionStorage
 */
export function useIndividualScores(
  isBestBall,
  individualScores,
  aviatorPlayersList,
  producerPlayersList,
  setPlayerScores,
  matchId
) {
  useEffect(() => {
    // Only proceed if we have players and individual scores
    if (!isBestBall || 
        !Array.isArray(individualScores) || 
        individualScores.length === 0 || 
        aviatorPlayersList.length === 0 || 
        producerPlayersList.length === 0) {
      return;
    }
    
    console.log("Loading scores from best_ball_player_scores table:", individualScores.length, "scores found");
    console.log("Always loading scores regardless of session state");
    
    // Process scores
    processIndividualScores(
      individualScores,
      aviatorPlayersList,
      producerPlayersList,
      setPlayerScores
    );
  }, [isBestBall, individualScores, aviatorPlayersList, producerPlayersList, setPlayerScores, matchId]);
}

/**
 * Hook to use fallback scores without being blocked by sessionStorage
 */
export function useFallbackScores(
  isBestBall,
  existingPlayerScores,
  individualScores,
  aviatorPlayersList,
  producerPlayersList,
  setPlayerScores,
  getPlayerCourseHandicap,
  holes,
  matchId
) {
  useEffect(() => {
    // Only run if this is a best ball match with player scores but no individual scores
    if (!isBestBall || 
        !Array.isArray(existingPlayerScores) || 
        existingPlayerScores.length === 0 || 
        (Array.isArray(individualScores) && individualScores.length > 0) ||
        aviatorPlayersList.length === 0 || 
        producerPlayersList.length === 0) {
      return;
    }
    
    console.log("Processing fallback scores from player_scores table:", existingPlayerScores.length);
    processFallbackScores(
      existingPlayerScores,
      aviatorPlayersList,
      producerPlayersList,
      setPlayerScores,
      getPlayerCourseHandicap,
      holes
    );
  }, [
    isBestBall, 
    existingPlayerScores, 
    individualScores, 
    aviatorPlayersList, 
    producerPlayersList, 
    setPlayerScores, 
    getPlayerCourseHandicap, 
    holes, 
    matchId
  ]);
}

// Helper function to process individual scores
function processIndividualScores(
  individualScores,
  aviatorPlayersList,
  producerPlayersList,
  setPlayerScores
) {
  setPlayerScores(prevScores => {
    const newPlayerScores = new Map(prevScores);
    
    individualScores.forEach(score => {
      const player = [...aviatorPlayersList, ...producerPlayersList]
        .find(p => p.id === score.playerId);
      
      if (!player) return;
      
      const teamId = player.teamId === 1 ? "aviator" : "producer";
      const playerKey = `${score.holeNumber}-${player.name}`;
      const teamKey = `${score.holeNumber}-${teamId}`;
      
      // Create player score object
      const playerScoreObj = {
        player: player.name,
        score: score.score,
        teamId,
        playerId: player.id,
        handicapStrokes: score.handicapStrokes || 0,
        netScore: score.netScore,
        isBestBall: false, // Will be set in a later step
      };
      
      // Add to player-specific and team collections
      newPlayerScores.set(playerKey, [playerScoreObj]);
      
      const existingTeamScores = newPlayerScores.get(teamKey) || [];
      const existingIndex = existingTeamScores.findIndex(s => s.playerId === player.id);
      
      if (existingIndex >= 0) {
        existingTeamScores[existingIndex] = playerScoreObj;
      } else {
        existingTeamScores.push(playerScoreObj);
      }
      
      newPlayerScores.set(teamKey, existingTeamScores);
    });
    
    return newPlayerScores;
  });
}

// Helper function to process fallback scores
function processFallbackScores(
  existingPlayerScores,
  aviatorPlayersList,
  producerPlayersList,
  setPlayerScores,
  getPlayerCourseHandicap,
  holes
) {
  setPlayerScores(prevScores => {
    const newPlayerScores = new Map(prevScores);
    
    existingPlayerScores.forEach(score => {
      const player = [...aviatorPlayersList, ...producerPlayersList]
        .find(p => p.id === score.playerId);
      
      if (!player) return;
      
      const teamId = player.teamId === 1 ? "aviator" : "producer";
      const playerKey = `${score.holeNumber}-${player.name}`;
      const teamKey = `${score.holeNumber}-${teamId}`;
      
      // Calculate handicap strokes
      let handicapStrokes = 0;
      const hole = holes.find(h => h.number === score.holeNumber);
      if (hole && hole.handicapRank) {
        const courseHandicap = getPlayerCourseHandicap(player.id);
        if (courseHandicap >= hole.handicapRank) {
          handicapStrokes = 1;
          // Double stroke for #1 handicap hole if handicap is high enough
          if (hole.handicapRank === 1 && courseHandicap >= 19) {
            handicapStrokes = 2;
          }
        }
      }
      
      // Calculate net score
      const netScore = score.score !== null ? 
        Math.max(0, score.score - handicapStrokes) : null;
      
      // Create player score object
      const playerScoreObj = {
        player: player.name,
        score: score.score,
        teamId,
        playerId: player.id,
        handicapStrokes,
        netScore,
        isBestBall: false, // Will be set in a later step
      };
      
      // Add to player-specific and team collections
      newPlayerScores.set(playerKey, [playerScoreObj]);
      
      const existingTeamScores = newPlayerScores.get(teamKey) || [];
      const existingIndex = existingTeamScores.findIndex(s => s.playerId === player.id);
      
      if (existingIndex >= 0) {
        existingTeamScores[existingIndex] = playerScoreObj;
      } else {
        existingTeamScores.push(playerScoreObj);
      }
      
      newPlayerScores.set(teamKey, existingTeamScores);
    });
    
    return newPlayerScores;
  });
}