require('dotenv').config();
const supabase = require('../lib/supabase');

function dotProduct(a, b) {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

function magnitude(v) {
  return Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
}

function normalize(v) {
  const mag = magnitude(v);
  return mag === 0 ? v : v.map(x => x / mag);
}

module.exports = async (req, res) => {
  try {
    // Fetch all liked, bookmarked, and read article vectors
    const { data: liked } = await supabase
      .from('article_embeddings')
      .select('content_vec')
      .in('article_id', (await supabase.from('articles').select('id').eq('liked', true)).data.map(a => a.id));

    const { data: bookmarked } = await supabase
      .from('article_embeddings')
      .select('content_vec')
      .in('article_id', (await supabase.from('articles').select('id').eq('bookmarked', true)).data.map(a => a.id));

    const { data: read } = await supabase
      .from('article_embeddings')
      .select('content_vec')
      .in('article_id', (await supabase.from('articles').select('id').not('opened_at', 'is', null)).data.map(a => a.id));

    // Average each group
    const avgVec = (vecs) => {
      if (!vecs || vecs.length === 0) return new Array(768).fill(0);
      const sum = new Array(768).fill(0);
      vecs.forEach(v => v.forEach((val, i) => sum[i] += val));
      return sum.map(x => x / vecs.length);
    };

    const vecLiked = avgVec(liked?.map(r => r.content_vec));
    const vecBookmarked = avgVec(bookmarked?.map(r => r.content_vec));
    const vecRead = avgVec(read?.map(r => r.content_vec));

    // Weighted combination
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
    res.status(200).json({ success: true, message: 'Bootstrap complete' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};