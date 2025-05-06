const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const ViewedAnnouncement = require('../models/ViewedAnnouncement');
const mongoose = require('mongoose');

// Get all active announcements with pagination, fuzzy search, and unviewed count
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
  const { subject, content, startDate, endDate, audience } = req.body;
  const errors = [];

  if (!subject) errors.push('Subject is required');
  if (!content) errors.push('Content is required');
  if (!startDate || isNaN(new Date(startDate))) errors.push('Valid start date is required');
  if (!endDate || isNaN(new Date(endDate))) errors.push('Valid end date is required');
  
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