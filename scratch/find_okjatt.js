const fs = require('fs');
const content = fs.readFileSync('c:/Users/Hp 992/OneDrive/Desktop/website/server.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('okjatt') || line.includes('OKJATT')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
