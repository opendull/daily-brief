require('dotenv').config();
const supabase = require('../lib/supabase');

module.exports = async (req, res) => {
  try {
    const { error } = await supabase.rpc('calculate_personal_vec');
    if (error) throw error;

    res.status(200).json({ success: true, message: 'Bootstrap complete, personal_vec calculated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
};