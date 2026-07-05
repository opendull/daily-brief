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

function renderPage({ id, title, content, image, category, published_at, liked, bookmarked }) {
  const paragraphs = content.split('\n\n').filter(p => p.length > 0)
    .map(p => `<p>${p}</p>`).join('\n');

  const dateStr = published_at ? new Date(published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const wordCount = content.split(/\s+/).length;
  const readMins = Math.max(1, Math.round(wordCount / 200));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0 24px 100px;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif;
    background: #ffffff;
    color: #1d1d1f;
    -webkit-font-smoothing: antialiased;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1c1c1e; color: #e8e8ed; }
    .meta { color: #8e8e93 !important; }
    .divider { border-color: #38383a !important; }
    .menu-btn { background: rgba(142,142,147,0.2); }
    .dropdown { background: #2c2c2e; }
    .dropdown button:active { background: rgba(255,255,255,0.08); }
  }
  .wrap { max-width: 680px; margin: 0 auto; }
  .category {
    font-size: 13px; font-weight: 600; letter-spacing: 0.03em;
    text-transform: uppercase; color: #ff9f0a; padding-top: 32px;
  }
  h1 { font-size: 28px; line-height: 1.3; font-weight: 700; margin: 10px 0 8px; }
  .meta-row {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 24px;
  }
  .meta { font-size: 14px; color: #86868b; }
  .icons { display: flex; gap: 18px; }
  .icon-btn {
    background: none; border: none; padding: 0; cursor: pointer;
    display: flex; align-items: center; -webkit-tap-highlight-color: transparent;
  }
  .icon-btn svg { width: 24px; height: 24px; transition: transform 0.15s ease; }
  .icon-btn.active svg { transform: scale(1.1); }
  img.hero { width: 100%; border-radius: 10px; margin-bottom: 28px; }
  .divider { border: none; border-top: 1px solid #e5e5ea; margin: 0 0 28px; }
  p { font-size: 18px; line-height: 1.7; margin: 0 0 22px; transition: font-size 0.15s ease; }

  .menu-btn {
    position: fixed; top: 20px; right: 20px;
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(142,142,147,0.12); border: none;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; z-index: 10; -webkit-tap-highlight-color: transparent;
  }
  .menu-btn svg { width: 20px; height: 20px; }
  .dropdown {
    position: fixed; top: 62px; right: 20px;
    background: #ffffff; border-radius: 14px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.15);
    padding: 6px; display: none; z-index: 10;
    min-width: 180px;
  }
  .dropdown.open { display: block; }
  .dropdown button {
    display: flex; align-items: center; gap: 10px;
    width: 100%; border: none; background: none;
    padding: 12px 14px; font-size: 15px; text-align: left;
    border-radius: 10px; cursor: pointer; color: #1d1d1f;
  }
  .dropdown button:active { background: rgba(0,0,0,0.06); }
</style>
</head>
<body>
  <button class="menu-btn" onclick="toggleMenu()">
    <svg viewBox="0 0 24 24" fill="none" stroke="#86868b" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="5" r="1.2"/>
      <circle cx="12" cy="12" r="1.2"/>
      <circle cx="12" cy="19" r="1.2"/>
    </svg>
  </button>
  <div class="dropdown" id="dropdown">
    <button onclick="changeFont(2)">Aa  Increase text size</button>
    <button onclick="changeFont(-2)">Aa  Decrease text size</button>
  </div>

  <div class="wrap">
    <div class="category">${category || 'Article'}</div>
    <h1>${title}</h1>
    <div class="meta-row">
      <div class="meta">${dateStr} · ${readMins} min read</div>
      <div class="icons">
        <button class="icon-btn ${bookmarked ? 'active' : ''}" id="bookmarkBtn" onclick="toggleBookmark()">
          <svg id="bookmarkIcon" viewBox="0 0 24 24" fill="${bookmarked ? '#0A84FF' : 'none'}" stroke="${bookmarked ? '#0A84FF' : '#86868b'}" stroke-width="2">
            <path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>
          </svg>
        </button>
        <button class="icon-btn ${liked ? 'active' : ''}" id="likeBtn" onclick="toggleLike()">
          <svg id="likeIcon" viewBox="0 0 24 24" fill="${liked ? '#F91880' : 'none'}" stroke="${liked ? '#F91880' : '#86868b'}" stroke-width="2">
            <path d="M12 20.3c-.3 0-.6-.1-.8-.3C7.8 17 3 12.9 3 8.8 3 5.9 5.2 3.7 8 3.7c1.6 0 3 .7 4 1.9 1-1.2 2.4-1.9 4-1.9 2.8 0 5 2.2 5 5.1 0 4.1-4.8 8.2-8.2 11.2-.2.2-.5.3-.8.3z"/>
          </svg>
        </button>
      </div>
    </div>
        ${image ? `<img class="hero" src="/api/image-proxy?url=${encodeURIComponent(image)}" alt="" onerror="this.style.display='none'">` : ''}
    <hr class="divider">
    <div id="content">
      ${paragraphs}
    </div>
  </div>

  <script>
    const articleId = "${id}";
    let fontSize = 18;

    function toggleMenu() {
      document.getElementById('dropdown').classList.toggle('open');
    }

    document.addEventListener('click', function(e) {
      const dropdown = document.getElementById('dropdown');
      const menuBtn = document.querySelector('.menu-btn');
      if (!dropdown.contains(e.target) && !menuBtn.contains(e.target)) {
        dropdown.classList.remove('open');
      }
    });

    function changeFont(delta) {
      fontSize = Math.max(14, Math.min(26, fontSize + delta));
      document.querySelectorAll('#content p').forEach(p => p.style.fontSize = fontSize + 'px');
      document.getElementById('dropdown').classList.remove('open');
    }

async function toggleBookmark() {
      const icon = document.getElementById('bookmarkIcon');
      const btn = document.getElementById('bookmarkBtn');
      const wasActive = btn.classList.contains('active');
      const willBeActive = !wasActive;

      // update instantly
      if (willBeActive) {
        icon.setAttribute('fill', '#0A84FF');
        icon.setAttribute('stroke', '#0A84FF');
        btn.classList.add('active');
      } else {
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', '#86868b');
        btn.classList.remove('active');
      }

      try {
        const res = await fetch('/api/bookmark/' + articleId, { method: 'POST' });
        const data = await res.json();
        // correct state in case server disagrees
        if (data.bookmarked !== willBeActive) {
          if (data.bookmarked) {
            icon.setAttribute('fill', '#0A84FF'); icon.setAttribute('stroke', '#0A84FF'); btn.classList.add('active');
          } else {
            icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', '#86868b'); btn.classList.remove('active');
          }
        }
      } catch (err) {
        // revert on failure
        if (wasActive) {
          icon.setAttribute('fill', '#0A84FF'); icon.setAttribute('stroke', '#0A84FF'); btn.classList.add('active');
        } else {
          icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', '#86868b'); btn.classList.remove('active');
        }
      }
    }

    async function toggleLike() {
      const icon = document.getElementById('likeIcon');
      const btn = document.getElementById('likeBtn');
      const wasActive = btn.classList.contains('active');
      const willBeActive = !wasActive;

      if (willBeActive) {
        icon.setAttribute('fill', '#F91880');
        icon.setAttribute('stroke', '#F91880');
        btn.classList.add('active');
      } else {
        icon.setAttribute('fill', 'none');
        icon.setAttribute('stroke', '#86868b');
        btn.classList.remove('active');
      }

      try {
        const res = await fetch('/api/like/' + articleId, { method: 'POST' });
        const data = await res.json();
        if (data.liked !== willBeActive) {
          if (data.liked) {
            icon.setAttribute('fill', '#F91880'); icon.setAttribute('stroke', '#F91880'); btn.classList.add('active');
          } else {
            icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', '#86868b'); btn.classList.remove('active');
          }
        }
      } catch (err) {
        if (wasActive) {
          icon.setAttribute('fill', '#F91880'); icon.setAttribute('stroke', '#F91880'); btn.classList.add('active');
        } else {
          icon.setAttribute('fill', 'none'); icon.setAttribute('stroke', '#86868b'); btn.classList.remove('active');
        }
      }
    }
  </script>
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
  res.status(200).send(renderPage({ ...article, id, content }));
};