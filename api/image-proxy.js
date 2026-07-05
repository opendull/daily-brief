const axios = require('axios');

module.exports = async (req, res) => {
  const { url } = req.query;
  if (!url) {
    res.status(400).send('Missing url');
    return;
  }

  try {
    const sourceOrigin = new URL(url).origin;

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': sourceOrigin,
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8'
      },
      timeout: 10000
    });

    let contentType = response.headers['content-type'];
    if (!contentType || !contentType.startsWith('image/')) {
      // guess from file extension as fallback
      if (url.match(/\.png/i)) contentType = 'image/png';
      else if (url.match(/\.webp/i)) contentType = 'image/webp';
      else if (url.match(/\.gif/i)) contentType = 'image/gif';
      else contentType = 'image/jpeg';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(response.data);
  } catch (err) {
    console.error('Image proxy failed:', err.message);
    res.status(404).send('Image not found');
  }
};