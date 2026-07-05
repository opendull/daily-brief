require('dotenv').config();
const supabase = require('../lib/supabase');

function renderSavedPage(articles) {
  const rows = articles.map(a => `
    <a class="row ${a.bookmarked ? 'bm' : ''} ${a.liked ? 'lk' : ''}" href="/api/article/${a.id}">
      <div class="row-category">${a.category || ''}</div>
      <div class="row-title">${a.title}</div>
      <div class="row-date">${a.published_at ? new Date(a.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</div>
    </a>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Saved</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0 20px 60px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
    background: #ffffff; color: #1d1d1f; -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1c1c1e; color: #e8e8ed; }
    .row-date { color: #8e8e93 !important; }
    .divider { border-color: #38383a !important; }
    .tabs { background: #2c2c2e !important; }
    .tab.active { background: #48484a !important; }
  }
  .wrap { max-width: 680px; margin: 0 auto; }
  h1 { font-size: 28px; font-weight: 700; margin: 32px 0 16px; }
  .tabs {
    display: flex; background: #f2f2f7; border-radius: 10px;
    padding: 3px; margin-bottom: 24px;
  }
  .tab {
    flex: 1; text-align: center; padding: 8px 0; border-radius: 8px;
    font-size: 14px; font-weight: 600; cursor: pointer; background: none; border: none; color: inherit;
  }
  .tab.active { background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .row {
    display: block; text-decoration: none; color: inherit;
    padding: 16px 0; border-bottom: 1px solid #e5e5ea;
  }
  .row-category {
    font-size: 12px; font-weight: 600; letter-spacing: 0.03em;
    text-transform: uppercase; color: #ff9f0a; margin-bottom: 4px;
  }
  .row-title { font-size: 17px; font-weight: 600; line-height: 1.4; margin-bottom: 4px; }
  .row-date { font-size: 13px; color: #86868b; }
  .row.hidden { display: none; }
  .empty { text-align: center; color: #86868b; padding: 60px 0; font-size: 15px; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>Saved</h1>
    <div class="tabs">
      <button class="tab active" id="tabBm" onclick="showTab('bm')">Bookmarked</button>
      <button class="tab" id="tabLk" onclick="showTab('lk')">Liked</button>
    </div>
    <div id="list">${rows || '<div class="empty">Nothing saved yet</div>'}</div>
  </div>
  <script>
    function showTab(type) {
      document.getElementById('tabBm').classList.toggle('active', type === 'bm');
      document.getElementById('tabLk').classList.toggle('active', type === 'lk');
      document.querySelectorAll('.row').forEach(row => {
        row.classList.toggle('hidden', !row.classList.contains(type));
      });
    }
    showTab('bm');
  </script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const { data: articles } = await supabase
    .from('articles')
    .select('*')
    .or('bookmarked.eq.true,liked.eq.true')
    .order('published_at', { ascending: false });

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(renderSavedPage(articles || []));
};