const nodemailer = require('nodemailer');
require('dotenv').config();
const supabase = require('../lib/supabase');

const SITE_URL = process.env.SITE_URL || 'https://daily-brief-smoky.vercel.app';

const transporter = nodemailer.createTransport({
  host: "smtp.mailersend.net",
  port: 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

module.exports = async (req, res) => {
  const { data: articles } = await supabase
    .from('articles')
    .select('*')
    .or('bookmarked.eq.true,liked.eq.true');

  const count = articles ? articles.length : 0;

  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px; text-align: center;">
      <div style="font-size: 22px; font-weight: 700; margin-bottom: 12px;">Your Saved Articles</div>
      <p style="font-size: 15px; color: #555; line-height: 1.6; margin-bottom: 28px;">
        You have ${count} saved article${count === 1 ? '' : 's'} this week — bookmarked and liked, in one place.
      </p>
      <a href="${SITE_URL}/api/saved" style="display:inline-block; background:#1d1d1f; color:white; text-decoration:none; padding:14px 28px; border-radius:12px; font-weight:600; font-size:15px;">
        Open Saved
      </a>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"The Brief" <${process.env.SMTP_USER}>`,
      to: "bastionbrief@proton.me",
      subject: `Your Saved Articles — ${new Date().toLocaleDateString('en-IN')}`,
      html
    });
    res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};