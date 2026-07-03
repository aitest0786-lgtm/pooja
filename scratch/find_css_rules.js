const fs = require('fs');
const content = fs.readFileSync('c:/Users/Hp 992/OneDrive/Desktop/website/public/style.css', 'utf8');

const keywords = ['modal', 'detail', 'player-box', 'video', 'aspect-ratio'];
keywords.forEach(kw => {
  const matches = [];
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.toLowerCase().includes(kw.toLowerCase())) {
      matches.push(`${idx + 1}: ${line.trim()}`);
    }
  });
  console.log(`=== Matches for "${kw}" ===`);
  console.log(matches.slice(0, 10).join('\n'));
});
