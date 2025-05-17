// This patch removes all sessionStorage checks that prevent scores from loading on refresh
// Apply this by running:
// node patch.js

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'client', 'src', 'components', 'EnhancedMatchScorecard.tsx');

try {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Remove session storage checks
  content = content.replace(
    /if\s*\(\s*sessionStorage\.getItem\([^)]+\)\s*===\s*['"]true['"]\s*&&\s*playerScores\.size\s*>\s*0\s*\)\s*{\s*return;\s*}/g,
    `if (playerScores.size > 0) { return; // Skip processing if we already have data }`
  );
  
  // Remove session storage setItem calls
  content = content.replace(
    /sessionStorage\.setItem\([^)]+,\s*['"]true['"]\);/g,
    `console.log("Removed session storage dependency");`
  );
  
  // Remove the initialization check
  content = content.replace(
    /const\s+handicapsInitialized\s*=\s*sessionStorage\.getItem\([^)]+\);\s*if\s*\(\s*handicapsInitialized\s*===\s*['"]true['"]\s*\)\s*{\s*[^}]+return;\s*}/gs,
    `console.log("Always initialize on refresh");`
  );
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully patched EnhancedMatchScorecard.tsx to fix session storage issues');
} catch (error) {
  console.error('Error patching file:', error);
}