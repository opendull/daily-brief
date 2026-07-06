const express = require('express');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');
const nodemailer = require('nodemailer');
require('dotenv').config();
const supabase = require('../lib/supabase');

const app = express();
const PORT = 3000;
const SITE_URL = process.env.SITE_URL || 'https://daily-brief-smoky.vercel.app';

app.use(express.json());

const transporter = nodemailer.createTransport({
  host: "smtp.mailersend.net",
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const RSS_FEEDS = {
  "Current Events": [
    "https://www.hindustantimes.com/feeds/rss/india-news/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/latest/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/top-news/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/trending/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/editors-pick/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/analysis/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/opinion/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/ht-insight/rssfeed.xml"
  ],
  "Polity & Governance": [
    "https://www.hindustantimes.com/feeds/rss/ht-insight/governance/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/editorials/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/elections/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/elections/lok-sabha/rssfeed.xml"
  ],
  "Economics & Social Development": [
    "https://www.hindustantimes.com/feeds/rss/business/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/ht-insight/economy/rssfeed.xml"
  ],
  "Environment & Ecology": [
    "https://www.hindustantimes.com/feeds/rss/environment/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/ht-insight/climate-change/rssfeed.xml"
  ],
  "History, Art & Culture": [
    "https://www.hindustantimes.com/feeds/rss/lifestyle/art-culture/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/books/rssfeed.xml"
  ],
  "Geography": [
    "https://www.hindustantimes.com/feeds/rss/lifestyle/travel/rssfeed.xml"
  ],
  "General Science & Technology": [
    "https://www.hindustantimes.com/feeds/rss/technology/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/science/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/lifestyle/health/rssfeed.xml",
    "https://www.hindustantimes.com/feeds/rss/ht-insight/future-tech/rssfeed.xml"
  ]
};

async function fetchRSS(url) {
  try {
    const res = await axios.get(url, { timeout: 12000 });
    const parser = new XMLParser({ ignoreAttributes: false });
    const data = parser.parse(res.data);
    let items = data.rss?.channel?.item || [];
    return Array.isArray(items) ? items : [items];
  } catch (e) {
    console.error(`Failed to fetch: ${url}`);
    return [];
  }
}

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_KEY);

async function generateEmbedding(text) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
    const result = await model.embedContent({
      content: { parts: [{ text: text.trim() }] },
      taskType: "RETRIEVAL_DOCUMENT",
      outputDimensionality: 768
    });
    return result.embedding.values || null;
  } catch (e) {
    console.error('Embedding generation failed:', e.message);
    return null;
  }
}

async function upsertArticle(item, category, feedUrl) {
  const title = item.title || "Untitled";
  const link = item.link || "";
  const description = item.description ? item.description.replace(/<[^>]+>/g, '').substring(0, 300) : "";
  const image = item['media:content']?.['@_url'] || item.enclosure?.url || '';

  const { data, error } = await supabase
    .from('articles')
    .upsert({
      title,
      link,
      description,
      image_url: image,
      category,
      source_feed: feedUrl,
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
    }, { onConflict: 'link' })
    .select('id')
    .single();

  if (error) {
    console.error("Supabase upsert error:", error.message);
    return null;
  }

  // Generate embedding for new articles
  const embeddingInput = `${title}. ${description}. Category: ${category}`;
  const embedding = await generateEmbedding(embeddingInput);

  if (embedding) {
    await supabase
      .from('article_embeddings')
      .upsert({
        article_id: data.id,
        embedding_input: embeddingInput,
        content_vec: embedding
      }, { onConflict: 'article_id' });

    await supabase
      .from('articles')
      .update({ content_vec: embedding })
      .eq('id', data.id);
  }

  return data.id;
}

app.post('/sendDailyBrief', async (req, res) => {
  console.log("📨 POST /sendDailyBrief called");

  // Check bootstrap status
  const { data: profile } = await supabase
    .from('user_profile')
    .select('personal_vec, bootstrap_complete')
    .eq('id', 1)
    .single();

  // Ingest RSS
  for (const [category, feeds] of Object.entries(RSS_FEEDS)) {
    for (const feedUrl of feeds) {
      const items = await fetchRSS(feedUrl);
      for (const item of items.slice(0, 5)) {
        await upsertArticle(item, category, feedUrl);
      }
    }
  }

  // Get candidate articles
  let candidateArticles = [];
  if (!profile?.bootstrap_complete) {
    // BOOTSTRAP: send everything
    const { data } = await supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(50);
    candidateArticles = data || [];
  } else {
    // PERSONALIZED: use similarity filtering
    const { data } = await supabase.rpc('get_relevant_articles', {
      threshold: 0.5,
      max_results: 30
    });
    candidateArticles = data || [];

    // Epsilon-greedy: 15% chance to add wildcard
    if (Math.random() < 0.15 && candidateArticles.length > 0) {
      const ids = candidateArticles.map(a => `'${a.id}'`).join(',');
      const { data: wildcard } = await supabase
        .from('articles')
        .select('*')
        .not('id', 'in', `(${ids})`)
        .order('published_at', { ascending: false })
        .limit(1);
      if (wildcard?.length) {
        candidateArticles.push(wildcard[0]);
      }
    }
  }

  // Build email
  let html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 100%; margin: 0; background: #f5f5f7; padding: 20px 0;">
  `;

  const groupedByCategory = {};
  candidateArticles.forEach(a => {
    if (!groupedByCategory[a.category]) groupedByCategory[a.category] = [];
    groupedByCategory[a.category].push(a);
  });

  for (const [category, articles] of Object.entries(groupedByCategory)) {
    html += `
      <div style="background: white; margin: 15px; border-radius: 18px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06);">
        <div style="background: #1d1d1f; color: white; padding: 20px; font-size: 21px; font-weight: 700; text-align: center;">
          ${category}
        </div>
        <div style="padding: 20px;">
    `;

    articles.forEach(article => {
      const readUrl = `${SITE_URL}/api/article/${article.id}`;
      html += `
        <div style="margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
          ${article.image_url ? `<a href="${readUrl}" style="text-decoration: none;"><img src="/api/image-proxy?url=${encodeURIComponent(article.image_url)}" style="width: 100%; height: auto; border-radius: 12px; margin-bottom: 14px;" alt="" onerror="this.style.display='none'"></a>` : ''}
          <a href="${readUrl}" style="text-decoration: none; color: #1d1d1f;">
            <h3 style="margin: 0 0 10px 0; font-size: 18px; line-height: 1.4; font-weight: 700;">${article.title}</h3>
          </a>
          <p style="margin: 0 0 12px 0; color: #555; font-size: 15.5px; line-height: 1.5;">${article.description}</p>
          <a href="${readUrl}" style="color: #0071e3; font-size: 14.5px; font-weight: 600;">Read full article →</a>
        </div>`;
    });

    html += `</div></div>`;
  }

  html += `</div>`;

  try {
    await transporter.sendMail({
      from: `"The Brief" <${process.env.SMTP_USER}>`,
      to: "bastionbrief@proton.me",
      subject: `The Brief • ${new Date().toLocaleDateString('en-IN')}`,
      html: html
    });

    res.status(200).json({ success: true, message: "Daily Brief sent successfully!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Running locally on ${PORT}`));
}

module.exports = app;