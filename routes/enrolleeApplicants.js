const express = require('express');
const router = express.Router();
const EnrolleeApplicant = require('../models/EnrolleeApplicant');
const emailService = require('../utils/emailService');
const { generateOTP, sendOTP } = require('../utils/emailService');
const otpGenerator = require('otp-generator');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;


// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
(async () => {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log('Uploads directory ensured');
  } catch (err) {
    console.error('Error creating uploads directory:', err);
  }
})();

// Configure Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${timestamp}-${random}${ext}`);
  },
});

// Configure Multer for memory storage (files stay in memory as buffers)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only PNG, JPG, JPEG, and PDF files are allowed'));
  },
});

router.post('/save-admission-requirements', upload.any(), async (req, res) => {
  try {
    const { email, requirements } = req.body;
    if (!email || !requirements) {
      return res.status(400).json({ error: 'Email and requirements are required' });
    }

    console.log('Received save-admission-requirements request:');
    console.log('Email:', email);
    console.log('Requirements:', requirements);

    const parsedRequirements = JSON.parse(requirements);
    const files = req.files || [];

    const fileMap = {};
    files.forEach((file) => {
      const [_, id] = file.fieldname.split('-');
      fileMap[id] = file;
    });

    const admissionRequirements = parsedRequirements.map((req) => {
      const file = fileMap[req.id];
      return {
        requirementId: req.id,
        name: req.name,
        fileContent: file ? file.buffer : null,
        fileType: file ? file.mimetype : null,
        fileName: file ? file.originalname : null,
        status: req.waived ? 'Waived' : file ? 'Submitted' : req.submitted ? 'Submitted' : 'Not Submitted',
        waiverDetails: req.waiverDetails
      };
    });

    console.log('Prepared admissionRequirements for saving:', JSON.stringify(admissionRequirements, null, 2));

    const enrollee = await EnrolleeApplicant.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        $set: { admissionRequirements }
      },
      { new: true, runValidators: true }
    );

    if (!enrollee) {
      return res.status(404).json({ error: 'Applicant not found' });
    }

    await enrollee.save();

    console.log('Saved enrollee document:');
    console.log('admissionRequirementsStatus:', enrollee.admissionRequirementsStatus);
    console.log('admissionAdminFirstStatus:', enrollee.admissionAdminFirstStatus);
    console.log('admissionRequirements:', JSON.stringify(enrollee.admissionRequirements, null, 2));

    res.json({
      message: 'Admission requirements saved successfully',
      admissionRequirements: enrollee.admissionRequirements,
      admissionRequirementsStatus: enrollee.admissionRequirementsStatus,
      admissionAdminFirstStatus: enrollee.admissionAdminFirstStatus
    });
  } catch (err) {
    console.error('Error saving admission requirements:', err);
    res.status(500).json({ error: 'Failed to save admission requirements' });
  }
});

router.get('/fetch-admission-file/:email/:requirementId', async (req, res) => {
  try {
    const { email, requirementId } = req.params;
    const cleanEmail = email.trim().toLowerCase();
    const reqId = parseInt(requirementId);

    const applicant = await EnrolleeApplicant.findOne({ 
      email: cleanEmail, 
      status: 'Active' 
    });
    
    if (!applicant) {
      return res.status(404).json({ error: 'Active applicant not found' });
    }

    const requirement = applicant.admissionRequirements.find(
      req => req.requirementId === reqId
    );
    
    if (!requirement || !requirement.fileContent) {
      return res.status(404).json({ error: 'File not found for this requirement' });
    }

    const dataUri = `data:${requirement.fileType};base64,${requirement.fileContent.toString('base64')}`;
    
    res.json({
      dataUri,
      fileType: requirement.fileType,
      fileName: requirement.fileName
    });
  } catch (err) {
    console.error('Error fetching admission file:', err);
    res.status(500).json({ error: 'Server error while fetching admission file' });
  }
});

async function getNextStudentIDSequence(academicYear) {
  const yearShort = academicYear.split('-')[0].slice(-2);
  const lastApplicant = await EnrolleeApplicant.findOne({
    studentID: new RegExp(`^${yearShort}-\\d{5}$`)
  }).sort({ studentID: -1 });

  if (!lastApplicant) {
    return `${yearShort}-00001`;
  }

  const lastNumber = parseInt(lastApplicant.studentID.split('-')[1], 10);
  const nextNumber = lastNumber + 1;
  return `${yearShort}-${nextNumber.toString().padStart(5, '0')}`;
}

async function getNextApplicantIDSequence(academicYear) {
  const yearFull = academicYear.split('-')[0];
  const lastApplicant = await EnrolleeApplicant.findOne({
    applicantID: new RegExp(`^${yearFull}-\\d{6}$`)
  }).sort({ applicantID: -1 });

  if (!lastApplicant) {
    return `${yearFull}-000001`;
  }

  const lastNumber = parseInt(lastApplicant.applicantID.split('-')[1], 10);
  const nextNumber = lastNumber + 1;
  return `${yearFull}-${nextNumber.toString().padStart(6, '0')}`;
}

function generateRandomPassword(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

router.post('/', async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      dob,
      email,
      mobile,
      nationality,
      academicYear,
      academicTerm,
      academicStrand,
      academicLevel,
    } = req.body;

    const existingActive = await EnrolleeApplicant.findOne({
      email,
      status: { $in: ['Pending Verification', 'Active'] }
    });

    if (existingActive) {
      return res.status(400).json({ error: 'Email is already registered with an active or pending application' });
    }

    const studentID = await getNextStudentIDSequence(academicYear);
    const applicantID = await getNextApplicantIDSequence(academicYear);
    const plainPassword = generateRandomPassword();
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 3 * 60 * 1000);

    const newApplicant = new EnrolleeApplicant({
      firstName,
      middleName,
      lastName,
      dob,
      email,
      mobile,
      nationality,
      academicYear,
      academicTerm,
      academicStrand,
      academicLevel,
      studentID,
      applicantID,
      password: plainPassword,
      temporaryPassword: plainPassword,
      status: 'Pending Verification',
      otp,
      otpExpires,
      verificationExpires: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    });

    await newApplicant.save();

    try {
      await sendOTP(email, firstName, otp);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError);
    }

    res.status(201).json({
      message: 'Registration successful. Please check your email for verification code.',
      data: {
        studentID,
        applicantID,
        email,
        password: plainPassword,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

router.get('/check-email/:email', async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const existing = await EnrolleeApplicant.findOne({
      email,
      status: { $in: ['Pending Verification', 'Active'] }
    });

    if (existing) {
      return res.status(409).json({ message: 'Email is already registered with an active or pending application' });
    }

    const existingInactive = await EnrolleeApplicant.findOne({
      email,
      status: 'Incomplete'
    });

    if (existingInactive) {
      return res.status(200).json({
        message: 'Email is available (previous inactive account exists)',
        status: 'Incomplete'
      });
    }

    return res.status(200).json({
      message: 'Email is available',
      status: 'Available'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
});

// Updated Route to fetch all personal details with logging
router.get('/personal-details/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const cleanEmail = email.trim().toLowerCase();

    const applicant = await EnrolleeApplicant.findOne({
      email: cleanEmail,
      status: 'Active',
    }).sort({ createdAt: -1 });

    if (!applicant) {
      console.error(`No active applicant found for email: ${cleanEmail}`);
      return res.status(404).json({
        message: 'Active account not found',
        errorType: 'account_not_found',
      });
    }

    const responseData = {
      // Step 1: Personal Information
      prefix: applicant.prefix || '',
      firstName: applicant.firstName,
      middleName: applicant.middleName || '',
      lastName: applicant.lastName,
      suffix: applicant.suffix || '',
      gender: applicant.gender || '',
      lrnNo: applicant.lrnNo || '',
      civilStatus: applicant.civilStatus || '',
      religion: applicant.religion || '',
      birthDate: applicant.birthDate || '',
      countryOfBirth: applicant.countryOfBirth || '',
      birthPlaceCity: applicant.birthPlaceCity || '',
      birthPlaceProvince: applicant.birthPlaceProvince || '',
      nationality: applicant.nationality,
      // Step 2: Admission and Enrollment Requirements
      entryLevel: applicant.entryLevel || '',
      academicYear: applicant.academicYear || '',
      academicStrand: applicant.academicStrand || '',
      academicTerm: applicant.academicTerm || '',
      academicLevel: applicant.academicLevel || '',
      // Step 3: Contact Details
      presentHouseNo: applicant.presentHouseNo || '',
      presentBarangay: applicant.presentBarangay || '',
      presentCity: applicant.presentCity || '',
      presentProvince: applicant.presentProvince || '',
      presentPostalCode: applicant.presentPostalCode || '',
      permanentHouseNo: applicant.permanentHouseNo || '',
      permanentBarangay: applicant.permanentBarangay || '',
      permanentCity: applicant.permanentCity || '',
      permanentProvince: applicant.permanentProvince || '',
      permanentPostalCode: applicant.permanentPostalCode || '',
      mobile: applicant.mobile,
      telephoneNo: applicant.telephoneNo || '',
      emailAddress: applicant.emailAddress || applicant.email,
      // Step 4: Educational Background
      elementarySchoolName: applicant.elementarySchoolName || '',
      elementaryLastYearAttended: applicant.elementaryLastYearAttended || '',
      elementaryGeneralAverage: applicant.elementaryGeneralAverage || '',
      elementaryRemarks: applicant.elementaryRemarks || '',
      juniorHighSchoolName: applicant.juniorHighSchoolName || '',
      juniorHighLastYearAttended: applicant.juniorHighLastYearAttended || '',
      juniorHighGeneralAverage: applicant.juniorHighGeneralAverage || '',
      juniorHighRemarks: applicant.juniorHighRemarks || '',
      // Step 5: Family Background
      contacts: applicant.familyContacts || [],
      // Additional fields
      studentID: applicant.studentID,
      applicantID: applicant.applicantID,
      registrationStatus: applicant.registrationStatus,
      dob: applicant.dob,
    };
    console.log('Fetched applicantData:', applicant);

    console.log(`Personal details fetched for ${cleanEmail}:`, responseData);

    res.json(responseData);
  } catch (error) {
    console.error('Error fetching personal details:', error);
    res.status(500).json({
      message: 'Server error while fetching personal details',
      errorType: 'server_error',
    });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email,
      status: 'Pending Verification'
    }).sort({ createdAt: -1 }).select('+temporaryPassword');

    if (!applicant) {
      return res.status(404).json({ message: 'Account not found or already verified' });
    }

    if (applicant.verificationExpires < new Date()) {
      applicant.status = 'Incomplete';
      await applicant.save();
      return res.status(400).json({
        message: 'Verification period has expired. Please register again.'
      });
    }

    if (applicant.otpAttemptLockout && applicant.otpAttemptLockout > new Date()) {
      const minutesLeft = Math.ceil((applicant.otpAttemptLockout - new Date()) / (1000 * 60));
      return res.status(429).json({
        message: `Too many attempts. Please try again in ${minutesLeft} minute(s).`,
        lockout: true
      });
    }

    if (!applicant.isOtpValid()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    if (applicant.otp !== otp) {
      applicant.otpAttempts += 1;
      applicant.lastOtpAttempt = new Date();

      if (applicant.otpAttempts >= 3) {
        applicant.otpAttemptLockout = new Date(Date.now() + 5 * 60 * 1000);
        await applicant.save();
        return res.status(429).json({
          message: 'Too many incorrect attempts. Please try again in 5 minutes.',
          lockout: true
        });
      }

      await applicant.save();
      const attemptsLeft = 3 - applicant.otpAttempts;
      return res.status(400).json({
        message: `Invalid OTP. ${attemptsLeft} attempt(s) left.`,
        attemptsLeft
      });
    }

    applicant.status = 'Active';
    applicant.otp = undefined;
    applicant.otpExpires = undefined;
    applicant.otpAttempts = 0;
    applicant.otpAttemptLockout = undefined;
    applicant.lastOtpAttempt = undefined;
    await applicant.save();

    await EnrolleeApplicant.updateMany(
      {
        email,
        status: 'Pending Verification',
        _id: { $ne: applicant._id }
      },
      {
        status: 'Incomplete',
        inactiveReason: 'New registration completed'
      }
    );

    const temporaryPassword = applicant.temporaryPassword;

    if (temporaryPassword) {
      try {
        await emailService.sendPasswordEmail(
          applicant.email,
          applicant.firstName,
          temporaryPassword,
          applicant.studentID,
          applicant.applicantID
        );
        applicant.temporaryPassword = undefined;
      } catch (emailError) {
        console.error('Failed to send password email:', emailError);
      }
    }

    await applicant.save();

    return res.status(200).json({
      message: 'Email verification successful. Your login credentials have been sent to your email.',
      data: {
        studentID: applicant.studentID,
        passwordSent: !!temporaryPassword
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    return res.status(500).json({ message: 'Server error during verification' });
  }
});

router.post('/verify-login-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email,
      status: 'Active'
    }).sort({ createdAt: -1 }).select('+loginOtp +loginOtpExpires');

    if (!applicant) {
      return res.status(404).json({ message: 'Account not found or not active' });
    }

    if (applicant.loginOtpAttemptLockout && applicant.loginOtpAttemptLockout > new Date()) {
      const minutesLeft = Math.ceil((applicant.loginOtpAttemptLockout - new Date()) / (1000 * 60));
      return res.status(429).json({
        message: `Too many attempts. Please try again in ${minutesLeft} minute(s).`,
        lockout: true
      });
    }

    if (!applicant.loginOtp || !applicant.loginOtpExpires || applicant.loginOtpExpires < new Date()) {
      return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
    }

    if (applicant.loginOtp !== otp) {
      applicant.loginOtpAttempts += 1;
      applicant.lastLoginOtpAttempt = new Date();

      if (applicant.loginOtpAttempts >= 3) {
        applicant.loginOtpAttemptLockout = new Date(Date.now() + 5 * 60 * 1000);
        await applicant.save();
        return res.status(429).json({
          message: 'Too many incorrect attempts. Please try again in 5 minutes.',
          lockout: true
        });
      }

      await applicant.save();
      const attemptsLeft = 3 - applicant.loginOtpAttempts;
      return res.status(400).json({
        message: `Invalid OTP. ${attemptsLeft} attempt(s) left.`,
        attemptsLeft
      });
    }

    applicant.activityStatus = 'Online';
    applicant.lastLogin = new Date();
    applicant.loginOtp = undefined;
    applicant.loginOtpExpires = undefined;
    applicant.loginOtpAttempts = 0;
    applicant.loginOtpAttemptLockout = undefined;
    applicant.lastLoginOtpAttempt = undefined;
    await applicant.save();

    res.json({
      message: 'Login successful',
      email: applicant.email,
      firstName: applicant.firstName,
      studentID: applicant.studentID,
      applicantID: applicant.applicantID,
      activityStatus: applicant.activityStatus,
      loginAttempts: applicant.loginAttempts,
      lastLogin: applicant.lastLogin,
      lastLogout: applicant.lastLogout,
      createdAt: applicant.createdAt.toISOString()
    });
  } catch (error) {
    console.error('Login OTP verification error:', error);
    return res.status(500).json({ message: 'Server error during login OTP verification' });
  }
});

router.get('/verification-status/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const applicant = await EnrolleeApplicant.findOne({
      email
    }).sort({ createdAt: -1 });

    if (!applicant) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const response = {
      status: applicant.status,
      firstName: applicant.firstName,
      createdAt: applicant.createdAt.toISOString(),
      isLockedOut: applicant.otpAttemptLockout && applicant.otpAttemptLockout > new Date(),
      lockoutTimeLeft: applicant.otpAttemptLockout ?
        Math.ceil((applicant.otpAttemptLockout - new Date()) / 1000) : 0,
      otpTimeLeft: applicant.otpExpires ?
        Math.ceil((applicant.otpExpires - new Date()) / 1000) : 0,
      attemptsLeft: 3 - (applicant.otpAttempts || 0)
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error getting verification status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/login-otp-status/:email', async (req, res) => {
  try {
    const { email } = req.params;

    const applicant = await EnrolleeApplicant.findOne({
      email,
      status: 'Active'
    }).sort({ createdAt: -1 });

    if (!applicant) {
      return res.status(404).json({ message: 'Account not found or not active' });
    }

    const response = {
      status: applicant.status,
      firstName: applicant.firstName,
      createdAt: applicant.createdAt.toISOString(),
      isLockedOut: applicant.loginOtpAttemptLockout && applicant.loginOtpAttemptLockout > new Date(),
      lockoutTimeLeft: applicant.loginOtpAttemptLockout ?
        Math.ceil((applicant.loginOtpAttemptLockout - new Date()) / 1000) : 0,
      otpTimeLeft: applicant.loginOtpExpires ?
        Math.ceil((applicant.loginOtpExpires - new Date()) / 1000) : 0,
      attemptsLeft: 3 - (applicant.loginOtpAttempts || 0)
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error getting login OTP status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/resend-login-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email,
      status: 'Active'
    }).sort({ createdAt: -1 });

    if (!applicant) {
      return res.status(404).json({ message: 'Account not found or not active' });
    }

    if (applicant.loginOtpAttemptLockout && applicant.loginOtpAttemptLockout > new Date()) {
      const minutesLeft = Math.ceil((applicant.loginOtpAttemptLockout - new Date()) / (1000 * 60));
      return res.status(429).json({
        message: `Please wait ${minutesLeft} minute(s) before requesting a new OTP.`,
        lockout: true
      });
    }

    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false
    });

    applicant.loginOtp = otp;
    applicant.loginOtpExpires = new Date(Date.now() + 3 * 60 * 1000);
    applicant.loginOtpAttempts = 0;
    applicant.loginOtpAttemptLockout = undefined;
    applicant.lastLoginOtpAttempt = undefined;
    await applicant.save();

    await sendOTP(email, applicant.firstName, otp, 'login');

    return res.status(200).json({
      message: 'New verification code sent to your email',
      expiresIn: 180
    });
  } catch (error) {
    console.error('Resend login OTP error:', error);
    return res.status(500).json({ message: 'Server error while resending OTP' });
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

    const applicant = await EnrolleeApplicant.findOne({ email });

    if (!applicant) {
      return res.status(404).json({
        message: 'Account not found',
        errorType: 'account_not_found'
      });
    }

    const newPassword = generateRandomPassword();
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    applicant.password = hashedPassword;
    await applicant.save();

    try {
      await emailService.sendPasswordEmail(
        applicant.email,
        applicant.firstName,
        newPassword,
        applicant.studentID,
        applicant.applicantID
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

    const user = await EnrolleeApplicant.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Email not found' });
    }

    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false
    });

    user.passwordResetOtp = otp;
    user.passwordResetOtpExpires = new Date(Date.now() + 3 * 60 * 1000);
    await user.save();

    await emailService.sendOTP(email, user.firstName, otp);

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

    const user = await EnrolleeApplicant.findOne({ email })
      .select('+passwordResetOtp +passwordResetOtpExpires +password');

    if (!user) {
      return res.status(404).json({ message: 'Email not found' });
    }

    if (!user.passwordResetOtp || user.passwordResetOtp !== otp) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    if (user.passwordResetOtpExpires < new Date()) {
      return res.status(400).json({ message: 'Verification code has expired' });
    }

    const newPassword = generateRandomPassword();
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    user.passwordResetOtp = undefined;
    user.passwordResetOtpExpires = undefined;
    user.lastPasswordReset = new Date();

    await user.save();

    await emailService.sendPasswordResetEmail(
      email,
      user.firstName,
      newPassword,
      user.studentID
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

router.post('/resend-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email,
      status: 'Pending Verification'
    }).sort({ createdAt: -1 });

    if (!applicant) {
      return res.status(404).json({ message: 'Account not found or already verified' });
    }

    if (applicant.otpAttemptLockout && applicant.otpAttemptLockout > new Date()) {
      const minutesLeft = Math.ceil((applicant.otpAttemptLockout - new Date()) / (1000 * 60));
      return res.status(429).json({
        message: `Please wait ${minutesLeft} minute(s) before requesting a new OTP.`,
        lockout: true
      });
    }

    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false
    });

    applicant.otp = otp;
    applicant.otpExpires = new Date(Date.now() + 3 * 60 * 1000);
    applicant.otpAttempts = 0;
    applicant.otpAttemptLockout = undefined;
    applicant.lastOtpAttempt = undefined;
    await applicant.save();

    await sendOTP(email, applicant.firstName, otp);

    return res.status(200).json({
      message: 'New verification code sent to your email',
      expiresIn: 180
    });
  } catch (error) {
    console.error('Resend OTP error:', error);
    return res.status(500).json({ message: 'Server error while resending OTP' });
  }
});

router.get('/password-reset-status/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const applicant = await EnrolleeApplicant.findOne({ email });

    if (!applicant) {
      return res.status(404).json({ message: 'Account not found' });
    }

    const response = {
      status: applicant.status,
      firstName: applicant.firstName,
      isLockedOut: false,
      lockoutTimeLeft: 0,
      otpTimeLeft: applicant.passwordResetOtpExpires
        ? Math.ceil((applicant.passwordResetOtpExpires - new Date()) / 1000)
        : 0,
      attemptsLeft: 3
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error getting password reset status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

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

    const applicant = await EnrolleeApplicant.findOne({
      email: cleanEmail,
      status: 'Active'
    }).sort({ createdAt: -1 }).select('+password');

    if (!applicant) {
      const pendingAccount = await EnrolleeApplicant.findOne({
        email: cleanEmail,
        status: 'Pending Verification'
      }).sort({ createdAt: -1 });

      if (pendingAccount) {
        if (pendingAccount.verificationExpires < new Date()) {
          pendingAccount.status = 'Incomplete';
          pendingAccount.inactiveReason = 'Auto-cleaned expired verification';
          await pendingAccount.save();
          return res.status(403).json({
            message: 'Verification period expired. Please register again.',
            errorType: 'verification_expired'
          });
        }
        return res.status(403).json({
          message: 'Account requires email verification',
          errorType: 'pending_verification',
          email: pendingAccount.email,
          firstName: pendingAccount.firstName
        });
      }

      const inactiveAccount = await EnrolleeApplicant.findOne({
        email: cleanEmail,
        status: 'Incomplete'
      });

      if (inactiveAccount) {
        return res.status(403).json({
          message: 'Account is inactive. Reason: ' +
            (inactiveAccount.inactiveReason || 'Unknown reason'),
          errorType: 'account_inactive'
        });
      }

      return res.status(404).json({
        message: 'Account not found',
        errorType: 'account_not_found'
      });
    }

    applicant.loginAttempts += 1;
    await applicant.save();

    const isMatch = await bcrypt.compare(cleanPassword, applicant.password);

    if (!isMatch) {
      return res.status(401).json({
        message: 'Invalid credentials',
        errorType: 'authentication'
      });
    }

    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false
    });

    applicant.loginOtp = otp;
    applicant.loginOtpExpires = new Date(Date.now() + 3 * 60 * 1000);
    applicant.loginOtpAttempts = 0;
    applicant.loginOtpAttemptLockout = undefined;
    applicant.lastLoginOtpAttempt = undefined;
    await applicant.save();

    await sendOTP(applicant.email, applicant.firstName, otp, 'login');

    res.json({
      message: 'OTP sent for login verification',
      email: applicant.email,
      firstName: applicant.firstName
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      message: 'Server error during login',
      errorType: 'server_error'
    });
  }
});

// Helper function to validate and sanitize string inputs
const sanitizeString = (value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

// Helper function to validate formData structure
const validateFormData = (formData) => {
  const errors = [];

  // Step 1: Personal Information (required fields)
  if (!sanitizeString(formData.firstName)) errors.push('First name is required');
  if (!sanitizeString(formData.lastName)) errors.push('Last name is required');
  if (!sanitizeString(formData.birthDate)) errors.push('Birth date is required');
  if (!sanitizeString(formData.nationality)) errors.push('Nationality is required');

  // Step 2: Admission and Enrollment Requirements
  if (!sanitizeString(formData.entryLevel)) errors.push('Entry level is required');

  // Step 3: Contact Details (required fields)
  if (!sanitizeString(formData.mobile)) errors.push('Mobile number is required');
  if (!sanitizeString(formData.presentCity)) errors.push('Present city is required');
  if (!sanitizeString(formData.permanentCity)) errors.push('Permanent city is required');

  // Step 4: Educational Background (at least one school required)
  if (!sanitizeString(formData.elementarySchoolName) && !sanitizeString(formData.juniorHighSchoolName)) {
    errors.push('At least one school name (elementary or junior high) is required');
  }

  // Step 5: Family Background
  if (!Array.isArray(formData.contacts) || formData.contacts.length === 0) {
    errors.push('At least one family contact is required');
  } else {
    formData.contacts.forEach((contact, index) => {
      if (!sanitizeString(contact.relationship)) {
        errors.push(`Contact ${index + 1}: Relationship is required`);
      }
      if (!sanitizeString(contact.firstName)) {
        errors.push(`Contact ${index + 1}: First name is required`);
      }
      if (!sanitizeString(contact.lastName)) {
        errors.push(`Contact ${index + 1}: Last name is required`);
      }
    });
  }

  return errors;
};

router.post('/save-registration', async (req, res) => {
  try {
    const { email, formData } = req.body;

    // Validate input
    if (!sanitizeString(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!formData || typeof formData !== 'object') {
      return res.status(400).json({ error: 'Invalid or missing form data' });
    }

    // Validate formData structure
    const validationErrors = validateFormData(formData);
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: validationErrors });
    }

    // Find the applicant by email
    const applicant = await EnrolleeApplicant.findOne({ email: email.toLowerCase(), status: 'Active' });
    if (!applicant) {
      return res.status(404).json({ error: 'Active applicant not found' });
    }

    // Update personal information (Step 1)
    applicant.prefix = sanitizeString(formData.prefix);
    applicant.firstName = sanitizeString(formData.firstName) || applicant.firstName;
    applicant.middleName = sanitizeString(formData.middleName);
    applicant.lastName = sanitizeString(formData.lastName) || applicant.lastName;
    applicant.suffix = sanitizeString(formData.suffix);
    applicant.gender = sanitizeString(formData.gender);
    applicant.lrnNo = sanitizeString(formData.lrnNo);
    applicant.civilStatus = sanitizeString(formData.civilStatus);
    applicant.religion = sanitizeString(formData.religion);
    applicant.birthDate = sanitizeString(formData.birthDate);
    applicant.countryOfBirth = sanitizeString(formData.countryOfBirth);
    applicant.birthPlaceCity = sanitizeString(formData.birthPlaceCity);
    applicant.birthPlaceProvince = sanitizeString(formData.birthPlaceProvince);
    applicant.nationality = sanitizeString(formData.nationality) || applicant.nationality;

    // Update admission and enrollment requirements (Step 2)
    applicant.entryLevel = sanitizeString(formData.entryLevel);

    // Update contact details (Step 3)
    applicant.presentHouseNo = sanitizeString(formData.presentHouseNo);
    applicant.presentBarangay = sanitizeString(formData.presentBarangay);
    applicant.presentCity = sanitizeString(formData.presentCity);
    applicant.presentProvince = incurableString(formData.presentProvince);
    applicant.presentPostalCode = sanitizeString(formData.presentPostalCode);
    applicant.permanentHouseNo = sanitizeString(formData.permanentHouseNo);
    applicant.permanentBarangay = sanitizeString(formData.permanentBarangay);
    applicant.permanentCity = sanitizeString(formData.permanentCity);
    applicant.permanentProvince = sanitizeString(formData.permanentProvince);
    applicant.permanentPostalCode = sanitizeString(formData.permanentPostalCode);
    applicant.mobile = sanitizeString(formData.mobile) || applicant.mobile;
    applicant.telephoneNo = sanitizeString(formData.telephoneNo);
    applicant.emailAddress = sanitizeString(formData.emailAddress) || applicant.email;

    // Update educational background (Step 4)
    applicant.elementarySchoolName = sanitizeString(formData.elementarySchoolName);
    applicant.elementaryLastYearAttended = sanitizeString(formData.elementaryLastYearAttended);
    applicant.elementaryGeneralAverage = sanitizeString(formData.elementaryGeneralAverage);
    applicant.elementaryRemarks = sanitizeString(formData.elementaryRemarks);
    applicant.juniorHighSchoolName = sanitizeString(formData.juniorHighSchoolName);
    applicant.juniorHighLastYearAttended = sanitizeString(formData.juniorHighLastYearAttended);
    applicant.juniorHighGeneralAverage = sanitizeString(formData.juniorHighGeneralAverage);
    applicant.juniorHighRemarks = sanitizeString(formData.juniorHighRemarks);

    // Update family background (Step 5)
    applicant.familyContacts = [];
    if (Array.isArray(formData.contacts)) {
      for (const contact of formData.contacts) {
        if (typeof contact === 'object' && contact) {
          applicant.familyContacts.push({
            relationship: sanitizeString(contact.relationship),
            firstName: sanitizeString(contact.firstName),
            middleName: sanitizeString(contact.middleName),
            lastName: sanitizeString(contact.lastName),
            occupation: sanitizeString(contact.occupation),
            houseNo: sanitizeString(contact.houseNo),
            city: sanitizeString(contact.city),
            province: sanitizeString(contact.province),
            country: sanitizeString(contact.country),
            mobileNo: sanitizeString(contact.mobileNo),
            telephoneNo: sanitizeString(contact.telephoneNo),
            emailAddress: sanitizeString(contact.emailAddress),
            isEmergencyContact: typeof contact.isEmergencyContact === 'boolean' ? contact.isEmergencyContact : false
          });
        }
      }
    }

    // Mark registration as complete
    applicant.registrationStatus = 'Complete';

    // Save the updated applicant data
    await applicant.save();

    res.status(200).json({ message: 'Registration data saved successfully' });
  } catch (err) {
    console.error('Error saving registration data:', err);
    if (err.name === 'ValidationError') {
      const errors = Object.values(err.errors).map(e => e.message).join(', ');
      return res.status(400).json({ error: `Validation error: ${errors}` });
    }
    res.status(500).json({ error: `Server error: ${err.message || 'Unknown error'}` });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const { email, createdAt } = req.body;

    if (!email) {
      return res.status(400).json({
        message: 'Email is required',
        errorType: 'validation'
      });
    }

    let query = {
      email,
      status: 'Active'
    };

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

    const applicant = await EnrolleeApplicant.findOne(query)
      .sort({ createdAt: -1 });

    if (!applicant) {
      return res.status(404).json({
        message: 'Account not found',
        errorType: 'account_not_found'
      });
    }

    applicant.activityStatus = 'Offline';
    applicant.lastLogout = new Date();
    await applicant.save();

    res.json({
      message: 'Logout successful',
      activityStatus: applicant.activityStatus
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      message: 'Server error during logout',
      errorType: 'server_error'
    });
  }
});

router.post('/complete-admission-requirements', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const applicant = await EnrolleeApplicant.findOneAndUpdate(
      { email: email.toLowerCase(), status: 'Active' },
      {
        $set: {
          admissionRequirementsStatus: 'Complete',
          admissionAdminFirstStatus: 'On-going'
        }
      },
      { new: true }
    );

    if (!applicant) {
      return res.status(404).json({ error: 'Active applicant not found' });
    }

    res.json({
      message: 'Admission requirements marked as complete',
      admissionRequirementsStatus: applicant.admissionRequirementsStatus,
      admissionAdminFirstStatus: applicant.admissionAdminFirstStatus
    });
  } catch (err) {
    console.error('Error completing admission requirements:', err);
    res.status(500).json({ error: 'Failed to complete admission requirements' });
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

    const applicant = await EnrolleeApplicant.findOne(query)
      .sort({ createdAt: -1 });

    if (!applicant) {
      return res.status(404).json({
        message: 'Active account not found',
        errorType: 'account_not_found'
      });
    }

    res.json({
      activityStatus: applicant.activityStatus,
      loginAttempts: applicant.loginAttempts,
      lastLogin: applicant.lastLogin,
      lastLogout: applicant.lastLogout,
      accountCreatedAt: applicant.createdAt
    });
  } catch (error) {
    console.error('Activity fetch error:', error);
    res.status(500).json({
      message: 'Server error while fetching activity data',
      errorType: 'server_error'
    });
  }
});

router.post('/save-exam-interview', async (req, res) => {
  try {
    const { email, selectedDate, preferredExamAndInterviewApplicationStatus } = req.body;

    if (!sanitizeString(email) || !selectedDate || !preferredExamAndInterviewApplicationStatus) {
      return res.status(400).json({ error: 'Email, selected date, and status are required' });
    }

    const applicant = await EnrolleeApplicant.findOne({ 
      email: email.toLowerCase(), 
      status: 'Active' 
    });

    if (!applicant) {
      return res.status(404).json({ error: 'Active applicant not found' });
    }

    if (applicant.preferredExamAndInterviewApplicationStatus === 'Complete') {
      return res.status(400).json({ error: 'Exam and interview date already saved' });
    }

    applicant.preferredExamAndInterviewDate = new Date(selectedDate);
    applicant.preferredExamAndInterviewApplicationStatus = preferredExamAndInterviewApplicationStatus;

    await applicant.save();

    res.status(200).json({ message: 'Exam and interview date saved successfully' });
  } catch (err) {
    console.error('Error saving exam and interview data:', err);
    res.status(500).json({ error: 'Server error while saving exam and interview data' });
  }
});

// Fetch admission requirements
router.get('/admission-requirements/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const applicant = await EnrolleeApplicant.findOne({ email: email.toLowerCase(), status: 'Active' });
    if (!applicant) {
      return res.status(404).json({ error: 'Active applicant not found' });
    }
    res.status(200).json({
      admissionRequirements: applicant.admissionRequirements,
      admissionRequirementsStatus: applicant.admissionRequirementsStatus
    });
  } catch (err) {
    console.error('Error fetching admission requirements:', err);
    res.status(500).json({ error: 'Server error while fetching admission requirements' });
  }
});

router.get('/exam-interview/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const cleanEmail = email.trim().toLowerCase();

    const applicant = await EnrolleeApplicant.findOne({
      email: cleanEmail,
      status: 'Active',
    }).sort({ createdAt: -1 });

    if (!applicant) {
      return res.status(404).json({ error: 'Active applicant not found' });
    }

    res.status(200).json({
      selectedDate: applicant.preferredExamAndInterviewDate,
      preferredExamAndInterviewApplicationStatus: applicant.preferredExamAndInterviewApplicationStatus
    });
  } catch (err) {
    console.error('Error fetching exam and interview data:', err);
    res.status(500).json({ error: 'Server error while fetching exam and interview data' });
  }
});

module.exports = router;