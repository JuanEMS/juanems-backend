const express = require('express');
const router = express.Router();
const EnrolleeApplicant = require('../models/EnrolleeApplicant');

// Helper function to validate and sanitize string inputs
const sanitizeString = (value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

// Update enrollment approval status (used by frontend)
router.post('/update-enrollment-approval-status', async (req, res) => {
  try {
    const { email, enrollmentApprovalStatus } = req.body;

    if (!sanitizeString(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!['Incomplete', 'Complete'].includes(enrollmentApprovalStatus)) {
      return res.status(400).json({ error: 'Invalid enrollment approval status' });
    }

    const applicant = await EnrolleeApplicant.findOneAndUpdate(
      { email: email.toLowerCase(), status: 'Active' },
      {
        $set: {
          enrollmentApprovalStatus,
        },
      },
      { new: true }
    );

    if (!applicant) {
      return res.status(404).json({ error: 'Active applicant not found' });
    }

    res.status(200).json({
      message: 'Enrollment approval status updated successfully',
      enrollmentApprovalStatus: applicant.enrollmentApprovalStatus,
    });
  } catch (err) {
    console.error('Error updating enrollment approval status:', err);
    res.status(500).json({ error: 'Server error while updating enrollment approval status' });
  }
});

// Update enrollment approval admin status (used by admin)
router.post('/update-enrollment-approval-admin', async (req, res) => {
  try {
    const { email, enrollmentApprovalAdminStatus, enrollmentApprovalRejectMessage } = req.body;

    if (!sanitizeString(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!['Pending', 'Approved', 'Rejected'].includes(enrollmentApprovalAdminStatus)) {
      return res.status(400).json({ error: 'Invalid enrollment approval admin status' });
    }
    if (enrollmentApprovalAdminStatus === 'Rejected' && !sanitizeString(enrollmentApprovalRejectMessage)) {
      return res.status(400).json({ error: 'Rejection message is required for rejected status' });
    }

    const applicant = await EnrolleeApplicant.findOne({ email: email.toLowerCase(), status: 'Active' });
    if (!applicant) {
      return res.status(404).json({ error: 'Active applicant not found' });
    }

    // Update fields
    applicant.enrollmentApprovalAdminStatus = enrollmentApprovalAdminStatus;

    if (enrollmentApprovalAdminStatus === 'Approved') {
      applicant.enrollmentApprovalStatus = 'Complete';
      applicant.enrollmentApprovalRejectMessage = null;
    } else if (enrollmentApprovalAdminStatus === 'Rejected') {
      applicant.enrollmentApprovalStatus = 'Incomplete';
      applicant.enrollmentApprovalRejectMessage = enrollmentApprovalRejectMessage;
    } else {
      applicant.enrollmentApprovalStatus = 'Incomplete';
      applicant.enrollmentApprovalRejectMessage = null;
    }

    // Explicitly mark fields as modified to ensure pre-save hook runs
    applicant.markModified('enrollmentApprovalAdminStatus');
    applicant.markModified('enrollmentApprovalStatus');
    applicant.markModified('enrollmentApprovalRejectMessage');

    console.log('Before save:', {
      email,
      enrollmentApprovalAdminStatus: applicant.enrollmentApprovalAdminStatus,
      enrollmentApprovalStatus: applicant.enrollmentApprovalStatus,
      enrollmentApprovalRejectMessage: applicant.enrollmentApprovalRejectMessage,
    });

    await applicant.save();

    const updatedApplicant = await EnrolleeApplicant.findOne({ email: email.toLowerCase(), status: 'Active' });

    console.log('After save:', {
      email,
      enrollmentApprovalAdminStatus: updatedApplicant.enrollmentApprovalAdminStatus,
      enrollmentApprovalStatus: updatedApplicant.enrollmentApprovalStatus,
      enrollmentApprovalRejectMessage: updatedApplicant.enrollmentApprovalRejectMessage,
    });

    res.status(200).json({
      message: 'Enrollment approval admin status updated successfully',
      enrollmentApprovalAdminStatus: updatedApplicant.enrollmentApprovalAdminStatus,
      enrollmentApprovalStatus: updatedApplicant.enrollmentApprovalStatus,
      enrollmentApprovalRejectMessage: updatedApplicant.enrollmentApprovalRejectMessage,
    });
  } catch (err) {
    console.error('Error updating enrollment approval admin status:', err);
    res.status(500).json({ error: 'Server error while updating enrollment approval admin status' });
  }
});

// Sync enrollment approval status (for admin use)
router.post('/sync-enrollment-approval-status', async (req, res) => {
  try {
    const { email } = req.body;

    if (!sanitizeString(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const applicant = await EnrolleeApplicant.findOne({ email: email.toLowerCase(), status: 'Active' });
    if (!applicant) {
      return res.status(404).json({ error: 'Active applicant not found' });
    }

    applicant.syncEnrollmentApprovalStatus();
    await applicant.save();

    res.status(200).json({
      message: 'Enrollment approval statuses synchronized successfully',
      enrollmentApprovalAdminStatus: applicant.enrollmentApprovalAdminStatus,
      enrollmentApprovalStatus: applicant.enrollmentApprovalStatus,
    });
  } catch (err) {
    console.error('Error syncing enrollment approval status:', err);
    res.status(500).json({ error: 'Server error while syncing enrollment approval status' });
  }
});

module.exports = router;