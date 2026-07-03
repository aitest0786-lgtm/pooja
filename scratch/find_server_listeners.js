const fs = require('fs');
const content = fs.readFileSync('c:/Users/Hp 992/OneDrive/Desktop/website/public/app.js', 'utf8');

const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('.server-btn') || line.includes('server-btn') || line.includes('serverBtn')) {
    console.log(`${idx + 1}: ${line.trim()}`);
  }
});
