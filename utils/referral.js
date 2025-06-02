const User = require('../models/userSchema')


async function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const existingUser = await User.findOne({ referralCode: code });
  if (existingUser) return generateReferralCode(); // Retry if code exists
  return code;
}

module.exports = { generateReferralCode };