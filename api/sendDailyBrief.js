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
  "Polity & Governance": [
    "https://www.hindustantimes.com/feeds/rss/ht-insight/governance/rssfeed.xml"
  ]
  // add more categories/urls here later, logic below doesn't change
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

// Insert or fetch existing row by link, return its id
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
  return data.id;
}

app.post('/sendDailyBrief', async (req, res) => {
  console.log("📨 POST /sendDailyBrief called");

  let html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 100%; margin: 0; background: #f5f5f7; padding: 20px 0;">
  `;

  for (const [category, feeds] of Object.entries(RSS_FEEDS)) {
    html += `
      <div style="background: white; margin: 15px; border-radius: 18px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.06);">
        <div style="background: #1d1d1f; color: white; padding: 20px; font-size: 21px; font-weight: 700; text-align: center;">
          ${category}
        </div>
        <div style="padding: 20px;">
    `;

    let hasContent = false;

    for (const feedUrl of feeds) {
      const items = await fetchRSS(feedUrl);
      const topItems = items.slice(0, 5);

      for (const item of topItems) {
        const articleId = await upsertArticle(item, category, feedUrl);
        if (!articleId) continue;

        hasContent = true;
        const title = item.title || "Untitled";
        const desc = item.description ? item.description.replace(/<[^>]+>/g, '').substring(0, 160) + "..." : "";
        const image = item['media:content']?.['@_url'] || item.enclosure?.url || '';
        const readUrl = `${SITE_URL}/api/article/${articleId}`;

        html += `
          <div style="margin-bottom: 28px; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
            ${image ? `
            <a href="${readUrl}" style="text-decoration: none;">
              <img src="${image}" style="width: 100%; height: auto; border-radius: 12px; margin-bottom: 14px;" alt="">
            </a>` : ''}

            <a href="${readUrl}" style="text-decoration: none; color: #1d1d1f;">
              <h3 style="margin: 0 0 10px 0; font-size: 18px; line-height: 1.4; font-weight: 700;">${title}</h3>
            </a>

            <p style="margin: 0 0 12px 0; color: #555; font-size: 15.5px; line-height: 1.5;">${desc}</p>

            <a href="${readUrl}" style="color: #0071e3; font-size: 14.5px; font-weight: 600;">Read full article →</a>
          </div>`;
      }
    }

    if (!hasContent) {
      html += `<p style="color:#999; font-style:italic;">No articles available at the moment.</p>`;
    }

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