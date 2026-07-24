require('dotenv').config();
const supabase = require('../lib/supabase');

function normalize(v) {
  const mag = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
  return mag === 0 ? v : v.map(x => x / mag);
}

module.exports = async (req, res) => {
  try {
    // Get all vectors for liked articles
    const { data: likedArticles } = await supabase
      .from('articles')
      .select('id')
      .eq('liked', true);

    const { data: bookmarkedArticles } = await supabase
      .from('articles')
      .select('id')
      .eq('bookmarked', true);

    const { data: readArticles } = await supabase
      .from('articles')
      .select('id')
      .not('opened_at', 'is', null);

    // Fetch vectors from article_embeddings
    const likedIds = likedArticles?.map(a => a.id) || [];
    const bookmarkedIds = bookmarkedArticles?.map(a => a.id) || [];
    const readIds = readArticles?.map(a => a.id) || [];

    const { data: likedVecs } = likedIds.length > 0 
      ? await supabase.from('article_embeddings').select('content_vec').in('article_id', likedIds)
      : { data: [] };

    const { data: bookmarkedVecs } = bookmarkedIds.length > 0
      ? await supabase.from('article_embeddings').select('content_vec').in('article_id', bookmarkedIds)
      : { data: [] };

    const { data: readVecs } = readIds.length > 0
      ? await supabase.from('article_embeddings').select('content_vec').in('article_id', readIds)
      : { data: [] };

    // Average vectors
    const avgVec = (vecs) => {
      if (!vecs || vecs.length === 0) return new Array(768).fill(0);
      const vec0 = vecs[0].content_vec;
      const vecLen = Array.isArray(vec0) ? vec0.length : 768;
      const sum = new Array(vecLen).fill(0);
      vecs.forEach(row => {
        const v = Array.isArray(row.content_vec) ? row.content_vec : JSON.parse(row.content_vec);
        v.forEach((val, i) => sum[i] += val);
      });
      return sum.map(x => x / vecs.length);
    };

    const vecLiked = avgVec(likedVecs);
    const vecBookmarked = avgVec(bookmarkedVecs);
    const vecRead = avgVec(readVecs);

    // Weighted blend
    const personal = new Array(768).fill(0);
    for (let i = 0; i < 768; i++) {
      personal[i] = vecLiked[i] * 0.15 + vecBookmarked[i] * 0.10 + vecRead[i] * 0.03;
    }

    // Normalize
    const normalizedVec = normalize(personal);

    // Store
    const { error } = await supabase
      .from('user_profile')
      .update({ personal_vec: normalizedVec, bootstrap_complete: true, bootstrap_completed_at: new Date().toISOString() })
      .eq('id', 1);

    if (error) throw error;
    res.status(200).json({ success: true, message: 'Bootstrap complete, personal_vec calculated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};