require('dotenv').config();
const supabase = require('../../lib/supabase');

module.exports = async (req, res) => {
  const { id } = req.query;

  const { data: article } = await supabase.from('articles').select('bookmarked').eq('id', id).single();
  if (!article) return res.status(404).json({ error: 'Not found' });

  const newVal = !article.bookmarked;
  await supabase.from('articles').update({ bookmarked: newVal }).eq('id', id);

  res.status(200).json({ bookmarked: newVal });
};