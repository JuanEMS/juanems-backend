const express = require('express');
const router = express.Router();
const Accounts = require('../models/Accounts');
const emailService = require('../utils/emailService');
const { generateOTP, sendOTP } = require('../utils/emailService');
const otpGenerator = require('otp-generator');
const bcrypt = require('bcryptjs');

function generateRandomPassword(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Helper function to check if account is admin staff
function isAdminStaff(role) {
  const adminRoles = [
    'Admissions (Staff)',
    'Registrar (Staff)',
    'Accounting (Staff)',
    'IT (Super Admin)',
    'Administration (Sub-Admin)',
    'Faculty'
  ];
  return adminRoles.includes(role);
}

// CREATE user account
// POST /api/admin/create-account
router.post('/create-account', async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      dob,
      email,
      mobile,
      nationality,
      studentID,
      role,
      status,
      hasCustomAccess,
      customModules
    } = req.body;

    // Generate password in the backend
    const plainPassword = generateRandomPassword();
    
    // Generate or use provided userID
    let userID = req.body.userID;
    if (!userID) {
      userID = await generateUserID(role);
      if (!userID) {
        return res.status(500).json({ message: 'Failed to generate userID' });
      }
    }

    // Create the new user with Active status
    const newUser = new Accounts({
      userID,
      firstName,
      middleName,
      lastName,
      dob,
      email,
      mobile,
      nationality,
      studentID,
      password: plainPassword,
      temporaryPassword: plainPassword,
      role,
      status: 'Pending Verification',
      hasCustomAccess,
      customModules
    });

    await newUser.save();

    // Send credentials email
    try {
      await emailService.sendAdminPasswordEmail(
        email,
        firstName,
        plainPassword,
        studentID
      );

      // After successful email sending, remove the temporary password from the database
      await Accounts.findByIdAndUpdate(
        newUser._id,
        { $unset: { temporaryPassword: "" } }
      );
    } catch (emailError) {
      console.error('Failed to send credentials email:', emailError);
      return res.status(500).json({
        message: 'Account created but failed to send email. Please try to resend credentials.',
        error: emailError.message
      });
    }

    // Return success without the password
    const userResponse = newUser.toObject();
    delete userResponse.password;
    delete userResponse.temporaryPassword;

    return res.status(201).json({
      message: 'Account created successfully. Login credentials have been sent to the email.',
      data: userResponse
    });
  } catch (error) {
    console.error('Error creating account:', error);
    return res.status(500).json({
      message: 'An error occurred while creating the account',
      error: error.message
    });
  }
});

// Update the verify-otp endpoint
// Verify OTP (for admin staff that are in pending verification status)
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        message: 'Email and OTP are required',
        errorType: 'validation'
      });
    }

    const account = await Accounts.findOne({ email }).sort({ createdAt: -1 });

    if (!account) {
      return res.status(404).json({
        message: 'Account not found',
        errorType: 'account_not_found'
      });
    }

    // Check for OTP attempt lockout
    if (account.otpAttemptLockout && account.otpAttemptLockout > new Date()) {
      const timeLeft = Math.ceil((account.otpAttemptLockout - new Date()) / 1000);
      return res.status(403).json({
        message: `Too many OTP attempts. Try again in ${timeLeft} seconds.`,
        errorType: 'otp_lockout',
        lockoutTimeLeft: timeLeft
      });
    }

    // Verify OTP
    if (account.otp === otp && account.otpExpires > new Date()) {
      // OTP is valid
      account.status = 'Active'; // Or whatever status you want after verification
      account.otp = null;
      account.otpExpires = null;
      account.otpAttempts = 0;
      account.otpAttemptLockout = null;
      await account.save();

      return res.json({
        message: 'OTP verification successful',
        email: account.email,
        firstName: account.firstName
      });
    }

    // OTP is invalid
    account.otpAttempts += 1;
    account.lastOtpAttempt = new Date();

    // Implement lockout after 3 failed attempts
    if (account.otpAttempts >= 3) {
      account.otpAttemptLockout = new Date(Date.now() + 15 * 60 * 1000); // 15 minute lockout
      await account.save();

      return res.status(403).json({
        message: 'Too many OTP attempts. Please try again after 15 minutes.',
        errorType: 'otp_lockout',
        lockoutTimeLeft: 900 // 15 minutes in seconds
      });
    }

    await account.save();

    return res.status(401).json({
      message: 'Invalid OTP',
      errorType: 'invalid_otp',
      attemptsLeft: 3 - account.otpAttempts
    });

  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({
      message: 'Server error during OTP verification',
      errorType: 'server_error'
    });
  }
});

router.get('/verification-status/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const account = await Accounts.findOne({
      email
    }).sort({ createdAt: -1 });

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const response = {
      status: account.status,
      firstName: account.firstName,
      createdAt: account.createdAt.toISOString(), // Return as ISO string
      isLockedOut: account.otpAttemptLockout && account.otpAttemptLockout > new Date(),
      lockoutTimeLeft: account.otpAttemptLockout ?
        Math.ceil((account.otpAttemptLockout - new Date()) / 1000) : 0,
      otpTimeLeft: account.otpExpires ?
        Math.ceil((account.otpExpires - new Date()) / 1000) : 0,
      attemptsLeft: 3 - (account.otpAttempts || 0)
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error getting verification status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: 'Email is required',
        errorType: 'validation'
      });
    }

    // Find the account
    const account = await Accounts.findOne({ email });

    if (!account) {
      return res.status(404).json({
        message: 'Account not found',
        errorType: 'account_not_found'
      });
    }

    // Generate a secure random password
    const newPassword = generateRandomPassword();
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the password
    account.password = hashedPassword;
    await account.save();

    // Send email with new password
    try {
      await emailService.sendAdminPasswordEmail(
        account.email,
        account.firstName,
        newPassword,
        account.studentID,
      );

      return res.json({
        message: 'Password reset successful. New password has been sent to your email.',
      });
    } catch (emailError) {
      console.error('Failed to send password email:', emailError);
      return res.status(500).json({
        message: 'Password was reset but failed to send email. Please contact support.',
        errorType: 'email_failed'
      });
    }

  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      message: 'Server error during password reset',
      errorType: 'server_error'
    });
  }
});


router.post('/request-password-reset', async (req, res) => {
  try {
    const { email } = req.body;

    // Check if email exists
    const account = await Accounts.findOne({ email });
    if (!account) {
      return res.status(404).json({ message: 'Email not found' });
    }

    // Generate OTP
    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false
    });

    // In the /request-password-reset route
    account.passwordResetOtp = otp;
    account.passwordResetOtpExpires = new Date(Date.now() + 3 * 60 * 1000); // Changed from 10 to 3 minutes
    await account.save();

    // Send OTP email
    await emailService.sendOTP(email, account.firstName, otp);

    res.json({
      success: true,
      message: 'Verification code sent to your email'
    });
  } catch (error) {
    res.status(500).json({
      message: error.message || 'Failed to process password reset request'
    });
  }
});


router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Find user with passwordResetOtp selected
    const account = await Accounts.findOne({ email })
      .select('+passwordResetOtp +passwordResetOtpExpires +password');

    if (!account) {
      return res.status(404).json({ message: 'Email not found' });
    }

    // Check OTP
    if (!account.passwordResetOtp || account.passwordResetOtp !== otp) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    // Check if OTP expired
    if (account.passwordResetOtpExpires < new Date()) {
      return res.status(400).json({ message: 'Verification code has expired' });
    }

    // Generate new password
    const newPassword = generateRandomPassword();
    console.log('Generated new password:', newPassword); // Debug log

    // Hash the new password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    console.log('Hashed password:', hashedPassword); // Debug log

    // Update password and clear OTP
    account.password = hashedPassword;
    account.passwordResetOtp = undefined;
    account.passwordResetOtpExpires = undefined;
    account.lastPasswordReset = new Date();

    // Save the user
    await account.save();
    console.log('Password updated in database'); // Debug log

    // Send email with the new password
    await emailService.sendPasswordResetEmail(
      email,
      account.firstName,
      newPassword,
      account.studentID
    );

    res.json({
      success: true,
      message: 'Password reset successful. Your new password has been sent to your email.'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({
      message: error.message || 'Failed to reset password'
    });
  }
});


// Resend OTP
router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    // Find the most recent Pending Verification account
    const account = await Accounts.findOne({
      email,
      status: 'Pending Verification'
    }).sort({ createdAt: -1 });

    if (!account) {
      return res.status(404).json({ message: 'Account not found or already verified' });
    }

    // Check if user is in lockout period
    if (account.otpAttemptLockout && account.otpAttemptLockout > new Date()) {
      const minutesLeft = Math.ceil((account.otpAttemptLockout - new Date()) / (1000 * 60));
      return res.status(429).json({
        message: `Please wait ${minutesLeft} minute(s) before requesting a new OTP.`,
        lockout: true
      });
    }

    // Generate new OTP
    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false
    });

    // Update OTP and reset attempt counters
    account.otp = otp;
    account.otpExpires = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes
    account.otpAttempts = 0;
    account.otpAttemptLockout = undefined;
    account.lastOtpAttempt = undefined;
    await account.save();

    // Send OTP email
    await sendOTP(email, account.firstName, otp);

    return res.status(200).json({
      message: 'New verification code sent to your email',
      expiresIn: 180 // 3 minutes in seconds
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({ message: 'Server error while resending OTP' });
  }
});


// Add this new route to get password reset status
router.get('/password-reset-status/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const account = await Accounts.findOne({ email });

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const response = {
      status: account.status,
      firstName: account.firstName,
      isLockedOut: false, // No lockout for password reset (or implement if needed)
      lockoutTimeLeft: 0,
      otpTimeLeft: account.passwordResetOtpExpires
        ? Math.ceil((account.passwordResetOtpExpires - new Date()) / 1000)
        : 0,
      attemptsLeft: 3 // Reset attempts for password reset
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error getting password reset status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


const jwt = require('jsonwebtoken');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
        errorType: 'validation'
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    // Find the account
    const account = await Accounts.findOne({
      email: cleanEmail
    }).sort({ createdAt: -1 }).select('+password');

    if (!account) {
      console.log(`Login attempt for non-existent email: ${cleanEmail}`);
      return res.status(404).json({
        message: 'The email or password is incorrect.',
        errorType: 'account_not_found'
      });
    }

    // Check if this is an admin staff account
    const isAdminAccount = isAdminStaff(account.role);

    // For non-admin accounts, reject immediately
    if (!isAdminAccount) {
      console.log(`Non-admin login attempt by ${cleanEmail} (Role: ${account.role})`);
      return res.status(403).json({
        message: 'Access restricted to admin staff only',
        errorType: 'access_denied'
      });
    }

    // Handle pending verification for admin accounts
    if (account.status === 'Pending Verification') {
      // Check if there's a valid existing OTP
      if (account.isOtpValid()) {
        return res.status(403).json({
          message: 'Verification OTP already sent. Please check your email.',
          errorType: 'pending_verification',
          email: account.email,
          firstName: account.firstName,
          otpSent: false // Indicates we didn't send a new one
        });
      }

      // Generate new OTP
      const otp = generateOTP();
      const otpExpires = new Date(Date.now() + 3 * 60 * 1000); // 3 minutes
      
      console.log(`Generated OTP for ${cleanEmail}: ${otp}`);
      console.log(`OTP expires at: ${otpExpires}`);
      
      account.otp = otp;
      account.otpExpires = otpExpires;
      account.otpAttempts = 0; // Reset attempts when generating new OTP
      account.otpAttemptLockout = null; // Clear any existing lockout
      await account.save();
      
      try {
        console.log(`Attempting to send OTP to ${cleanEmail}...`);
        await sendOTP(account.email, account.firstName, otp);
        console.log(`OTP successfully sent to ${cleanEmail}`);
        
        return res.status(403).json({
          message: 'Admin account requires verification. A verification code has been sent to your email.',
          errorType: 'pending_verification',
          email: account.email,
          firstName: account.firstName,
          otpSent: true
        });
      } catch (emailError) {
        console.error(`Failed to send OTP email to ${cleanEmail}:`, emailError);
        return res.status(500).json({
          message: 'Failed to send verification code. Please try again later.',
          errorType: 'email_failure'
        });
      }
    }

    // For inactive admin accounts
    if (account.status === 'Inactive') {
      console.log(`Login attempt for inactive admin account: ${cleanEmail}`);
      return res.status(403).json({
        message: 'Admin account is inactive. Please contact system administrator.',
        errorType: 'account_inactive'
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(cleanPassword, account.password);

    if (!isMatch) {
      // Track failed attempt
      account.loginAttempts += 1;
      await account.save();
      console.log(`Failed login attempt for ${cleanEmail}. Attempt ${account.loginAttempts}`);
      
      return res.status(401).json({
        message: 'Invalid credentials',
        errorType: 'authentication'
      });
    }

    // Generate JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'sjdefi-admin-secret-key-2024';
    const token = jwt.sign(
      {
        id: account._id,
        email: account.email,
        role: account.role
      },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Successful login
    account.activityStatus = 'Online';
    account.lastLogin = new Date();
    account.loginAttempts = 0; // Reset on successful login
    await account.save();
    console.log(`Successful login for admin ${cleanEmail}`);

    res.json({
      message: 'Admin login successful',
      token: token, // Add JWT token
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName, 
      role: account.role,
      userID: account.userID,
      activityStatus: account.activityStatus,
      isAdminStaff: true,
      _id: account._id
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({
      message: 'Server error during admin login',
      errorType: 'server_error'
    });
  }
});


router.post('/logout', async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({
        message: 'MongoDB ID is required',
        errorType: 'validation'
      });
    }
    
    // Find account by MongoDB _id directly
    const account = await Accounts.findById(id);
    
    if (!account) {
      return res.status(404).json({
        message: 'Account not found',
        errorType: 'account_not_found'
      });
    }
    
    // Update activity status
    account.activityStatus = 'Offline';
    account.lastLogout = new Date();
    await account.save();
    
    res.json({
      message: 'Logout successful',
      activityStatus: account.activityStatus
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      message: 'Server error during logout',
      errorType: 'server_error'
    });
  }
});


router.get('/activity/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const { createdAt } = req.query;
    const cleanEmail = email.trim().toLowerCase();

    let query = {
      email: cleanEmail,
      status: 'Active'
    };

    // If createdAt is provided, parse it properly
    if (createdAt) {
      const date = new Date(createdAt);
      if (isNaN(date.getTime())) {
        return res.status(400).json({
          message: 'Invalid createdAt timestamp',
          errorType: 'validation'
        });
      }
      query.createdAt = date;
    }

    const account = await Accounts.findOne(query)
      .sort({ createdAt: -1 });

    if (!account) {
      return res.status(404).json({
        message: 'Active account not found',
        errorType: 'account_not_found'
      });
    }

    res.json({
      activityStatus: account.activityStatus,
      loginAttempts: account.loginAttempts,
      lastLogin: account.lastLogin,
      lastLogout: account.lastLogout,
      accountCreatedAt: account.createdAt
    });

  } catch (error) {
    console.error('Activity fetch error:', error);
    res.status(500).json({
      message: 'Server error while fetching activity data',
      errorType: 'server_error'
    });
  }
});


// GET /api/admin/accounts?archived=true or false
router.get('/accounts', async (req, res) => {
  try {
    const { archived } = req.query;

    let filter = {};
    if (archived === 'true') {
      filter.isArchived = true;
    } else if (archived === 'false') {
      filter.isArchived = false;
    }

    const accounts = await Accounts.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ data: accounts });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ message: 'Server error fetching accounts.' });
  }
});

// GET single account by ID
// GET /api/admin/accounts/:id
router.get('/accounts/:id', async (req, res) => {
  try {
    const account = await Accounts.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ message: 'Account not found.' });
    }
    res.status(200).json({ data: account });
  } catch (error) {
    console.error('Get account error:', error);
    res.status(500).json({ message: 'Server error retrieving account.' });
  }
});

// UPDATE account details
// PUT /api/admin/accounts/:id
router.put('/accounts/:id', async (req, res) => {
  try {
    const updates = req.body;
    const { userID, email, mobile } = updates;

    // Check if the account exists first
    const existingAccount = await Accounts.findById(req.params.id);
    if (!existingAccount) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    // Check if the userID, email, or mobile already exists in another account
    if (userID && userID !== existingAccount.userID) {
      const userIDExists = await Accounts.findOne({ userID });
      if (userIDExists && userIDExists._id.toString() !== req.params.id) {
        return res.status(409).json({ message: 'User ID already exists.' });
      }
    }

    if (email && email !== existingAccount.email) {
      const emailExists = await Accounts.findOne({ email });
      if (emailExists && emailExists._id.toString() !== req.params.id) {
        return res.status(409).json({ message: 'Email already exists.' });
      }
    }

    if (mobile && mobile !== existingAccount.mobile) {
      const mobileExists = await Accounts.findOne({ mobile });
      if (mobileExists && mobileExists._id.toString() !== req.params.id) {
        return res.status(409).json({ message: 'Mobile number already exists.' });
      }
    }

    // Important: Do not allow password to be updated via normal update
    // Remove password from the updates object
    delete updates.password;
    delete updates.temporaryPassword;

    // Update the account
    const updatedAccount = await Accounts.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      message: 'Account updated successfully.',
      data: updatedAccount
    });
  } catch (error) {
    console.error('Update account error:', error);
    res.status(500).json({ message: 'Server error updating account.' });
  }
});

// Check if email or mobile already exists
router.post('/check-availability', async (req, res) => {
  try {
    const { email, mobile, excludeId } = req.body;
    const query = {};

    if (email) {
      query.email = email;
    }
    if (mobile) {
      query.mobile = mobile;
    }

    // Exclude the current account if excludeId is provided (for updates)
    if (excludeId) {
      query._id = { $ne: excludeId };
    }

    // Check if email or mobile exists in the database
    const existingAccount = await Accounts.findOne(query);

    // Check status if account exists
    let emailInUse = false;
    let mobileInUse = false;
    let message = '';

    if (existingAccount) {
      if (email && existingAccount.email === email) {
        emailInUse = existingAccount.status !== 'Inactive';
        if (emailInUse) {
          message = 'Email is already in use by another account.';
        }
      }
      if (mobile && existingAccount.mobile === mobile) {
        mobileInUse = existingAccount.status !== 'Inactive';
        if (mobileInUse) {
          message = message ? 
            `${message} Mobile number is already in use by another account.` : 
            'Mobile number is already in use by another account.';
        }
      }
    }

    return res.json({
      emailInUse,
      mobileInUse,
      message: message || ''
    });
  } catch (err) {
    console.error('Error checking availability:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/admin/generate-userid
router.post('/generate-userid', async (req, res) => {
  try {
    const { role } = req.body;
    const currentYearShort = new Date().getFullYear().toString().slice(-2); // e.g., "25" for 2025

    const roleAbbreviations = {
      'Admissions (Staff)': 'EMP',
      'Registrar (Staff)': 'EMP',
      'Accounting (Staff)': 'EMP',
      'IT (Super Admin)': 'EMP',
      'Administration (Sub-Admin)': 'EMP',
      'Faculty': 'EMP',
      'Student': 'STD',
      // Add other roles if needed
    };

    const roleAbbr = roleAbbreviations[role] || 'USR'; // Default to 'USR' if role not found

    // Find the latest account for the specific role
    const latestAccount = await Accounts.findOne({ userID: new RegExp(`^${roleAbbr}-${currentYearShort}-`) })
      .sort({ createdAt: -1 })
      .lean();

    let newNumber = 1; // Default starting number

    if (latestAccount) {
      const lastID = latestAccount.userID.split('-')[2]; // "00001"
      newNumber = parseInt(lastID, 10) + 1;
    }

    // Pad the number with zeros
    const paddedNumber = newNumber.toString().padStart(5, '0');

    const newUserID = `${roleAbbr}-${currentYearShort}-${paddedNumber}`;

    return res.status(200).json({ userID: newUserID });
  } catch (error) {
    console.error('Error generating userID:', error);
    return res.status(500).json({ message: 'Error generating userID', error: error.message });
  }
});

// Archive/Unarchive account
router.patch('/archive/:id', async (req, res) => {
  try {
    const { isArchived } = req.body; // Get the desired archive state from request body
    
    const account = await Accounts.findByIdAndUpdate(
      req.params.id,
      { isArchived },
      { new: true }
    );
    
    if (!account) return res.status(404).json({ message: 'Account not found' });
    
    res.json({ 
      message: `Account ${isArchived ? 'archived' : 'unarchived'} successfully`, 
      account 
    });
  } catch (err) {
    console.error(`Error ${req.body.isArchived ? 'archiving' : 'unarchiving'} account:`, err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;