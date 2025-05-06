const express = require('express');
const router = express.Router();
const SystemLogs = require('../models/SystemLog'); 

// POST /api/admin/system-logs - Create a new log
router.post('/', async (req, res) => {
  try {
    const { userID, accountName, role, action, detail } = req.body;

    // Basic validation (can be expanded)
    if (!userID || !accountName || !role || !action || !detail) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    const newLog = new SystemLogs({ userID, accountName, role, action, detail });
    await newLog.save();

    res.status(201).json({ message: 'System log created successfully.', log: newLog });
  } catch (error) {
    console.error('Error creating system log:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

// GET /api/admin/system-logs - Fetch all logs
router.get('/', async (req, res) => {
  try {
    const logs = await SystemLogs.find().sort({ createdAt: -1 }); // Most recent first
    res.status(200).json(logs);
  } catch (error) {
    console.error('Error fetching system logs:', error);
    res.status(500).json({ message: 'Internal server error.' });
  }
});

module.exports = router;
