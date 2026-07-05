const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config();
const supabase = require('../../lib/supabase');

async function scrapeArticle(url) {
  const response = await axios.get(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    timeout: 10000
  });
  const $ = cheerio.load(response.data);

  let body = '';
  const bodySelectors = ['.storyDetails p', 'div.artBody p', 'article p', '.story-content p'];
  for (const selector of bodySelectors) {
    const paragraphs = $(selector);
    if (paragraphs.length > 3) {
      body = paragraphs.map((i, el) => $(el).text().trim()).get().join('\n\n');
      break;
    }
  }
  if (!body) {
    body = $('p').map((i, el) => $(el).text().trim()).get().filter(p => p.length > 30).join('\n\n');
  }
  return body.trim();
}

function renderPage({ title, content, image, category, published_at }) {
  const paragraphs = content.split('\n\n').filter(p => p.length > 0)
    .map(p => `<p>${p}</p>`).join('\n');

  const dateStr = published_at ? new Date(published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  :root {
    color-scheme: light dark;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0 24px 60px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
    background: #ffffff;
    color: #1d1d1f;
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1c1c1e; color: #e8e8ed; }
    .meta { color: #8e8e93 !important; }
    .divider { border-color: #38383a !important; }
  }
  .wrap {
    max-width: 680px;
    margin: 0 auto;
  }
  .category {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: #ff9f0a;
    padding-top: 32px;
  }
  h1 {
    font-size: 28px;
    line-height: 1.3;
    font-weight: 700;
    margin: 10px 0 8px;
  }
  .meta {
    font-size: 14px;
    color: #86868b;
    margin-bottom: 24px;
  }
  img.hero {
    width: 100%;
    border-radius: 10px;
    margin-bottom: 28px;
  }
  .divider {
    border: none;
    border-top: 1px solid #e5e5ea;
    margin: 0 0 28px;
  }
  p {
    font-size: 18px;
    line-height: 1.7;
    margin: 0 0 22px;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="category">${category || 'Article'}</div>
    <h1>${title}</h1>
    <div class="meta">${dateStr}</div>
    ${image ? `<img class="hero" src="${image}" alt="">` : ''}
    <hr class="divider">
    ${paragraphs}
  </div>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const { id } = req.query;

  const { data: article, error } = await supabase
    .from('articles')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !article) {
    res.status(404).send('<h1 style="font-family:-apple-system;text-align:center;margin-top:100px;">Article not found</h1>');
    return;
  }

  let content = article.content;

  if (!content) {
    try {
      content = await scrapeArticle(article.link);
      if (content) {
        await supabase
          .from('articles')
          .update({ content, scraped_at: new Date().toISOString() })
          .eq('id', id);
      }
    } catch (err) {
      console.error('Scrape failed:', err.message);
    }
  }

  if (!content) {
    content = article.description || 'Content unavailable.';
  }

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(renderPage({ ...article, content }));
};