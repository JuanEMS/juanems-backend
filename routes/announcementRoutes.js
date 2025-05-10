const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const ViewedAnnouncement = require('../models/ViewedAnnouncement');
const mongoose = require('mongoose');

// Get all announcements (no filters, no pagination)
router.get('/all', async (req, res) => {
  try {
    // Make sure the Announcement model is properly imported and defined
    if (!Announcement || typeof Announcement.find !== 'function') {
      console.error('Announcement model not properly initialized:', Announcement);
      return res.status(500).json({
        success: false,
        message: 'Server error: Announcement model not properly initialized'
      });
    }

    // Use a safe query with no ID parameters to avoid ObjectId casting issues
    const announcements = await Announcement.find({
      // Filter for active announcements within date range
      status: "Active",
      startDate: { $lte: new Date() }, // Started before or at current time
      endDate: { $gte: new Date() }    // Ends after or at current time
    })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    // Add proper error handling for empty results
    if (!announcements || announcements.length === 0) {
      return res.status(200).json({ // Still return 200 for empty array
        success: true,
        total: 0,
        announcements: []
      });
    }

    // Additional logging to help debug
    console.log(`Found ${announcements.length} announcements`);

    // Return a properly formatted response
    res.json({
      success: true,
      total: announcements.length,
      announcements
    });
  } catch (err) {
    console.error('Error fetching all announcements:', err);

    // More detailed error response with specific handling for ObjectId errors
    if (err.name === 'BSONError' || err.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid ID format in request',
        error: err.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching all announcements',
      error: err.message,
    });
  }
});

// Get announcements by audience type
router.get('/audience/:audience', async (req, res) => {
  try {
    const { audience } = req.params;

    const announcements = await Announcement.find({
      audience: audience,
      status: "Active",
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      total: announcements.length,
      announcements
    });
  } catch (err) {
    console.error(`Error fetching announcements for audience ${req.params.audience}:`, err);
    res.status(500).json({
      success: false,
      message: `Server error while fetching announcements for audience ${req.params.audience}`,
      error: err.message
    });
  }
});

// Get all active announcements with pagination, fuzzy search, and unviewed count
// filtered audience: Applicants Only
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const search = req.query.search || '';
    const sortBy = req.query.sortBy || 'startDate';
    const sortOrder = req.query.sortOrder || 'desc';
    const userEmail = req.query.userEmail; // Add userEmail to query params

    const status = 'Active';
    const audience = 'Applicants';

    const query = {
      status: { $eq: status },
      audience: { $eq: audience },
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    };

    if (search && search.trim() !== '') {
      query.$or = [
        { subject: { $regex: escapeRegex(search), $options: 'i' } },
        { content: { $regex: escapeRegex(search), $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const announcements = await Announcement.find(query)
      .sort(sort)
      .limit(limit)
      .skip((page - 1) * limit)
      .lean()
      .exec();

    const count = await Announcement.countDocuments(query);

    // Get unviewed announcements count
    let unviewedCount = 0;
    if (userEmail) {
      const viewedAnnouncements = await ViewedAnnouncement.find({ userEmail })
        .distinct('announcementId');

      const allActiveAnnouncements = await Announcement.find({
        status: 'Active',
        audience: 'Applicants',
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() }
      }).select('_id');

      unviewedCount = allActiveAnnouncements.filter(
        ann => !viewedAnnouncements.includes(ann._id.toString())
      ).length;
    }

    res.json({
      success: true,
      announcements,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalItems: count,
      unviewedCount,
      filterApplied: {
        status: status,
        audience: audience
      }
    });
  } catch (err) {
    console.error('Error in announcements route:', err);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching announcements',
      error: err.message
    });
  }
});

// Mark announcement as viewed
router.post('/view', async (req, res) => {
  try {
    const { userEmail, announcementId } = req.body;

    if (!userEmail || !announcementId) {
      return res.status(400).json({
        success: false,
        message: 'User email and announcement ID are required'
      });
    }

    const existingView = await ViewedAnnouncement.findOne({
      userEmail,
      announcementId
    });

    if (!existingView) {
      await ViewedAnnouncement.create({
        userEmail,
        announcementId
      });
    }

    res.json({
      success: true,
      message: 'Announcement marked as viewed'
    });
  } catch (err) {
    console.error('Error marking announcement as viewed:', err);
    res.status(500).json({
      success: false,
      message: 'Server error while marking announcement as viewed'
    });
  }
});

// Get announcements created by a specific user
router.get('/by-user/:userID', async (req, res) => {
  try {
    const { userID } = req.params;

    if (!userID) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Find all announcements created by this user
    // Note: We don't filter by status/date here - we want to show all announcements 
    // created by the user regardless of status (Active, Draft, Inactive)
    const announcements = await Announcement.find({ userID })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      total: announcements.length,
      announcements
    });
  } catch (err) {
    console.error(`Error fetching announcements for user ${req.params.userID}:`, err);
    res.status(500).json({
      success: false,
      message: `Server error while fetching announcements for user ${req.params.userID}`,
      error: err.message
    });
  }
});

// Existing routes (unchanged)
router.get('/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }
    res.json({
      success: true,
      announcement
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching announcement'
    });
  }
});

const validateAnnouncement = (req, res, next) => {
  const { subject, content, startDate, endDate, audience, userID } = req.body;
  const errors = [];

  if (!subject) errors.push('Subject is required');
  if (!content) errors.push('Content is required');
  if (!startDate || isNaN(new Date(startDate))) errors.push('Valid start date is required');
  if (!endDate || isNaN(new Date(endDate))) errors.push('Valid end date is required');

  // Added userID validation
  if (!userID) errors.push('User ID is required');

  // Fixed validation to match schema enum values
  const validAudiences = [
    'All Users', 'Students', 'Faculty', 'Applicants',
    'Staffs', 'Admissions', 'Registrar', 'Accounting',
    'IT', 'Administration'
  ];

  if (!validAudiences.includes(audience)) {
    errors.push('Invalid audience type');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors
    });
  }

  next();
};

// Utility: remove fields with null or undefined values
const cleanObject = (obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== null && v !== undefined)
  );
};

router.post('/create-announcement', validateAnnouncement, async (req, res) => {
  try {
    console.log('Request body:', req.body);
    const cleanedBody = cleanObject(req.body);

    const now = new Date();
    const startDate = new Date(cleanedBody.startDate);
    const endDate = new Date(cleanedBody.endDate);

    let status = 'Draft'; // default

    if (now >= startDate && now <= endDate) {
      status = 'Active';
    } else if (now > endDate) {
      status = 'Inactive';
    }

    const newAnnouncement = new Announcement({
      ...cleanedBody,
      status
    });

    await newAnnouncement.save();

    res.status(201).json({
      success: true,
      announcement: newAnnouncement
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error while creating announcement'
    });
  }
});

// Update announcement
router.put('/update-announcement/:id', validateAnnouncement, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = cleanObject(req.body);
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement ID format'
      });
    }
    
    // Parse dates properly to ensure correct comparison
    const startDate = new Date(updateData.startDate);
    const endDate = new Date(updateData.endDate);
    
    // Explicit date validation before updating
    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: 'End date must be after start date',
        errors: ['End date must be after start date']
      });
    }
    
    // Calculate status based on dates
    const now = new Date();
    let status = 'Draft'; // default

    if (now >= startDate && now <= endDate) {
      status = 'Active';
    } else if (now > endDate) {
      status = 'Inactive';
    } else {
      // Future announcement
      status = 'Draft';
    }
    
    // Add status to update data
    updateData.status = status;
    
    // Find and update the announcement with runValidators:false to bypass model validation
    // since we've already done our validation manually
    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: false }
    );

    if (!updatedAnnouncement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    res.json({
      success: true,
      message: 'Announcement updated successfully',
      announcement: updatedAnnouncement
    });
  } catch (err) {
    console.error('Error updating announcement:', err);
    
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(err.errors).map(e => e.message)
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while updating announcement',
      error: err.message
    });
  }
});

// Archive announcement (set status to Inactive)
router.put('/archive/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement ID format'
      });
    }
    
    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      id,
      { status: 'Inactive', updatedAt: new Date() },
      { new: true }
    );

    if (!updatedAnnouncement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    res.json({
      success: true,
      message: 'Announcement archived successfully',
      announcement: updatedAnnouncement
    });
  } catch (err) {
    console.error('Error archiving announcement:', err);
    res.status(500).json({
      success: false,
      message: 'Server error while archiving announcement',
      error: err.message
    });
  }
});

// Unarchive announcement (check dates and set appropriate status)
router.put('/unarchive/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid announcement ID format'
      });
    }
    
    // First get the announcement to check its dates
    const announcement = await Announcement.findById(id);
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }
    
    // Calculate appropriate status based on current date and announcement dates
    const now = new Date();
    const startDate = new Date(announcement.startDate);
    const endDate = new Date(announcement.endDate);
    
    let newStatus = 'Draft'; // default
    
    if (now >= startDate && now <= endDate) {
      newStatus = 'Active';
    } else if (now > endDate) {
      // If end date has passed, it should remain inactive
      newStatus = 'Inactive';
      return res.status(400).json({
        success: false,
        message: 'Cannot unarchive: announcement period has expired. Please update the date range first.'
      });
    } else {
      // Future announcement
      newStatus = 'Draft';
    }
    
    const updatedAnnouncement = await Announcement.findByIdAndUpdate(
      id,
      { status: newStatus, updatedAt: new Date() },
      { new: true }
    );

    res.json({
      success: true,
      message: `Announcement unarchived successfully with status: ${newStatus}`,
      announcement: updatedAnnouncement
    });
  } catch (err) {
    console.error('Error unarchiving announcement:', err);
    res.status(500).json({
      success: false,
      message: 'Server error while unarchiving announcement',
      error: err.message
    });
  }
});

router.put('/:id', validateAnnouncement, async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }

    res.json({
      success: true,
      announcement
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error while updating announcement'
    });
  }
});

// Keep the delete route for admin purposes, but it should be used rarely
router.delete('/:id', async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }
    res.json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting announcement'
    });
  }
});

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

module.exports = router;