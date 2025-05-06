module.exports = {
    service: process.env.EMAIL_SERVICE,
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    sender: process.env.EMAIL_SENDER,
    senderName: process.env.EMAIL_SENDER_NAME,
    otpExpiry: parseInt(process.env.OTP_EXPIRY),
    accountVerificationExpiry: parseInt(process.env.ACCOUNT_VERIFICATION_EXPIRY),
    supportEmail: process.env.SUPPORT_EMAIL,
    systemName: process.env.SYSTEM_NAME
};