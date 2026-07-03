const axios = require('axios');
const cheerio = require('cheerio');

async function testSaareJahan() {
  const searchUrl = 'https://okjatt.bond/movies/src_data.php?q=Saare+Jahan';
  console.log("Searching OkJatt for 'Saare Jahan'...");
  try {
    const searchRes = await axios.get(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $search = cheerio.load(searchRes.data);
    const movies = [];
    $search('a').each((i, el) => {
      const href = $search(el).attr('href');
      const title = $search(el).text().trim();
      if (href && title) {
        movies.push({ title, href: href.startsWith('http') ? href : new URL(href, 'https://okjatt.bond').href });
      }
    });

    console.log("Found movies:", movies);
    if (movies.length > 0) {
      // Find the match that has ID 15347
      const target = movies.find(m => m.href.includes('--15347.html')) || movies[0];
      console.log(`\nFetching detail page: ${target.href}`);
      const detailRes = await axios.get(target.href, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const $detail = cheerio.load(detailRes.data);
      
      let downloadPageUrl = null;
      $detail('a').each((i, el) => {
        const href = $detail(el).attr('href');
        if (href && (href.includes('/movies/download/') || href.includes('/download/'))) {
          downloadPageUrl = href.startsWith('http') ? href : new URL(href, target.href).href;
          return false;
        }
      });
      
      console.log("Download Page URL:", downloadPageUrl);
      if (downloadPageUrl) {
        // Automatically sanitize and encode URL
        const safeDwdUrl = new URL(downloadPageUrl).href;
        console.log(`Fetching download page: ${safeDwdUrl}`);
        const dwdRes = await axios.get(safeDwdUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $dwd = cheerio.load(dwdRes.data);
        
        console.log("\nVideo tags on download page:");
        $dwd('video, video source').each((i, el) => {
          console.log(`Tag: ${$dwd(el).prop('tagName')}, src: ${$dwd(el).attr('src')}`);
        });

        console.log("\nLinks on download page:");
        $dwd('a').each((i, el) => {
          const href = $dwd(el).attr('href');
          const text = $dwd(el).text().trim();
          if (href) {
            console.log(`- "${text}" -> ${href}`);
          }
        });
      }
    }
  } catch (err) {
    console.error("Failed:", err.message);
  }
}

testSaareJahan();
