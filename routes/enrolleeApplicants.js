const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt");
const otpGenerator = require("otp-generator");
const EnrolleeApplicant = require("../models/EnrolleeApplicant");
const PendingOTP = require("../models/PendingOTP");
const emailService = require("../utils/emailService");

const fs = require("fs").promises;

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../uploads");
(async () => {
  try {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log("Uploads directory ensured");
  } catch (err) {
    console.error("Error creating uploads directory:", err);
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
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only PNG, JPG, JPEG, and PDF files are allowed"));
  },
});

router.post("/test-email", async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: "Email and name are required" });
    }

    // Test SMTP connection
    await emailService.testSmtpConnection();

    // Generate and send a test OTP
    const otp = generateOTP();
    await sendOTP(email, name, otp, "verification");

    res.status(200).json({ message: "Test email sent successfully" });
  } catch (error) {
    console.error("Test email error:", error);
    res
      .status(500)
      .json({ error: `Failed to send test email: ${error.message}` });
  }
});

// Send OTP before signup
router.post("/send-signup-otp", async (req, res) => {
  try {
    const { email, firstName, lastName } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        error: "Email, first name, and last name are required",
      });
    }

    // Check if applicant with this email already exists
    const existingApplicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
    });

    if (existingApplicant) {
      return res.status(409).json({
        error: "Applicant with this email already exists",
      });
    }

    // Generate numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in session or temporary storage
    // We'll use a temporary collection to store pending OTPs
    const pendingOTP = new PendingOTP({
      email: email.toLowerCase(),
      otp,
      firstName,
      lastName,
      otpExpiry: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry
    });

    await pendingOTP.save();

    // Send OTP via email
    await emailService.sendOTP(
      email.toLowerCase(),
      otp,
      `${firstName} ${lastName}`
    );

    res.status(200).json({
      message: "OTP sent successfully. Please verify to continue signup.",
      email: email.toLowerCase(),
      otp, // Only for testing
    });
  } catch (error) {
    console.error("Error sending signup OTP:", error);
    res.status(500).json({
      error: `Failed to send OTP: ${error.message}`,
    });
  }
});

// Verify OTP before allowing signup
router.post("/verify-signup-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        error: "Email and OTP are required",
      });
    }

    // Find pending OTP
    const pendingOTP = await PendingOTP.findOne({
      email: email.toLowerCase(),
      otp,
    });

    if (!pendingOTP) {
      return res.status(400).json({
        error: "Invalid OTP",
      });
    }

    // Check if OTP is expired
    if (pendingOTP.otpExpiry < new Date()) {
      await PendingOTP.deleteOne({ _id: pendingOTP._id });
      return res.status(400).json({
        error: "OTP has expired. Please request a new one.",
      });
    }

    // OTP is valid - return success
    res.status(200).json({
      message: "OTP verified successfully. You can now proceed with signup.",
      email: email.toLowerCase(),
      verified: true,
    });
  } catch (error) {
    console.error("Error verifying signup OTP:", error);
    res.status(500).json({
      error: `Failed to verify OTP: ${error.message}`,
    });
  }
});

router.post("/signup-applicant", async (req, res) => {
  try {
    const {
      firstName,
      middleName,
      lastName,
      email,
      mobile,
      dob,
      nationality,
      academicYear,
      academicTerm,
      academicLevel,
      academicStrand,
      applyingFor,
    } = req.body;

    // Validate required fields
    if (
      !firstName ||
      !lastName ||
      !email ||
      !mobile ||
      !dob ||
      !nationality ||
      !academicYear ||
      !academicTerm ||
      !academicLevel ||
      !academicStrand
    ) {
      return res.status(400).json({ error: "Required fields are missing" });
    }

    // Check if applicant with this email already exists
    const existingApplicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
    });
    if (existingApplicant) {
      return res
        .status(409)
        .json({ error: "Applicant with this email already exists" });
    }

    // Verify that email has been verified with OTP
    const pendingOTP = await PendingOTP.findOne({
      email: email.toLowerCase(),
      firstName,
      lastName,
    });

    if (!pendingOTP) {
      return res.status(400).json({
        error: "Please verify your email with OTP before signing up",
      });
    }

    // Generate temporary password
    const tempPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Generate unique IDs
    const studentID = generateStudentID();
    const applicantID = generateApplicantID();

    // Create new applicant
    const applicant = new EnrolleeApplicant({
      firstName,
      middleName,
      lastName,
      email: email.toLowerCase(),
      mobile,
      dob: new Date(dob),
      nationality,
      academicYear,
      academicTerm,
      academicLevel,
      academicStrand,
      applyingFor,
      status: "Active", // Email already verified
      studentID,
      applicantID,
      password: hashedPassword,
      temporaryPassword: tempPassword,
      admissionRequirementsStatus: "Incomplete",
      admissionAdminFirstStatus: "On-going",
    });

    // Save applicant to database
    await applicant.save();

    // Delete the pending OTP
    await PendingOTP.deleteOne({ _id: pendingOTP._id });

    // Send password email
    await emailService.sendPasswordEmail(
      email.toLowerCase(),
      `${firstName} ${lastName}`,
      tempPassword
    );

    res.status(201).json({
      message:
        "Applicant created successfully. Your login credentials have been sent to your email.",
      email: email.toLowerCase(),
      studentID,
    });
  } catch (error) {
    console.error("Error creating applicant:", error);
    res
      .status(500)
      .json({ error: `Failed to create applicant: ${error.message}` });
  }
});

// Send OTP for signin verification
router.post("/send-signin-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: "Email is required",
      });
    }

    // Check if applicant exists and is active
    const applicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
      status: "Active",
    });

    if (!applicant) {
      return res.status(404).json({
        error: "No active account found with this email",
      });
    }

    // Delete any existing OTPs for this email
    await PendingOTP.deleteMany({
      email: email.toLowerCase(),
      type: "signin",
    });

    // Generate numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store signin OTP
    const pendingOTP = new PendingOTP({
      email: email.toLowerCase(),
      otp,
      firstName: applicant.firstName,
      lastName: applicant.lastName,
      otpExpiry: new Date(Date.now() + 3 * 60 * 1000), // 3 minutes expiry for login
      type: "signin",
    });

    await pendingOTP.save();

    // Send OTP via email
    await emailService.sendOTP(
      email.toLowerCase(),
      otp,
      `${applicant.firstName} ${applicant.lastName}`
    );

    res.status(200).json({
      message: "OTP sent successfully. Please verify to continue signin.",
      email: email.toLowerCase(),
      otp, // Only for testing
    });
  } catch (error) {
    console.error("Error sending signin OTP:", error);
    res.status(500).json({
      error: `Failed to send OTP: ${error.message}`,
    });
  }
});

router.post("/verify-signin-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        error: "Email and OTP are required",
      });
    }

    // Find pending signin OTP
    const pendingOTP = await PendingOTP.findOne({
      email: email.toLowerCase(),
      type: "signin",
    });

    if (!pendingOTP) {
      return res.status(400).json({
        error: "No pending OTP found. Please request a new one.",
      });
    }

    // Check if OTP is expired
    if (pendingOTP.otpExpiry < new Date()) {
      await PendingOTP.deleteOne({ _id: pendingOTP._id });
      return res.status(400).json({
        error: "OTP has expired. Please request a new one.",
      });
    }

    // Verify OTP
    if (pendingOTP.otp !== otp) {
      return res.status(400).json({
        error: "Invalid OTP",
      });
    }

    // Find the applicant
    const applicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
      status: "Active",
    });

    if (!applicant) {
      return res.status(404).json({
        error: "Account not found or not active",
      });
    }

    // Delete the pending OTP
    await PendingOTP.deleteOne({ _id: pendingOTP._id });

    // Convert the applicant document to a plain JavaScript object
    const userData = applicant.toObject();

    // Remove sensitive data like password
    delete userData.password;

    // Return success with complete applicant details
    res.status(200).json({
      message: "Email verified successfully. You can now proceed with signin.",
      verified: true,
      user: userData,
    });
  } catch (error) {
    console.error("Error verifying signin OTP:", error);
    res.status(500).json({
      error: `Failed to verify OTP: ${error.message}`,
    });
  }
});

router.post("/signin-applicant", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
    });
    if (!applicant) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isPasswordValid = await bcrypt.compare(password, applicant.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Convert the applicant document to a plain JavaScript object
    const userData = applicant.toObject();

    // Remove sensitive data like password
    delete userData.password;

    // Return complete user data
    res.status(200).json({
      message: "Login successful",
      user: userData,
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ error: `Failed to log in: ${error.message}` });
  }
});

// Helper function to generate temporary password
function generateTemporaryPassword() {
  const length = 10;
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

// Helper function to generate student ID
function generateStudentID() {
  const year = new Date().getFullYear().toString();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `S${year}${random}`;
}

// Helper function to generate applicant ID
function generateApplicantID() {
  const year = new Date().getFullYear().toString();
  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, "0");
  return `A${year}${random}`;
}

router.post("/save-admission-requirements", upload.any(), async (req, res) => {
  try {
    console.log("Received request body:", req.body);
    console.log("Received files:", req.files);

    const { email, requirements } = req.body;
    if (!email || !requirements) {
      return res
        .status(400)
        .json({ error: "Email and requirements are required" });
    }

    let parsedRequirements;
    try {
      parsedRequirements = JSON.parse(requirements);
    } catch (err) {
      return res.status(400).json({ error: "Invalid requirements format" });
    }

    if (!Array.isArray(parsedRequirements) || parsedRequirements.length === 0) {
      return res
        .status(400)
        .json({ error: "Requirements must be a non-empty array" });
    }

    const files = req.files || [];
    const fileMap = {};
    files.forEach((file) => {
      const match = file.fieldname.match(/^file-(\d+)$/);
      if (match) {
        fileMap[match[1]] = file;
      }
    });

    console.log("Parsed requirements:", parsedRequirements);
    console.log(
      "File map:",
      Object.keys(fileMap).map((id) => ({ id, name: fileMap[id].originalname }))
    );

    const applicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
      status: "Active",
    });
    if (!applicant) {
      return res.status(404).json({ error: "Active applicant not found" });
    }

    // Initialize admissionRequirements if empty
    if (!applicant.admissionRequirements) {
      applicant.admissionRequirements = [];
    }

    const admissionRequirements = parsedRequirements.map((req) => {
      const file = fileMap[req.id];
      const existingReq =
        applicant.admissionRequirements.find(
          (r) => r.requirementId === req.id
        ) || {};

      // Validate requirement data
      if (!req.id || !req.name) {
        throw new Error(
          `Invalid requirement data: missing id or name for requirement ${req.id}`
        );
      }

      return {
        requirementId: req.id,
        name: req.name,
        fileContent: file ? file.buffer : existingReq.fileContent,
        fileType: file ? file.mimetype : existingReq.fileType,
        fileName: file ? file.originalname : existingReq.fileName,
        status: req.waived
          ? "Waived"
          : file
          ? "Submitted"
          : existingReq.status && existingReq.fileContent
          ? existingReq.status
          : "Not Submitted",
        waiverDetails: req.waived
          ? req.waiverDetails || existingReq.waiverDetails
          : undefined,
      };
    });

    console.log("Constructed admissionRequirements:", admissionRequirements);

    // Validate that all requirements have valid data
    const invalidReqs = admissionRequirements.filter(
      (req) =>
        req.status === "Submitted" &&
        (!req.fileContent || !req.fileType || !req.fileName)
    );
    if (invalidReqs.length > 0) {
      return res
        .status(400)
        .json({ error: "Invalid file data for one or more requirements" });
    }

    applicant.admissionRequirements = admissionRequirements;

    // Update status: Complete if all requirements are Submitted, Verified, or Waived
    const allComplete = admissionRequirements.every(
      (req) =>
        req.status === "Submitted" ||
        req.status === "Verified" ||
        req.status === "Waived"
    );
    const allAddressed = admissionRequirements.every(
      (req) => req.status !== "Not Submitted"
    );

    applicant.admissionRequirementsStatus =
      allComplete && allAddressed ? "Complete" : "Incomplete";
    if (allComplete && allAddressed) {
      applicant.admissionAdminFirstStatus = "On-going";
    }

    console.log("Applicant before save:", {
      admissionRequirements: applicant.admissionRequirements.map((r) => ({
        requirementId: r.requirementId,
        status: r.status,
        fileName: r.fileName,
      })),
      admissionRequirementsStatus: applicant.admissionRequirementsStatus,
    });

    await applicant.save();

    const savedApplicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
      status: "Active",
    });
    console.log("Applicant after save:", {
      admissionRequirements: savedApplicant.admissionRequirements.map((r) => ({
        requirementId: r.requirementId,
        status: r.status,
        fileName: r.fileName,
      })),
      admissionRequirementsStatus: savedApplicant.admissionRequirementsStatus,
    });

    res.json({
      message: "Admission requirements saved successfully",
      admissionRequirements: savedApplicant.admissionRequirements,
      admissionRequirementsStatus: savedApplicant.admissionRequirementsStatus,
      admissionAdminFirstStatus: savedApplicant.admissionAdminFirstStatus,
    });
  } catch (err) {
    console.error("Error saving admission requirements:", err);
    res
      .status(err.status || 500)
      .json({ error: err.message || "Failed to save admission requirements" });
  }
});

router.get("/fetch-admission-file/:email/:requirementId", async (req, res) => {
  try {
    const { email, requirementId } = req.params;
    const cleanEmail = email.trim().toLowerCase();
    const reqId = parseInt(requirementId);

    const applicant = await EnrolleeApplicant.findOne({
      email: cleanEmail,
      status: "Active",
    });

    if (!applicant) {
      return res.status(404).json({ error: "Active applicant not found" });
    }

    const requirement = applicant.admissionRequirements.find(
      (req) => req.requirementId === reqId
    );

    if (!requirement || !requirement.fileContent) {
      return res
        .status(404)
        .json({ error: "File not found for this requirement" });
    }

    const dataUri = `data:${
      requirement.fileType
    };base64,${requirement.fileContent.toString("base64")}`;

    res.json({
      dataUri,
      fileType: requirement.fileType,
      fileName: requirement.fileName,
    });
  } catch (err) {
    console.error("Error fetching admission file:", err);
    res
      .status(500)
      .json({ error: "Server error while fetching admission file" });
  }
});

async function getNextStudentIDSequence(academicYear) {
  const yearShort = academicYear.split("-")[0].slice(-2);
  const lastApplicant = await EnrolleeApplicant.findOne({
    studentID: new RegExp(`^${yearShort}-\\d{5}$`),
  }).sort({ studentID: -1 });

  if (!lastApplicant) {
    return `${yearShort}-00001`;
  }

  const lastNumber = parseInt(lastApplicant.studentID.split("-")[1], 10);
  const nextNumber = lastNumber + 1;
  return `${yearShort}-${nextNumber.toString().padStart(5, "0")}`;
}

async function getNextApplicantIDSequence(academicYear) {
  const yearFull = academicYear.split("-")[0];
  const lastApplicant = await EnrolleeApplicant.findOne({
    applicantID: new RegExp(`^${yearFull}-\\d{6}$`),
  }).sort({ applicantID: -1 });

  if (!lastApplicant) {
    return `${yearFull}-000001`;
  }

  const lastNumber = parseInt(lastApplicant.applicantID.split("-")[1], 10);
  const nextNumber = lastNumber + 1;
  return `${yearFull}-${nextNumber.toString().padStart(6, "0")}`;
}

function generateRandomPassword(length = 12) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
  return Array.from(
    { length },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

router.post("/", async (req, res) => {
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
      status: { $in: ["Pending Verification", "Active"] },
    });

    if (existingActive) {
      return res.status(400).json({
        error:
          "Email is already registered with an active or pending application",
      });
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
      status: "Pending Verification",
      otp,
      otpExpires,
      verificationExpires: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    await newApplicant.save();

    try {
      await sendOTP(email, firstName, otp);
    } catch (emailError) {
      console.error("Failed to send verification email:", emailError);
    }

    res.status(201).json({
      message:
        "Registration successful. Please check your email for verification code.",
      data: {
        studentID,
        applicantID,
        email,
        password: plainPassword,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error during registration" });
  }
});

router.get("/check-email/:email", async (req, res) => {
  try {
    const email = req.params.email.toLowerCase();
    const existing = await EnrolleeApplicant.findOne({
      email,
      status: { $in: ["Pending Verification", "Active"] },
    });

    if (existing) {
      return res.status(409).json({
        message:
          "Email is already registered with an active or pending application",
      });
    }

    const existingInactive = await EnrolleeApplicant.findOne({
      email,
      status: "Incomplete",
    });

    if (existingInactive) {
      return res.status(200).json({
        message: "Email is available (previous inactive account exists)",
        status: "Incomplete",
      });
    }

    return res.status(200).json({
      message: "Email is available",
      status: "Available",
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/personal-details/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const cleanEmail = email.trim().toLowerCase();

    const applicant = await EnrolleeApplicant.findOne({
      email: cleanEmail,
      status: "Active",
    }).sort({ createdAt: -1 });

    if (!applicant) {
      console.error(`No active applicant found for email: ${cleanEmail}`);
      return res.status(404).json({
        message: "Active account not found",
        errorType: "account_not_found",
      });
    }

    const responseData = {
      // Step 1: Personal Information
      prefix: applicant.prefix || "",
      firstName: applicant.firstName,
      middleName: applicant.middleName || "",
      lastName: applicant.lastName,
      suffix: applicant.suffix || "",
      gender: applicant.gender || "",
      lrnNo: applicant.lrnNo || "",
      civilStatus: applicant.civilStatus || "",
      religion: applicant.religion || "",
      birthDate: applicant.birthDate || "",
      countryOfBirth: applicant.countryOfBirth || "",
      birthPlaceCity: applicant.birthPlaceCity || "",
      birthPlaceProvince: applicant.birthPlaceProvince || "",
      nationality: applicant.nationality,
      // Step 2: Admission and Enrollment Requirements
      entryLevel: applicant.entryLevel || "",
      academicYear: applicant.academicYear || "",
      academicStrand: applicant.academicStrand || "",
      approvedAcademicStrand: applicant.approvedAcademicStrand || "",
      academicTerm: applicant.academicTerm || "",
      academicLevel: applicant.academicLevel || "",
      // Step 3: Contact Details
      presentHouseNo: applicant.presentHouseNo || "",
      presentBarangay: applicant.presentBarangay || "",
      presentCity: applicant.presentCity || "",
      presentProvince: applicant.presentProvince || "",
      presentPostalCode: applicant.presentPostalCode || "",
      permanentHouseNo: applicant.permanentHouseNo || "",
      permanentBarangay: applicant.permanentBarangay || "",
      permanentCity: applicant.permanentCity || "",
      permanentProvince: applicant.permanentProvince || "",
      permanentPostalCode: applicant.permanentPostalCode || "",
      mobile: applicant.mobile,
      telephoneNo: applicant.telephoneNo || "",
      emailAddress: applicant.emailAddress || applicant.email,
      // Step 4: Educational Background
      elementarySchoolName: applicant.elementarySchoolName || "",
      elementaryLastYearAttended: applicant.elementaryLastYearAttended || "",
      elementaryGeneralAverage: applicant.elementaryGeneralAverage || "",
      elementaryRemarks: applicant.elementaryRemarks || "",
      juniorHighSchoolName: applicant.juniorHighSchoolName || "",
      juniorHighLastYearAttended: applicant.juniorHighLastYearAttended || "",
      juniorHighGeneralAverage: applicant.juniorHighGeneralAverage || "",
      juniorHighRemarks: applicant.juniorHighRemarks || "",
      // Step 5: Family Background
      contacts: applicant.familyContacts || [],
      // Additional fields
      studentID: applicant.studentID,
      applicantID: applicant.applicantID,
      registrationStatus: applicant.registrationStatus,
      dob: applicant.dob,
      admissionAdminFirstStatus:
        applicant.admissionAdminFirstStatus || "On-going",
      admissionApprovalRejectMessage:
        applicant.admissionApprovalRejectMessage || "", // Added
    };

    console.log(`Personal details fetched for ${cleanEmail}:`, responseData);

    res.json(responseData);
  } catch (error) {
    console.error("Error fetching personal details:", error);
    res.status(500).json({
      message: "Server error while fetching personal details",
      errorType: "server_error",
    });
  }
});

// Update admission approval status (used by frontend)
router.post("/update-admission-approval-status", async (req, res) => {
  try {
    const { email, admissionApprovalStatus } = req.body;

    if (!sanitizeString(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (!["Incomplete", "Complete"].includes(admissionApprovalStatus)) {
      return res
        .status(400)
        .json({ error: "Invalid admission approval status" });
    }

    const applicant = await EnrolleeApplicant.findOneAndUpdate(
      { email: email.toLowerCase(), status: "Active" },
      {
        $set: {
          admissionApprovalStatus,
        },
      },
      { new: true }
    );

    if (!applicant) {
      return res.status(404).json({ error: "Active applicant not found" });
    }

    res.status(200).json({
      message: "Admission approval status updated successfully",
      admissionApprovalStatus: applicant.admissionApprovalStatus,
    });
  } catch (err) {
    console.error("Error updating admission approval status:", err);
    res
      .status(500)
      .json({ error: "Server error while updating admission approval status" });
  }
});

router.post("/update-admission-approval-admin", async (req, res) => {
  try {
    const {
      email,
      admissionApprovalAdminStatus,
      admissionApprovalRejectMessage,
    } = req.body;

    if (!sanitizeString(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }
    if (
      !["Pending", "Approved", "Rejected"].includes(
        admissionApprovalAdminStatus
      )
    ) {
      return res
        .status(400)
        .json({ error: "Invalid admission approval admin status" });
    }
    if (
      admissionApprovalAdminStatus === "Rejected" &&
      !sanitizeString(admissionApprovalRejectMessage)
    ) {
      return res
        .status(400)
        .json({ error: "Rejection message is required for rejected status" });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
      status: "Active",
    });
    if (!applicant) {
      return res.status(404).json({ error: "Active applicant not found" });
    }

    // Update fields
    applicant.admissionApprovalAdminStatus = admissionApprovalAdminStatus;

    // FIX: Explicitly set the admissionApprovalStatus based on the admissionApprovalAdminStatus
    if (admissionApprovalAdminStatus === "Approved") {
      applicant.admissionApprovalStatus = "Complete";
      applicant.admissionApprovalRejectMessage = null; // Clear rejection message
    } else if (admissionApprovalAdminStatus === "Rejected") {
      applicant.admissionApprovalStatus = "Incomplete";
      applicant.admissionApprovalRejectMessage = admissionApprovalRejectMessage;
    } else {
      applicant.admissionApprovalStatus = "Incomplete";
      applicant.admissionApprovalRejectMessage = null; // Clear for Pending
    }

    // Explicitly mark fields as modified to ensure pre-save hook runs
    applicant.markModified("admissionApprovalAdminStatus");
    applicant.markModified("admissionApprovalStatus");
    applicant.markModified("admissionApprovalRejectMessage");

    console.log("Before save:", {
      email,
      admissionApprovalAdminStatus: applicant.admissionApprovalAdminStatus,
      admissionApprovalStatus: applicant.admissionApprovalStatus,
      admissionApprovalRejectMessage: applicant.admissionApprovalRejectMessage,
    });

    // Save the document to trigger pre-save hook
    await applicant.save();

    // Re-fetch to confirm changes
    const updatedApplicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
      status: "Active",
    });

    console.log("After save:", {
      email,
      admissionApprovalAdminStatus:
        updatedApplicant.admissionApprovalAdminStatus,
      admissionApprovalStatus: updatedApplicant.admissionApprovalStatus,
      admissionApprovalRejectMessage:
        updatedApplicant.admissionApprovalRejectMessage,
    });

    // FIX: Ensure the response always contains the current statuses
    res.status(200).json({
      message: "Admission approval admin status updated successfully",
      admissionApprovalAdminStatus:
        updatedApplicant.admissionApprovalAdminStatus,
      admissionApprovalStatus: updatedApplicant.admissionApprovalStatus,
      admissionApprovalRejectMessage:
        updatedApplicant.admissionApprovalRejectMessage,
    });
  } catch (err) {
    console.error("Error updating admission approval admin status:", err);
    res.status(500).json({
      error: "Server error while updating admission approval admin status",
    });
  }
});

// Add a fix utility endpoint to ensure statuses are consistent (for admin use)
router.post("/sync-admission-approval-status", async (req, res) => {
  try {
    const { email } = req.body;

    if (!sanitizeString(email)) {
      return res.status(400).json({ error: "Valid email is required" });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email: email.toLowerCase(),
      status: "Active",
    });
    if (!applicant) {
      return res.status(404).json({ error: "Active applicant not found" });
    }

    // Manually sync the statuses
    applicant.syncAdmissionApprovalStatus();

    // Save changes
    await applicant.save();

    res.status(200).json({
      message: "Admission approval statuses synchronized successfully",
      admissionApprovalAdminStatus: applicant.admissionApprovalAdminStatus,
      admissionApprovalStatus: applicant.admissionApprovalStatus,
    });
  } catch (err) {
    console.error("Error syncing admission approval status:", err);
    res
      .status(500)
      .json({ error: "Server error while syncing admission approval status" });
  }
});

router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email,
      status: "Pending Verification",
    }).select("+temporaryPassword");

    if (!applicant) {
      return res
        .status(404)
        .json({ message: "Account not found or already verified" });
    }

    // Check if OTP has expired
    if (applicant.otpExpiry < new Date()) {
      return res.status(400).json({
        message: "OTP has expired. Please request a new one.",
      });
    }

    // Check for lockout
    if (
      applicant.otpAttemptLockout &&
      applicant.otpAttemptLockout > new Date()
    ) {
      const minutesLeft = Math.ceil(
        (applicant.otpAttemptLockout - new Date()) / (1000 * 60)
      );
      return res.status(429).json({
        message: `Too many attempts. Please try again in ${minutesLeft} minute(s).`,
        lockout: true,
      });
    }

    // Verify OTP
    if (applicant.otp !== otp) {
      applicant.otpAttempts = (applicant.otpAttempts || 0) + 1;
      applicant.lastOtpAttempt = new Date();

      if (applicant.otpAttempts >= 3) {
        applicant.otpAttemptLockout = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes lockout
        await applicant.save();
        return res.status(429).json({
          message:
            "Too many incorrect attempts. Please try again in 5 minutes.",
          lockout: true,
        });
      }

      await applicant.save();
      const attemptsLeft = 3 - applicant.otpAttempts;
      return res.status(400).json({
        message: `Invalid OTP. ${attemptsLeft} attempt(s) left.`,
        attemptsLeft,
      });
    }

    // OTP is valid - update applicant status
    applicant.status = "Active";
    applicant.otp = undefined;
    applicant.otpExpiry = undefined;
    applicant.otpAttempts = 0;
    applicant.otpAttemptLockout = undefined;
    applicant.lastOtpAttempt = undefined;

    // Get temporary password before clearing it
    const temporaryPassword = applicant.temporaryPassword;

    if (temporaryPassword) {
      try {
        // Send login credentials email
        await emailService.sendPasswordEmail(
          applicant.email,
          applicant.firstName,
          temporaryPassword
        );
        // Clear temporary password after sending
        applicant.temporaryPassword = undefined;
      } catch (emailError) {
        console.error("Failed to send password email:", emailError);
      }
    }

    await applicant.save();

    // Deactivate any other pending verifications for this email
    await EnrolleeApplicant.updateMany(
      {
        email,
        status: "Pending Verification",
        _id: { $ne: applicant._id },
      },
      {
        status: "Incomplete",
        inactiveReason: "New registration completed",
      }
    );

    return res.status(200).json({
      message:
        "Email verification successful. Your login credentials have been sent to your email.",
      data: {
        studentID: applicant.studentID,
        email: applicant.email,
        passwordSent: !!temporaryPassword,
      },
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    return res
      .status(500)
      .json({ message: "Server error during verification" });
  }
});

router.post("/verify-login-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email,
      status: "Active",
    })
      .sort({ createdAt: -1 })
      .select("+loginOtp +loginOtpExpires");

    if (!applicant) {
      return res
        .status(404)
        .json({ message: "Account not found or not active" });
    }

    if (
      applicant.loginOtpAttemptLockout &&
      applicant.loginOtpAttemptLockout > new Date()
    ) {
      const minutesLeft = Math.ceil(
        (applicant.loginOtpAttemptLockout - new Date()) / (1000 * 60)
      );
      return res.status(429).json({
        message: `Too many attempts. Please try again in ${minutesLeft} minute(s).`,
        lockout: true,
      });
    }

    if (
      !applicant.loginOtp ||
      !applicant.loginOtpExpires ||
      applicant.loginOtpExpires < new Date()
    ) {
      return res
        .status(400)
        .json({ message: "OTP has expired. Please request a new one." });
    }

    if (applicant.loginOtp !== otp) {
      applicant.loginOtpAttempts += 1;
      applicant.lastLoginOtpAttempt = new Date();

      if (applicant.loginOtpAttempts >= 3) {
        applicant.loginOtpAttemptLockout = new Date(Date.now() + 5 * 60 * 1000);
        await applicant.save();
        return res.status(429).json({
          message:
            "Too many incorrect attempts. Please try again in 5 minutes.",
          lockout: true,
        });
      }

      await applicant.save();
      const attemptsLeft = 3 - applicant.loginOtpAttempts;
      return res.status(400).json({
        message: `Invalid OTP. ${attemptsLeft} attempt(s) left.`,
        attemptsLeft,
      });
    }

    applicant.activityStatus = "Online";
    applicant.lastLogin = new Date();
    applicant.loginOtp = undefined;
    applicant.loginOtpExpires = undefined;
    applicant.loginOtpAttempts = 0;
    applicant.loginOtpAttemptLockout = undefined;
    applicant.lastLoginOtpAttempt = undefined;
    await applicant.save();

    res.json({
      message: "Login successful",
      email: applicant.email,
      firstName: applicant.firstName,
      studentID: applicant.studentID,
      applicantID: applicant.applicantID,
      activityStatus: applicant.activityStatus,
      loginAttempts: applicant.loginAttempts,
      lastLogin: applicant.lastLogin,
      lastLogout: applicant.lastLogout,
      createdAt: applicant.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Login OTP verification error:", error);
    return res
      .status(500)
      .json({ message: "Server error during login OTP verification" });
  }
});

router.get("/verification-status/:email", async (req, res) => {
  try {
    const { email } = req.params;

    const applicant = await EnrolleeApplicant.findOne({
      email,
    }).sort({ createdAt: -1 });

    if (!applicant) {
      return res.status(404).json({ message: "Account not found" });
    }

    const response = {
      status: applicant.status,
      firstName: applicant.firstName,
      createdAt: applicant.createdAt.toISOString(),
      isLockedOut:
        applicant.otpAttemptLockout && applicant.otpAttemptLockout > new Date(),
      lockoutTimeLeft: applicant.otpAttemptLockout
        ? Math.ceil((applicant.otpAttemptLockout - new Date()) / 1000)
        : 0,
      otpTimeLeft: applicant.otpExpires
        ? Math.ceil((applicant.otpExpires - new Date()) / 1000)
        : 0,
      attemptsLeft: 3 - (applicant.otpAttempts || 0),
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error getting verification status:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/login-otp-status/:email", async (req, res) => {
  try {
    const { email } = req.params;

    const applicant = await EnrolleeApplicant.findOne({
      email,
      status: "Active",
    }).sort({ createdAt: -1 });

    if (!applicant) {
      return res
        .status(404)
        .json({ message: "Account not found or not active" });
    }

    const response = {
      status: applicant.status,
      firstName: applicant.firstName,
      createdAt: applicant.createdAt.toISOString(),
      isLockedOut:
        applicant.loginOtpAttemptLockout &&
        applicant.loginOtpAttemptLockout > new Date(),
      lockoutTimeLeft: applicant.loginOtpAttemptLockout
        ? Math.ceil((applicant.loginOtpAttemptLockout - new Date()) / 1000)
        : 0,
      otpTimeLeft: applicant.loginOtpExpires
        ? Math.ceil((applicant.loginOtpExpires - new Date()) / 1000)
        : 0,
      attemptsLeft: 3 - (applicant.loginOtpAttempts || 0),
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error getting login OTP status:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/resend-login-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
        errorType: "validation",
      });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email,
      status: "Active",
    }).sort({ createdAt: -1 });

    if (!applicant) {
      return res
        .status(404)
        .json({ message: "Account not found or not active" });
    }

    if (
      applicant.loginOtpAttemptLockout &&
      applicant.loginOtpAttemptLockout > new Date()
    ) {
      const minutesLeft = Math.ceil(
        (applicant.loginOtpAttemptLockout - new Date()) / (1000 * 60)
      );
      return res.status(429).json({
        message: `Please wait ${minutesLeft} minute(s) before requesting a new OTP.`,
        lockout: true,
      });
    }

    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    applicant.loginOtp = otp;
    applicant.loginOtpExpires = new Date(Date.now() + 3 * 60 * 1000);
    applicant.loginOtpAttempts = 0;
    applicant.loginOtpAttemptLockout = undefined;
    applicant.lastLoginOtpAttempt = undefined;
    await applicant.save();

    await sendOTP(applicant.email, applicant.firstName, otp, "login");

    return res.status(200).json({
      message: "New verification code sent to your email",
      expiresIn: 180,
    });
  } catch (error) {
    console.error("Resend login OTP error:", error);
    return res
      .status(500)
      .json({ message: "Server error while resending OTP" });
  }
});

router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
        errorType: "validation",
      });
    }

    const applicant = await EnrolleeApplicant.findOne({ email });

    if (!applicant) {
      return res.status(404).json({
        message: "Account not found",
        errorType: "account_not_found",
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
        newPassword
      );

      return res.json({
        message:
          "Password reset successful. New password has been sent to your email.",
      });
    } catch (emailError) {
      console.error("Failed to send password email:", emailError);
      return res.status(500).json({
        message:
          "Password was reset but failed to send email. Please contact support.",
        errorType: "email_failed",
      });
    }
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({
      message: "Server error during password reset",
      errorType: "server_error",
    });
  }
});

router.post("/request-password-reset", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await EnrolleeApplicant.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Email not found" });
    }

    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    user.passwordResetOtp = otp;
    user.passwordResetOtpExpires = new Date(Date.now() + 3 * 60 * 1000);
    await user.save();

    await emailService.sendOTP(email, user.firstName, otp);

    res.json({
      success: true,
      message: "Verification code sent to your email",
    });
  } catch (error) {
    res.status(500).json({
      message: error.message || "Failed to process password reset request",
    });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP, and new password are required",
      });
    }

    const user = await EnrolleeApplicant.findOne({ email }).select(
      "+passwordResetOtp +passwordResetOtpExpires +password"
    );

    if (!user) {
      return res.status(404).json({ message: "Email not found" });
    }

    if (!user.passwordResetOtp || user.passwordResetOtp !== otp) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    if (user.passwordResetOtpExpires < new Date()) {
      return res.status(400).json({ message: "Verification code has expired" });
    }

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
      message:
        "Password reset successful. Your new password has been sent to your email.",
    });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({
      message: error.message || "Failed to reset password",
    });
  }
});

router.post("/resend-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
        errorType: "validation",
      });
    }

    const applicant = await EnrolleeApplicant.findOne({
      email,
      status: "Pending Verification",
    }).sort({ createdAt: -1 });

    if (!applicant) {
      return res
        .status(404)
        .json({ message: "Account not found or already verified" });
    }

    if (
      applicant.otpAttemptLockout &&
      applicant.otpAttemptLockout > new Date()
    ) {
      const minutesLeft = Math.ceil(
        (applicant.otpAttemptLockout - new Date()) / (1000 * 60)
      );
      return res.status(429).json({
        message: `Please wait ${minutesLeft} minute(s) before requesting a new OTP.`,
        lockout: true,
      });
    }

    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    applicant.otp = otp;
    applicant.otpExpires = new Date(Date.now() + 3 * 60 * 1000);
    applicant.otpAttempts = 0;
    applicant.otpAttemptLockout = undefined;
    applicant.lastOtpAttempt = undefined;
    await applicant.save();

    await sendOTP(email, applicant.firstName, otp);

    return res.status(200).json({
      message: "New verification code sent to your email",
      expiresIn: 180,
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res
      .status(500)
      .json({ message: "Server error while resending OTP" });
  }
});

router.get("/password-reset-status/:email", async (req, res) => {
  try {
    const { email } = req.params;
    const applicant = await EnrolleeApplicant.findOne({ email });

    if (!applicant) {
      return res.status(404).json({ message: "Account not found" });
    }

    const response = {
      status: applicant.status,
      firstName: applicant.firstName,
      isLockedOut: false,
      lockoutTimeLeft: 0,
      otpTimeLeft: applicant.passwordResetOtpExpires
        ? Math.ceil((applicant.passwordResetOtpExpires - new Date()) / 1000)
        : 0,
      attemptsLeft: 3,
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error getting password reset status:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
        errorType: "validation",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    const applicant = await EnrolleeApplicant.findOne({
      email: cleanEmail,
      status: "Active",
    })
      .sort({ createdAt: -1 })
      .select("+password");

    if (!applicant) {
      const pendingAccount = await EnrolleeApplicant.findOne({
        email: cleanEmail,
        status: "Pending Verification",
      }).sort({ createdAt: -1 });

      if (pendingAccount) {
        if (pendingAccount.verificationExpires < new Date()) {
          pendingAccount.status = "Incomplete";
          pendingAccount.inactiveReason = "Auto-cleaned expired verification";
          await pendingAccount.save();
          return res.status(403).json({
            message: "Verification period expired. Please register again.",
            errorType: "verification_expired",
          });
        }
        return res.status(403).json({
          message: "Account requires email verification",
          errorType: "pending_verification",
          email: pendingAccount.email,
          firstName: pendingAccount.firstName,
        });
      }

      const inactiveAccount = await EnrolleeApplicant.findOne({
        email: cleanEmail,
        status: "Incomplete",
      });

      if (inactiveAccount) {
        return res.status(403).json({
          message:
            "Account is inactive. Reason: " +
            (inactiveAccount.inactiveReason || "Unknown reason"),
          errorType: "account_inactive",
        });
      }

      return res.status(404).json({
        message: "Account not found",
        errorType: "account_not_found",
      });
    }

    applicant.loginAttempts += 1;
    await applicant.save();

    const isMatch = await bcrypt.compare(cleanPassword, applicant.password);

    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
        errorType: "authentication",
      });
    }

    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    applicant.loginOtp = otp;
    applicant.loginOtpExpires = new Date(Date.now() + 3 * 60 * 1000);
    applicant.loginOtpAttempts = 0;
    applicant.loginOtpAttemptLockout = undefined;
    applicant.lastLoginOtpAttempt = undefined;
    await applicant.save();

    await sendOTP(applicant.email, applicant.firstName, otp, "login");

    res.json({
      message: "OTP sent for login verification",
      email: applicant.email,
      firstName: applicant.firstName,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      message: "Server error during login",
      errorType: "server_error",
    });
  }
});

// Forgot password route - Send OTP for verification
router.post("/forgot-password/applicant", async (req, res) => {
  try {
    // Validate request body
    const { email } = req.body;
    console.log("Forgot password request for email:", email);
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
    }

    // Check if user exists
    const applicant = await EnrolleeApplicant.findOne({ email });
    if (!applicant) {
      // For security reasons, we still return a success response
      // This prevents enumeration attacks while revealing whether an email exists
      return res.status(200).json({
        success: true,
        message:
          "If your email is registered, you will receive a password reset OTP",
      });
    }

    // Generate a secure 6-digit OTP
    const otp = otpGenerator.generate(6, {
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
      digits: true,
    });

    // Set OTP expiry time (20 minutes)
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 20);

    // Store OTP in database
    // First, delete any existing OTP for this email
    await PendingOTP.deleteMany({ email });

    // Then create a new OTP record with simplified structure
    const otpRecord = await PendingOTP.create({
      email,
      otp,
      otpExpiry,
      verified: false,
      firstName: applicant.firstName,
      lastName: applicant.lastName,
    });

    console.log("OTP created:", {
      id: otpRecord._id,
      email: otpRecord.email,
      otp: otpRecord.otp,
      expires: otpRecord.otpExpiry,
    });

    // Get email config
    const config = require('../config/emailConfig');
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
      service: config.service,
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.auth.user,
        pass: config.auth.pass,
      },
    });

    // Create improved email template with OTP
    const otpEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
        <p>Hello ${applicant.firstName},</p>
        <p>We received a request to reset your password. Please use the following OTP code to verify your identity:</p>
        <div style="text-align: center; margin: 30px 0;">
          <div style="font-size: 24px; letter-spacing: 5px; font-weight: bold; background-color: #f5f5f5; padding: 15px; border-radius: 5px; display: inline-block;">${otp}</div>
        </div>
        <p>This code will expire in 20 minutes.</p>
        <p>If you did not request a password reset, please ignore this email or contact our support team.</p>
        <p>Regards,<br>JuanEMS Support Team</p>
      </div>
    `;

    // Send OTP email
    await transporter.sendMail({
      from: `${config.senderName} <${config.sender}>`,
      to: email,
      subject: "Password Reset OTP",
      html: otpEmailHtml,
    });

    console.log("Password reset OTP email sent to:", email);

    // Return success response
    return res.status(200).json({
      success: true,
      message:
        "If your email is registered, you will receive a password reset OTP",
      // For development purposes only, remove in production
      otp: otp
    });
  } catch (error) {
    console.error("Error in forgot password process:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during the password reset process",
      error: error.message,
    });
  }
});

// Verify OTP and reset password route
router.post("/verify-reset-password-otp", async (req, res) => {
  try {
    // Validate request body
    const { email, otp } = req.body;
    console.log(email, otp);
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP are required",
      });
    }

    // Find the OTP record
    const otpRecord = await PendingOTP.findOne({
      email,
      otp,
    });
    console.log(otpRecord);

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    // Check if OTP is already verified
    if (otpRecord.verified) {
      return res.status(400).json({
        success: false,
        message: "OTP has already been verified",
      });
    }

    // Mark OTP as verified
    otpRecord.verified = true;
    await otpRecord.save();

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully. You can now reset your password.",
      email: email,
      verified: true
    });
  } catch (error) {
    console.error("Error in OTP verification process:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during the OTP verification process",
      error: error.message,
    });
  }
});

router.post("/reset-password/applicant", async (req, res) => {
  try {
    // Validate request body
    const { email, newPassword } = req.body;
    console.log("Reset password request for email:", email);
    console.log("New password:", newPassword);
  
    if (!email || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email and new password are required",
      });
    }

    // Find the verified OTP record - simplified query without purpose field
    const otpRecord = await PendingOTP.findOne({
      email,
      otpExpiry: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res.status(400).json({
        success: false,
        message: "Please verify your OTP first or your verification has expired",
      });
    }

    // Find the applicant
    const applicant = await EnrolleeApplicant.findOne({ email });
    if (!applicant) {
      return res.status(404).json({
        success: false,
        message: "Applicant not found",
      });
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the password
    applicant.password = hashedPassword;
    await applicant.save();
    console.log("Password updated successfully for:", email);

    // Delete the OTP record
    await PendingOTP.deleteMany({ email });
    console.log("OTP records deleted for:", email);

    // Get email config
    const config = require('../config/emailConfig');
    const nodemailer = require('nodemailer');
    
    const transporter = nodemailer.createTransport({
      service: config.service,
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.auth.user,
        pass: config.auth.pass,
      },
    });

    // Improved password reset confirmation email
    const confirmationEmailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333; text-align: center;">Password Changed Successfully</h2>
        <p>Hello ${applicant.firstName},</p>
        <p>Your password has been successfully reset.</p>
        <p>You can now log in to your account with your new password.</p>
        <p>If you did not make this change, please contact our support team immediately.</p>
        <p>Regards,<br>JuanEMS Support Team</p>
      </div>
    `;

    await transporter.sendMail({
      from: `${config.senderName} <${config.sender}>`,
      to: email,
      subject: "Password Changed Successfully",
      html: confirmationEmailHtml,
    });
    console.log("Password reset confirmation email sent to:", email);

    return res.status(200).json({
      success: true,
      message: "Password reset successful",
    });
  } catch (error) {
    console.error("Error in reset password process:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred during the password reset process",
      error: error.message,
    });
  }
});

  module.exports = router;
