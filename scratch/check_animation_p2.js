const axios = require('axios');
const cheerio = require('cheerio');

async function testPage2() {
  const url = 'https://vegamovie.ss/animation/page/2/';
  try {
    console.log(`Fetching ${url}...`);
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    console.log(`Status: ${res.status}`);
    const $ = cheerio.load(res.data);
    const titles = [];
    $('article, .post-item, .blog-post, .post').each((i, el) => {
      const titleEl = $(el).find('h2 a, h3 a, a').first();
      titles.push(titleEl.text().trim());
    });
    console.log(`Found ${titles.length} titles on page 2. First 3:`);
    console.log(titles.slice(0, 3));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testPage2();
