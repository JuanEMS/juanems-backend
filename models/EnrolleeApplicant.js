const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const enrolleeApplicantSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true },
  middleName: { type: String, trim: true },
  lastName: { type: String, required: true, trim: true },
  dob: { type: Date, required: true },
  email: { type: String, required: true, trim: true },
  mobile: { type: String, required: true },
  nationality: { type: String, required: true },
  academicYear: { type: String, required: true },
  academicTerm: { type: String, required: true },
  academicStrand: { type: String, required: true },
  approvedAcademicStrand: { type: String, trim: true },
  academicLevel: { type: String, required: true },
  studentID: { type: String, required: true, unique: true },
  applicantID: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  temporaryPassword: { type: String, select: false },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Pending Verification'],
    default: 'Pending Verification',
  },
  createdAt: { type: Date, default: Date.now },
  otp: { type: String },
  otpExpires: { type: Date },
  otpAttempts: { type: Number, default: 0 },
  otpAttemptLockout: { type: Date },
  lastOtpAttempt: { type: Date },
  passwordResetOtp: { type: String },
  passwordResetOtpExpires: { type: Date },
  lastPasswordReset: { type: Date },
  loginOtp: { type: String },
  loginOtpExpires: { type: Date },
  loginOtpAttempts: { type: Number, default: 0 },
  loginOtpAttemptLockout: { type: Date },
  lastLoginOtpAttempt: { type: Date },
  verificationExpires: {
    type: Date,
    default: () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
  },
  loginAttempts: { type: Number, default: 0 },
  activityStatus: {
    type: String,
    enum: ['Online', 'Offline'],
    default: 'Offline',
  },
  lastLogin: { type: Date },
  lastLogout: { type: Date },
  prefix: { type: String, trim: true },
  suffix: { type: String, trim: true },
  gender: { type: String, trim: true },
  lrnNo: { type: String, trim: true },
  civilStatus: { type: String, trim: true },
  religion: { type: String, trim: true },
  birthDate: { type: String, trim: true },
  countryOfBirth: { type: String, trim: true },
  birthPlaceCity: { type: String, trim: true },
  birthPlaceProvince: { type: String, trim: true },
  entryLevel: { type: String, trim: true },
  presentHouseNo: { type: String, trim: true },
  presentBarangay: { type: String, trim: true },
  presentCity: { type: String, trim: true },
  presentProvince: { type: String, trim: true },
  presentPostalCode: { type: String, trim: true },
  permanentHouseNo: { type: String, trim: true },
  permanentBarangay: { type: String, trim: true },
  permanentCity: { type: String, trim: true },
  permanentProvince: { type: String, trim: true },
  permanentPostalCode: { type: String, trim: true },
  telephoneNo: { type: String, trim: true },
  emailAddress: { type: String, trim: true },
  elementarySchoolName: { type: String, trim: true },
  elementaryLastYearAttended: { type: String, trim: true },
  elementaryGeneralAverage: { type: String, trim: true },
  elementaryRemarks: { type: String, trim: true },
  juniorHighSchoolName: { type: String, trim: true },
  juniorHighLastYearAttended: { type: String, trim: true },
  juniorHighGeneralAverage: { type: String, trim: true },
  juniorHighRemarks: { type: String, trim: true },
  familyContacts: [{
    relationship: { type: String, trim: true },
    firstName: { type: String, trim: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    occupation: { type: String, trim: true },
    houseNo: { type: String, trim: true },
    city: { type: String, trim: true },
    province: { type: String, trim: true },
    country: { type: String, trim: true },
    mobileNo: { type: String, trim: true },
    telephoneNo: { type: String, trim: true },
    emailAddress: { type: String, trim: true },
    isEmergencyContact: { type: Boolean, default: false }
  }],
  interviewStatus: {
    type: String,
    enum: ['Pending', 'Scheduled', 'Completed', 'Passed', 'Rejected'],
    default: 'Pending'
  },
  examStatus: {
    type: String,
    enum: ['Pending', 'Scheduled', 'Completed', 'Passed', 'Rejected'],
    default: 'Pending'
  },
  registrationStatus: {
    type: String,
    enum: ['Incomplete', 'Complete'],
    default: 'Incomplete'
  },
  preferredExamAndInterviewDate: { type: Date },
  preferredExamAndInterviewApplicationStatus: {
    type: String,
    enum: ['Incomplete', 'Complete'],
    default: 'Incomplete'
  },
  admissionRequirements: [{
    requirementId: { type: Number, required: true },
    name: { type: String, required: true },
    fileContent: { type: Buffer },
    fileType: { type: String },
    fileName: { type: String },
    status: {
      type: String,
      enum: ['Not Submitted', 'Submitted', 'Verified', 'Waived'],
      default: 'Not Submitted'
    },
    waiverDetails: {
      reason: { type: String },
      promiseDate: { type: Date }
    }
  }],
  admissionRequirementsStatus: {
    type: String,
    enum: ['Incomplete', 'Complete'],
    default: 'Incomplete'
  },
  admissionAdminFirstStatus: {
    type: String,
    enum: ['On-going', 'Approved', 'Rejected'],
    default: 'On-going'
  },
  approvedExamDate: { type: Date },
  approvedExamTime: { type: String },
  admissionExamDetailsStatus: {
    type: String,
    enum: ['Incomplete', 'Complete'],
    default: 'Incomplete'
  },
  admissionRejectMessage: { type: String },
  approvedExamFeeAmount: { type: Number },
  approvedExamFeeStatus: {
    type: String,
    enum: ['Required', 'Paid', 'Waived'],
    default: 'Required'
  },
  approvedExamRoom: { type: String },
  approvedExamInterviewResult: {
    type: String,
    enum: ['Pending', 'On Waiting List', 'Rejected', 'Approved'],
    default: 'Pending'
  },
  examInterviewResultStatus: {
    type: String,
    enum: ['Incomplete', 'Complete'],
    default: 'Incomplete'
  },
  reservationFeePaymentStepStatus: {
    type: String,
    enum: ['Incomplete', 'Complete'],
    default: 'Incomplete',
  },
  reservationFeeAmountPaid: {
    type: Number,
    default: 0,
  },
admissionApprovalAdminStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  admissionApprovalStatus: {
    type: String,
    enum: ['Incomplete', 'Complete'],
    default: 'Incomplete',
  },
  admissionApprovalRejectMessage: {
    type: String,
    trim: true,
  },
  enrollmentRequirements: [{
    requirementId: { type: Number, required: true },
    name: { type: String, required: true },
    fileContent: { type: Buffer },
    fileType: { type: String },
    fileName: { type: String },
    status: {
      type: String,
      enum: ['Not Submitted', 'Submitted', 'Verified', 'Waived'],
      default: 'Not Submitted'
    },
    waiverDetails: {
      reason: { type: String },
      promiseDate: { type: Date }
    }
  }],
  enrollmentRequirementsStatus: {
    type: String,
    enum: ['Incomplete', 'Complete'],
    default: 'Incomplete'
  },
  voucherType: {
    type: String,
    enum: ['', 'PUBLIC SCHOOL VOUCHER', 'PRIVATE SCHOOL WITHOUT VOUCHER', 'PEAC VOUCHER'],
    default: '',
  },
  voucherApplicationStatus: {
    type: String,
    enum: ['Incomplete', 'Complete'],
    default: 'Incomplete',
  },
  voucherRequirements: [{
    requirementId: { type: Number, required: true },
    name: { type: String, required: true },
    fileContent: { type: Buffer },
    fileType: { type: String },
    fileName: { type: String },
    status: {
      type: String,
      enum: ['Not Submitted', 'Submitted', 'Verified', 'Waived'],
      default: 'Not Submitted',
    },
    waiverDetails: {
      reason: { type: String },
      promiseDate: { type: Date },
    },
  }],
  enrollmentApprovalAdminStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  enrollmentApprovalAdminStatus: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  enrollmentApprovalStatus: {
    type: String,
    enum: ['Incomplete', 'Complete'],
    default: 'Incomplete',
  },
  enrollmentApprovalRejectMessage: {
    type: String,
    trim: true,
  },
});

// Password hashing pre-save hook
enrolleeApplicantSchema.pre('save', async function (next) {
  if (
    !this.isModified('password') ||
    this.password.startsWith('$2a$') ||
    this.password.startsWith('$2b$')
  ) {
    return next();
  }
  try {
    const cleanPassword = this.password.trim();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(cleanPassword, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Admission requirements status hook
enrolleeApplicantSchema.pre('save', function (next) {
  if (this.isModified('admissionRequirements') && this.admissionRequirements && this.admissionRequirements.length > 0) {
    const allComplete = this.admissionRequirements.every(req => 
      req.status === 'Verified' || req.status === 'Waived'
    );
    const allAddressed = this.admissionRequirements.every(req =>
      req.status !== 'Not Submitted'
    );

    if (allComplete && allAddressed) {
      this.admissionRequirementsStatus = 'Complete';
      if (this.isModified('admissionRequirementsStatus')) {
        this.admissionAdminFirstStatus = 'On-going';
      }
    } else if (this.admissionRequirementsStatus !== 'Complete') {
      this.admissionRequirementsStatus = 'Incomplete';
    }
  } else if (this.isNew && (!this.admissionRequirements || this.admissionRequirements.length === 0)) {
    this.admissionRequirementsStatus = 'Incomplete';
  }
  next();
});

// Pre-save hook for enrollment requirements status
enrolleeApplicantSchema.pre('save', function (next) {
  if (this.isModified('enrollmentRequirements') && this.enrollmentRequirements && this.enrollmentRequirements.length > 0) {
    const allComplete = this.enrollmentRequirements.every(req => 
      req.status === 'Verified' || req.status === 'Waived'
    );
    this.enrollmentRequirementsStatus = allComplete ? 'Complete' : 'Incomplete';
  } else if (this.isNew && (!this.enrollmentRequirements || this.enrollmentRequirements.length === 0)) {
    this.enrollmentRequirementsStatus = 'Incomplete';
  }
  next();
});

enrolleeApplicantSchema.pre('save', function (next) {
  if (this.isModified('voucherRequirements') && this.voucherRequirements && this.voucherRequirements.length > 0) {
    const allComplete = this.voucherRequirements.every(req => 
      req.status === 'Submitted' || req.status === 'Verified' || req.status === 'Waived'
    );
    const allAddressed = this.voucherRequirements.every(req => 
      req.status !== 'Not Submitted'
    );
    this.voucherApplicationStatus = (allComplete && allAddressed) ? 'Complete' : 'Incomplete';
    
    // Set enrollmentApprovalAdminStatus to 'Pending' if any requirement is Submitted
    const hasSubmitted = this.voucherRequirements.some(req => req.status === 'Submitted');
    if (hasSubmitted && this.enrollmentApprovalAdminStatus !== 'Approved' && this.enrollmentApprovalAdminStatus !== 'Rejected') {
      this.enrollmentApprovalAdminStatus = 'Pending';
    }
  } else if (this.isNew && (!this.voucherRequirements || this.voucherRequirements.length === 0)) {
    console.log(`Initializing voucherRequirements for ${this.email}: []`);
    this.voucherApplicationStatus = 'Incomplete';
  } else if (this.voucherType && this.voucherType !== 'PEAC VOUCHER' && this.isModified('voucherType')) {
    this.voucherApplicationStatus = 'Complete';
  }
  next();
});

enrolleeApplicantSchema.pre('save', function (next) {
  console.log(`Pre-save hook for ${this.email}:`, {
    admissionApprovalAdminStatus: this.admissionApprovalAdminStatus,
    admissionApprovalStatus: this.admissionApprovalStatus,
    isModified: this.isModified('admissionApprovalAdminStatus'),
    modifiedPaths: this.modifiedPaths(),
  });

  // FIX: Ensure status is always synchronized even if not directly modified
  // This is the main fix for the bug - always set the appropriate status regardless of modification
  if (this.admissionApprovalAdminStatus === 'Approved') {
    this.admissionApprovalStatus = 'Complete';
    this.admissionApprovalRejectMessage = null;
    console.log(`Set admissionApprovalStatus to Complete for ${this.email}`);
  } else {
    this.admissionApprovalStatus = 'Incomplete';
    if (this.admissionApprovalAdminStatus !== 'Rejected') {
      this.admissionApprovalRejectMessage = null;
    }
    console.log(`Set admissionApprovalStatus to Incomplete for ${this.email}`);
  }
  next();
});

// Post-save hook for debugging
enrolleeApplicantSchema.post('save', function (doc) {
  console.log(`Post-save for ${doc.email}:`, {
    admissionApprovalAdminStatus: doc.admissionApprovalAdminStatus,
    admissionApprovalStatus: doc.admissionApprovalStatus,
    admissionApprovalRejectMessage: doc.admissionApprovalRejectMessage,
  });
});

// Method to sync admission approval status
enrolleeApplicantSchema.methods.syncAdmissionApprovalStatus = function () {
  if (this.admissionApprovalAdminStatus === 'Approved') {
    this.admissionApprovalStatus = 'Complete';
    this.admissionApprovalRejectMessage = null;
  } else {
    this.admissionApprovalStatus = 'Incomplete';
    if (this.admissionApprovalAdminStatus !== 'Rejected') {
      this.admissionApprovalRejectMessage = null;
    }
  }
  console.log(`Manual sync for ${this.email}:`, {
    admissionApprovalAdminStatus: this.admissionApprovalAdminStatus,
    admissionApprovalStatus: this.admissionApprovalStatus,
  });
};

// Pre-save hook for enrollment approval status
enrolleeApplicantSchema.pre('save', function (next) {
  console.log(`Pre-save hook for ${this.email}:`, {
    enrollmentApprovalAdminStatus: this.enrollmentApprovalAdminStatus,
    enrollmentApprovalStatus: this.enrollmentApprovalStatus,
    isModified: this.isModified('enrollmentApprovalAdminStatus'),
    modifiedPaths: this.modifiedPaths(),
  });

  if (this.enrollmentApprovalAdminStatus === 'Approved') {
    this.enrollmentApprovalStatus = 'Complete';
    this.enrollmentApprovalRejectMessage = null;
    console.log(`Set enrollmentApprovalStatus to Complete for ${this.email}`);
  } else {
    this.enrollmentApprovalStatus = 'Incomplete';
    if (this.enrollmentApprovalAdminStatus !== 'Rejected') {
      this.enrollmentApprovalRejectMessage = null;
    }
    console.log(`Set enrollmentApprovalStatus to Incomplete for ${this.email}`);
  }
  next();
});

// Post-save hook for debugging
enrolleeApplicantSchema.post('save', function (doc) {
  console.log(`Post-save for ${doc.email}:`, {
    enrollmentApprovalAdminStatus: doc.enrollmentApprovalAdminStatus,
    enrollmentApprovalStatus: doc.enrollmentApprovalStatus,
    enrollmentApprovalRejectMessage: doc.enrollmentApprovalRejectMessage,
  });
});

// Method to sync enrollment approval status
enrolleeApplicantSchema.methods.syncEnrollmentApprovalStatus = function () {
  if (this.enrollmentApprovalAdminStatus === 'Approved') {
    this.enrollmentApprovalStatus = 'Complete';
    this.enrollmentApprovalRejectMessage = null;
  } else {
    this.enrollmentApprovalStatus = 'Incomplete';
    if (this.enrollmentApprovalAdminStatus !== 'Rejected') {
      this.enrollmentApprovalRejectMessage = null;
    }
  }
  console.log(`Manual sync for ${this.email}:`, {
    enrollmentApprovalAdminStatus: this.enrollmentApprovalAdminStatus,
    enrollmentApprovalStatus: this.enrollmentApprovalStatus,
  });
};

// Method to check if OTP is valid
enrolleeApplicantSchema.methods.isOtpValid = function () {
  return this.otp && this.otpExpires && this.otpExpires > Date.now();
};

// Method to get temporary password
enrolleeApplicantSchema.methods.getPlainPassword = async function () {
  const user = await this.model('EnrolleeApplicant')
    .findById(this._id)
    .select('+temporaryPassword')
    .exec();
  return user.temporaryPassword;
};

module.exports = mongoose.model('EnrolleeApplicant', enrolleeApplicantSchema);