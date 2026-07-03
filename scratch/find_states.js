const fs = require('fs');
const content = fs.readFileSync('c:/Users/Hp 992/OneDrive/Desktop/website/app.js', 'utf8');

const lines = content.split('\n');
lines.slice(0, 120).forEach((line, idx) => {
  if (line.includes('let') || line.includes('const')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
