const express = require('express');
const GuestUser = require('../models/guestUser');
const GuestQueueData = require('../models/guestQueueData');
const router = express.Router();

// Route to create guest user and queue data
router.post('/create', async (req, res) => {
  const { name, mobileNumber } = req.body; // We only need name and mobileNumber

  console.log('Received data:', { name, mobileNumber });

  try {
    // Check if the user already exists
    let user = await GuestUser.findOne({ mobileNumber });
    if (!user) {
      // Create a new guest user if they don't exist
      user = new GuestUser({ name, mobileNumber });
      await user.save();
    }

    // Only save the guest user without the department
    res.status(201).json({
      message: 'Guest user created successfully',
      data: user
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating guest user', error: error.message });
  }
});

// Route to create guest queue data
router.post('/createQueueData', async (req, res) => {
  const { guestUserId, department, queueNumber } = req.body;

  try {
    // Validate department and queueNumber (we only need this when creating queue data)
    if (!department || !queueNumber) {
      return res.status(400).json({ message: 'Department and queueNumber are required' });
    }

    // Create a new queue data entry for the user
    const newQueueData = new GuestQueueData({
      guestUserId,
      department,
      queueNumber
    });

    await newQueueData.save();

    res.status(201).json({
      message: 'Guest queue data created successfully',
      data: newQueueData
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating guest queue data', error: error.message });
  }
});

// Route to update the queue number by admin (e.g., when the admin moves to the next queue)
router.put('/updateQueue/:id', async (req, res) => {
  const { queueNumber } = req.body; // New queue number provided by admin

  try {
    const updatedQueueData = await GuestQueueData.findByIdAndUpdate(
      req.params.id,
      { queueNumber },
      { new: true }
    );
    res.status(200).json({
      message: 'Queue number updated successfully',
      data: updatedQueueData
    });
  } catch (error) {
    res.status(500).json({ message: 'Error updating queue number', error: error.message });
  }
});

module.exports = router;
