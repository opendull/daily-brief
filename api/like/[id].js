require('dotenv').config();
const supabase = require('../../lib/supabase');

module.exports = async (req, res) => {
  const { id } = req.query;

  const { data: article } = await supabase.from('articles').select('liked').eq('id', id).single();
  if (!article) return res.status(404).json({ error: 'Not found' });

  const newVal = !article.liked;
  await supabase.from('articles').update({ liked: newVal }).eq('id', id);

  res.status(200).json({ liked: newVal });
};