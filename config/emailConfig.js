require('dotenv').config();

module.exports = {
  service: process.env.EMAIL_SERVICE,
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT, 10),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  sender: process.env.EMAIL_SENDER,
  senderName: process.env.EMAIL_SENDER_NAME,
  supportEmail: process.env.SUPPORT_EMAIL,
  otpExpiry: parseInt(process.env.OTP_EXPIRY, 10),
  accountVerificationExpiry: parseInt(process.env.ACCOUNT_VERIFICATION_EXPIRY, 10),
};