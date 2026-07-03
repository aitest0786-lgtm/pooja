const axios = require('axios');

async function testVidsrc() {
  const domains = [
    'https://vidsrc.to/embed/movie/tt41794494',
    'https://vidsrc.cc/v2/embed/movie/tt41794494',
    'https://vsrc.su/embed/movie/tt41794494',
    'https://vidsrcme.ru/embed/movie/tt41794494'
  ];
  
  for (const url of domains) {
    try {
      console.log(`Testing GET ${url}...`);
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        timeout: 4000
      });
      console.log(`Success! Status: ${res.status}, Length: ${res.data.length}`);
    } catch (err) {
      console.log(`Failed: ${err.message}`);
      if (err.response) {
        console.log(`  Response Status: ${err.response.status}`);
      }
    }
  }
}

testVidsrc();
