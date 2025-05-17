// Script to add handicap dot calculation functions
// This will add a function to the top of the file
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, './client/src/components/EnhancedMatchScorecard.tsx');
let content = fs.readFileSync('./client/src/components/EnhancedMatchScorecard.tsx', 'utf8');

// Add a new useEffect to ensure player handicap strokes are always respected in scoring
const searchString = `// For Best Ball, we need to track individual player scores
  const [playerScores, setPlayerScores] = useState<
    Map<string, BestBallPlayerScore[]>
  >(new Map());`;

const newFunction = `// For Best Ball, we need to track individual player scores
  const [playerScores, setPlayerScores] = useState<
    Map<string, BestBallPlayerScore[]>
  >(new Map());
  
  // Ensure handicap strokes are visible in the UI
  useEffect(() => {
    if (isBestBall && playerHandicaps.length > 0 && holes.length > 0) {
      const allPlayers = [...aviatorPlayersList, ...producerPlayersList];
      
      // Update playerScores with handicap information for each player and hole
      const handicapUpdates = new Map(playerScores);
      
      holes.forEach(hole => {
        allPlayers.forEach(player => {
          const playerKey = \`\${hole.number}-\${player.name}\`;
          const playerScore = handicapUpdates.get(playerKey)?.[0];
          
          if (playerScore) {
            // Ensure handicap strokes are set, even if score is missing
            const courseHandicap = getPlayerCourseHandicap(player.id);
            const handicapRank = hole.handicapRank || 0;
            
            // Calculate strokes similar to getHandicapStrokes function
            let handicapStrokes = 0;
            if (handicapRank > 0 && courseHandicap >= handicapRank) {
              handicapStrokes = 1;
            }
            if (handicapRank === 1 && courseHandicap >= 19) {
              handicapStrokes = 2;
            }
            
            // Update player score with handicap strokes
            playerScore.handicapStrokes = handicapStrokes;
            handicapUpdates.set(playerKey, [playerScore]);
          }
        });
      });
      
      // Update state if there are changes
      if (handicapUpdates.size > playerScores.size) {
        setPlayerScores(handicapUpdates);
      }
    }
  }, [isBestBall, playerHandicaps, holes, aviatorPlayersList, producerPlayersList, getPlayerCourseHandicap]);`;

if (!content.includes("Ensure handicap strokes are visible in the UI")) {
  content = content.replace(searchString, newFunction);
  fs.writeFileSync('./client/src/components/EnhancedMatchScorecard.tsx', content);
  console.log("Added handicap visibility function");
} else {
  console.log("Handicap visibility function already exists");
}
