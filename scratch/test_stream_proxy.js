const axios = require('axios');

async function testStream() {
  const url = 'http://localhost:3000/api/stream-play?id=aHR0cDovL2NkbjMuY2hlY2t5b3VybGlua3Muc2hvcC9IaW5kaS1Cb2xseXdvb2QvMTU1MTMvTWFhLUJlaGVuLTIwMjYtSGluZGktLWhkLVtPa0phdHRdLm1wNA==';
  console.log("Requesting mocked stream-play endpoint...");
  try {
    const res = await axios.get(url, {
      headers: {
        'Range': 'bytes=0-100'
      },
      timeout: 10000
    });
    console.log("Success! Status:", res.status);
    console.log("Headers:", res.headers);
    console.log("Data length received:", res.data.length);
  } catch (err) {
    console.log("Error:", err.message);
    if (err.response) {
      console.log("  Status:", err.response.status);
      console.log("  Headers:", err.response.headers);
    }
  }
}

testStream();
