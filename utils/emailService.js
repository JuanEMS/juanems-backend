const nodemailer = require('nodemailer');
const otpGenerator = require('otp-generator');
const config = require('../config/emailConfig');
const User = require('../models/EnrolleeApplicant'); // Your user model


// Create transporter
const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
        user: config.auth.user,
        pass: config.auth.pass
    }
});

const generateOTP = () => {
  return otpGenerator.generate(6, {
    digits: true,
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false
  });
};

function generateRandomPassword() {
  const length = 12;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()";
  let password = "";
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  
  return password;
}

const sendOTP = async (email, name, otp, type = 'verification') => {
  try {
    let subject, text, html;

    if (type === 'login') {
      subject = 'JuanEMS: Login Verification Code';
      text = `Dear ${name},\n\nYour login verification code is: ${otp}\n\nThis code is valid for 3 minutes. Please enter it to complete your login.\n\nIf you didn't request this login, please secure your account immediately.\n\nBest regards,\nJuanEMS Administration`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #2A67D5; padding: 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0;">JuanEMS</h1>
            <p style="color: #ecf0f1; margin: 5px 0 0;">Login Verification</p>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #2A67D5;">Login Verification Code</h2>
            <p>Dear ${name},</p>
            <p>Here is your login verification code:</p>
            <p style="font-size: 24px; font-weight: bold; text-align: center; margin: 25px 0; letter-spacing: 2px; color: #2A67D5;">${otp}</p>
            <p>This code is valid for <strong>3 minutes</strong>.</p>
            <p style="color: #e74c3c; font-style: italic;">If you didn't request this login, please secure your account immediately.</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p>Best regards,</p>
            <p><strong>JuanEMS Administration</strong></p>
          </div>
          <div style="background-color: #C68A00; padding: 15px; text-align: center; font-size: 12px; color: #f5f5f5;">
            <p>© ${new Date().getFullYear()} Juan Enrollment Management System. All rights reserved.</p>
          </div>
        </div>
      `;
    } else {
      // Default verification email (registration)
      subject = 'JuanEMS: Account Verification Code';
      text = `Dear ${name},\n\nThank you for registering with Juan Enrollment Management System (JuanEMS).\n\nYour verification code is: ${otp}\n\nThis code is valid for 3 minutes only. Please do not share this code with anyone.\n\nIf you did not request this verification, please ignore this email or contact our support team.\n\nBest regards,\nJuanEMS Administration`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #2A67D5; padding: 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0;">JuanEMS</h1>
            <p style="color: #ecf0f1; margin: 5px 0 0;">Enrollment Management System</p>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #2A67D5;">Account Verification</h2>
            <p>Dear ${name},</p>
            <p>Thank you for registering with Juan Enrollment Management System (JuanEMS).</p>
            <p style="font-size: 24px; font-weight: bold; text-align: center; margin: 25px 0; letter-spacing: 2px; color: #2A67D5;">${otp}</p>
            <p>This verification code is valid for <strong>3 minutes</strong>.</p>
            <p style="color: #e74c3c; font-style: italic;">For your security, please do not share this code with anyone.</p>
            <p>If you did not request this verification, please ignore this email or contact our support team immediately.</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p>Best regards,</p>
            <p><strong>JuanEMS Administration</strong></p>
          </div>
          <div style="background-color: #C68A00; padding: 15px; text-align: center; font-size: 12px; color: #f5f5f5;">
            <p>© ${new Date().getFullYear()} Juan Enrollment Management System. All rights reserved.</p>
          </div>
        </div>
      `;
    }

    const mailOptions = {
      from: `${config.senderName} <${config.sender}>`,
      to: email,
      subject,
      text,
      html
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw error;
  }
};

// Verify OTP
const verifyOTP = async (email, otp) => {
  try {
      const user = await EnrolleeApplicant.findOne({ email });
      
      if (!user) {
          throw new Error('User not found');
      }

      // Check if user is in lockout period
      if (user.otpAttemptLockout && user.otpAttemptLockout > new Date()) {
          const minutesLeft = Math.ceil((user.otpAttemptLockout - new Date()) / (1000 * 60));
          throw new Error(`Too many attempts. Please try again in ${minutesLeft} minute(s).`);
      }

      // Check if OTP is expired
      if (user.otpExpires < new Date()) {
          throw new Error('OTP has expired');
      }

      // Verify OTP
      if (user.otp !== otp) {
          // Increment attempt counter
          user.otpAttempts += 1;
          user.lastOtpAttempt = new Date();
          
          // Check if we need to lock the account
          if (user.otpAttempts >= 3) {
              user.otpAttemptLockout = new Date(Date.now() + 5 * 60 * 1000); // 5 minute lockout
              await user.save();
              throw new Error('Too many incorrect attempts. Please try again in 5 minutes.');
          }
          
          await user.save();
          const attemptsLeft = 3 - user.otpAttempts;
          throw new Error(`Invalid OTP. ${attemptsLeft} attempt(s) left.`);
      }

      // Successful verification - reset attempt counters
      user.otp = undefined;
      user.otpExpires = undefined;
      user.otpAttempts = 0;
      user.otpAttemptLockout = undefined;
      user.lastOtpAttempt = undefined;
      user.status = 'Active';
      await user.save();

      return { success: true, message: 'Account verified successfully' };
  } catch (error) {
      console.error('Error verifying OTP:', error);
      throw error;
  }
};

// Resend OTP
const resendOTP = async (email) => {
  try {
      const user = await EnrolleeApplicant.findOne({ 
          email,
          status: 'Pending Verification'
      });
      
      if (!user) {
          throw new Error('User not found or already verified');
      }

      // Check if user is in lockout period
      if (user.otpAttemptLockout && user.otpAttemptLockout > new Date()) {
          const minutesLeft = Math.ceil((user.otpAttemptLockout - new Date()) / (1000 * 60));
          throw new Error(`Please wait ${minutesLeft} minute(s) before requesting a new OTP.`);
      }

      // Generate new OTP
      const otp = otpGenerator.generate(6, {
          digits: true,
          lowerCaseAlphabets: false,
          upperCaseAlphabets: false,
          specialChars: false
      });

      // Reset attempt counters when resending
      user.otp = otp;
      user.otpExpires = new Date(Date.now() + config.otpExpiry);
      user.otpAttempts = 0;
      user.otpAttemptLockout = undefined;
      user.lastOtpAttempt = undefined;
      await user.save();

      // Send email
      const mailOptions = {
        from: `${config.senderName} <${config.sender}>`,
        to: email,
        subject: 'JuanEMS: New Verification Code',
        text: `Dear ${name},\n\nAs requested, here is your new verification code for Juan Enrollment Management System (JuanEMS):\n\nVerification Code: ${otp}\n\nThis code is valid for 3 minutes only. Please do not share this code with anyone.\n\nIf you did not request this verification, please contact our support team immediately.\n\nBest regards,\nJuanEMS Administration`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
            <div style="background-color: #2A67D5; padding: 20px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0;">JuanEMS</h1>
              <p style="color: #ecf0f1; margin: 5px 0 0;">Enrollment Management System</p>
            </div>
            <div style="padding: 20px;">
              <h2 style="color: #2A67D5;">New Verification Code</h2>
              <p>Dear ${name},</p>
              <p>As requested, here is your new verification code for Juan Enrollment Management System (JuanEMS):</p>
              <p style="font-size: 18px; font-weight: bold; text-align: center; margin: 25px 0; letter-spacing: 2px;">${otp}</p>
              <p>This verification code is valid for <strong>3 minutes</strong> only.</p>
              <p style="color: #e74c3c; font-style: italic;">For your security, please do not share this code with anyone.</p>
              <p>If you did not request this verification, please contact our support team immediately.</p>
              <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
              <p>Best regards,</p>
              <p><strong>JuanEMS Administration</strong></p>
            </div>
          <div style="background-color: #C68A00; padding: 15px; text-align: center; font-size: 12px; color: #f5f5f5;">
            <p>© ${new Date().getFullYear()} Juan Enrollment Management System. All rights reserved.</p>
          </div>
          </div>
        `
      };

      await transporter.sendMail(mailOptions);
      return { success: true, message: 'New OTP sent successfully' };
  } catch (error) {
      console.error('Error resending OTP:', error);
      throw error;
  }
};

const sendPasswordEmail = async (email, name, password) => {
  try {
    const mailOptions = {
      from: `${config.senderName} <${config.sender}>`,
      to: email,
      subject: 'JuanEMS: Your Account Login Credentials',
      text: `Dear ${name},\n\nThank you for verifying your account with Juan Enrollment Management System (JuanEMS).\n\nYour account login credentials are:\n\nEmail: ${email}\nPassword: ${password}\n\nPlease keep this information secure and do not share it with anyone.\n\nYou can now log in to your account using these credentials.\n\nBest regards,\nJuanEMS Administration`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #2A67D5; padding: 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0;">JuanEMS</h1>
            <p style="color: #ecf0f1; margin: 5px 0 0;">Enrollment Management System</p>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #2A67D5;">Your Account Login Credentials</h2>
            <p>Dear ${name},</p>
            <p>Thank you for verifying your account with Juan Enrollment Management System (JuanEMS).</p>
            <p>Here are your login credentials:</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 15px 0;">
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Password:</strong> ${password}</p>
            </div>
            <p>You can now log in to your account using the credentials above.</p>
            <p style="color: #e74c3c; font-style: italic;">For your security, please do not share this information with anyone.</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p>Best regards,</p>
            <p><strong>JuanEMS Administration</strong></p>
          </div>
          <div style="background-color: #C68A00; padding: 15px; text-align: center; font-size: 12px; color: #f5f5f5;">
            <p>© ${new Date().getFullYear()} Juan Enrollment Management System. All rights reserved.</p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Password email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password email:', error);
    throw error;
  }
};

// Check and expire unverified accounts (run this periodically, e.g., daily)
const expireUnverifiedAccounts = async () => {
    try {
        const expiryDate = new Date(Date.now() - config.accountVerificationExpiry);
        
        const result = await User.updateMany(
            { 
                status: 'Pending Verification',
                verificationSentAt: { $lt: expiryDate }
            },
            { 
                status: 'Inactive',
                inactiveReason: 'Verification period expired'
            }
        );

        return { success: true, expiredCount: result.nModified };
    } catch (error) {
        console.error('Error expiring unverified accounts:', error);
        throw error;
    }
};

// In emailService.js, add a new function
const sendPasswordResetEmail = async (email, name, newPassword) => {
  try {
    const mailOptions = {
      from: `${config.senderName} <${config.sender}>`,
      to: email,
      subject: 'JuanEMS: Your New Password',
      text: `Dear ${name},\n\nYour password has been successfully reset.\n\nYour new login credentials are:\n\nEmail: ${email}\nNew Password: ${newPassword}\n\nIf you didn't request this password reset, please contact our support team immediately.\n\nBest regards,\nJuanEMS Administration`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #2A67D5; padding: 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0;">JuanEMS</h1>
            <p style="color: #ecf0f1; margin: 5px 0 0;">Password Reset Notification</p>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #2A67D5;">Your Password Has Been Reset</h2>
            <p>Dear ${name},</p>
            <p>Your password has been successfully reset. Here are your new login credentials:</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 15px 0;">
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>New Password:</strong> ${newPassword}</p>
            </div>
            <p style="color: #e74c3c; font-weight: bold;">For your security, please do not share your credentials with anyone.</p>
            <p>If you didn't request this password reset, please contact our support team immediately.</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p>Best regards,</p>
            <p><strong>JuanEMS Administration</strong></p>
          </div>
          <div style="background-color: #C68A00; padding: 15px; text-align: center; font-size: 12px; color: #f5f5f5;">
            <p>© ${new Date().getFullYear()} Juan Enrollment Management System. All rights reserved.</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw error;
  }
};

const sendAdminPasswordEmail = async (email, name, password) => {
  try {
    const mailOptions = {
      from: `${config.senderName} <${config.sender}>`,
      to: email,
      subject: 'JuanEMS: Your Account Login Credentials',
      text: `Dear ${name},\n\nWe are pleased to welcome you to the Juan Enrollment Management System (JuanEMS).\n\nYour account login credentials are:\n\nEmail: ${email}\nPassword: ${password}\n\nPlease keep this information secure and do not share it with anyone.\n\nYou can now log in to your account using these credentials.\n\nBest regards,\nJuanEMS Administration`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
          <div style="background-color: #2A67D5; padding: 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0;">JuanEMS</h1>
            <p style="color: #ecf0f1; margin: 5px 0 0;">Enrollment Management System</p>
          </div>
          <div style="padding: 20px;">
            <h2 style="color: #2A67D5;">Your Account Login Credentials</h2>
            <p>Dear ${name},</p>
            <p>We are pleased to welcome you to the Juan Enrollment Management System (JuanEMS).</p>
            <p>Here are your login credentials:</p>
            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 15px 0;">
              <p><strong>Email:</strong> ${email}</p>
              <p><strong>Password:</strong> ${password}</p>
            </div>
            <p>Please log in to JuanEMS using the above credentials and complete the verification process to activate your account.</p>
            <p style="color: #e74c3c; font-style: italic;">For your security, please do not share this information with anyone.</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p>Best regards,</p>
            <p><strong>JuanEMS Administration</strong></p>
          </div>
          <div style="background-color: #C68A00; padding: 15px; text-align: center; font-size: 12px; color: #f5f5f5;">
            <p>© ${new Date().getFullYear()} Juan Enrollment Management System. All rights reserved.</p>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Password email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('Error sending password email:', error);
    throw error;
  }
};

module.exports = {
  generateOTP,
  sendOTP,
  verifyOTP,
  resendOTP,
  sendPasswordEmail,  // Add this line if it's not already there
  expireUnverifiedAccounts,
  sendPasswordResetEmail,
  sendAdminPasswordEmail
};