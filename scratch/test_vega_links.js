const axios = require('axios');
const cheerio = require('cheerio');

async function testLinks() {
  const url = 'https://vegamovie.ss/animation/';
  try {
    console.log("Fetching animation category page...");
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const series = [];
    $('article, .post-item, .blog-post, .post').each((i, el) => {
      const titleEl = $(el).find('h2 a, h3 a, a').first();
      const href = titleEl.attr('href');
      const title = titleEl.text().trim() || $(el).find('img').attr('alt') || '';
      if (href && (title.includes('Season') || title.includes('Series') || title.includes('EP') || title.includes('Episodes'))) {
        series.push({ title, href });
      }
    });

    console.log("Found series list on page 1:", series.slice(0, 5));
    
    if (series.length > 0) {
      const target = series[0];
      console.log(`\nFetching detail page of: "${target.title}" (${target.href})...`);
      const detailRes = await axios.get(target.href, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 10000
      });
      const $detail = cheerio.load(detailRes.data);
      console.log("Details Page Title:", $detail('h1').text().trim());
      
      // Let's find all divs with download-links-div class
      console.log("Download containers count:", $detail('.download-links-div').length);
      
      // Find all p, h3, div elements inside the entry content and print those that have "Episode" or "Pack" or "Complete"
      $detail('.entry-content p, .entry-content h3, .entry-content div, .entry-content h2').each((i, el) => {
        const text = $detail(el).text().trim();
        if (text && (text.toLowerCase().includes('episode') || text.toLowerCase().includes('season') || text.toLowerCase().includes('pack') || text.toLowerCase().includes('complete'))) {
          // Check if this element contains a link
          const hasLinks = $detail(el).find('a').length > 0;
          console.log(`\nNode ${i} [${$detail(el).prop('tagName')}]: "${text.substring(0, 200)}" (Has links: ${hasLinks})`);
          if (hasLinks) {
            $detail(el).find('a').each((j, a) => {
              console.log(`  Link ${j + 1}: "${$detail(a).text().trim()}" -> ${$detail(a).attr('href')}`);
            });
          }
        }
      });
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testLinks();
