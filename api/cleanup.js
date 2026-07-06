require('dotenv').config();
const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: oldArticles } = await supabase
      .from('articles')
      .select('id')
      .lt('created_at', thirtyDaysAgo)
      .eq('liked', false)
      .eq('bookmarked', false)
      .is('opened_at', null);

    if (oldArticles?.length > 0) {
      const ids = oldArticles.map(a => a.id);
      await supabase.from('article_embeddings').delete().in('article_id', ids);
    }

    res.status(200).json({ success: true, deleted: oldArticles?.length || 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};