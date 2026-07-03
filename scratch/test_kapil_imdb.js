const axios = require('axios');

function cleanMovieTitle(title) {
  if (!title) return '';
  let cleaned = title;
  
  cleaned = cleaned.replace(/okjatt\.bond\.com|okjatt\.bond|okjatthd\.bond|okjatt\.in|okjatt\.org|okjatt|vegamovie\.ss|vegamovies|nikkXmovie/gi, ' ');

  let year = '';
  const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    year = yearMatch[0];
  }
  
  cleaned = cleaned
    .replace(/\b(s\d+ep\d+|s\d+\s+ep\d+|season\s+\d+|seanon\s+\d+|seasons|season|episodes|episode|episode\s+\d+|ep\d+|series|all|full)\b/gi, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(/\{.*?\}/g, ' ')
    .replace(/\b(480p|720p|1080p|2160p|4k|hd|web-dl|webrip|hdtc|hdtv|camrip|telesync|tc|ts|rip)\b/gi, ' ')
    .replace(/\b(hindi|english|tamil|telugu|malayalam|kannada|punjabi|odia|bangali|gujarati|marathi|korean|chinese|urdu|multi-audio|dual-audio|org|dubbed|hq|dub|dual|audio|esub|mkv|mp4|download|watch|online)\b/gi, ' ')
    .replace(/\b(full movie|uncut|extended|directors cut|complete|bootstrap)\b/gi, ' ')
    .replace(/\b(web series|webseries|tv show|tvshow|watch free)\b/gi, ' ')
    .replace(/[\-|\|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
    
  if (year && !cleaned.includes(year)) {
    cleaned += ' ' + year;
  }
  return cleaned.replace(/\s+/g, ' ').trim();
}

async function getImdbIdByTitle(title) {
  const cleanTitle = cleanMovieTitle(title);
  console.log(`Cleaned title: "${cleanTitle}"`);
  
  try {
    const firstChar = cleanTitle.charAt(0).toLowerCase();
    const queryChar = /^[a-z0-9]$/.test(firstChar) ? firstChar : 'a';
    
    const searchUrl = `https://sg.media-imdb.com/suggests/${queryChar}/${encodeURIComponent(cleanTitle.toLowerCase())}.json`;
    const response = await axios.get(searchUrl, { timeout: 6000 });
    
    const dataText = response.data;
    const jsonStart = dataText.indexOf('(') + 1;
    const jsonEnd = dataText.lastIndexOf(')');
    if (jsonStart > 0 && jsonEnd > jsonStart) {
      const jsonText = dataText.substring(jsonStart, jsonEnd);
      const json = JSON.parse(jsonText);
      if (json && json.d && json.d.length > 0) {
        const match = json.d.find(item => item.id && item.id.startsWith('tt'));
        if (match) {
          return { id: match.id, name: match.l };
        }
      }
    }
  } catch (error) {
    console.error("IMDb API Error:", error.message);
  }
  return null;
}

async function runTest() {
  const title = "nikkXmovie The Great Indian Kapil Show Series all Seasons Hindi full";
  const res = await getImdbIdByTitle(title);
  console.log("Result:", res);
}

runTest();
