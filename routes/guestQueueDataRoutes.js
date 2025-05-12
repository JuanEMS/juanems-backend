const express = require('express');
const GuestQueueData = require('../models/guestQueueData');
const ArchivedGuestUsers = require('../models/archivedGuestUsers');
const router = express.Router();

// Helper function to archive queue data
const archiveQueueData = async (queueData, exitReason = 'user_left') => {
  const now = new Date();
  const archiveDate = now.toISOString().split('T')[0];

  const archivedGuest = new ArchivedGuestUsers({
    ...queueData.toObject(),
    _id: undefined, // Let MongoDB create new ID
    archivedAt: now,
    archiveDate,
    exitReason,
    status: exitReason === 'served' ? 'completed' : 'left',
    originalQueueId: queueData._id,
    originalQueueNumber: queueData.queueNumber // Add this line to fix the validation error
  });

  await archivedGuest.save();
  return archivedGuest;
};

// Helper function to generate queue numbers
const generateQueueNumber = async (department) => {
  // Get the current date in YYYY-MM-DD format for checking archives
  const today = new Date().toISOString().split('T')[0];

  // Set department prefix
  let queuePrefix = '';
  switch (department) {
    case 'Admissions': queuePrefix = 'AD'; break;
    case 'Registrar': queuePrefix = 'RE'; break;
    case 'Accounting': queuePrefix = 'AC'; break;
    default: queuePrefix = department.substring(0, 2).toUpperCase();
  }

  // First, check active queues
  const lastActiveQueue = await GuestQueueData.findOne({ department })
    .sort({ queueNumber: -1 })
    .select('queueNumber');

  // Then, check archived queues from today
  const lastArchivedQueue = await ArchivedGuestUsers.findOne({
    department,
    archiveDate: today
  })
    .sort({ originalQueueNumber: -1 })
    .select('originalQueueNumber');

  // Determine the highest queue number between active and archived
  let lastActiveNumber = lastActiveQueue ?
    parseInt(lastActiveQueue.queueNumber.slice(queuePrefix.length)) || 0 : 0;

  let lastArchivedNumber = lastArchivedQueue ?
    parseInt(lastArchivedQueue.originalQueueNumber.slice(queuePrefix.length)) || 0 : 0;

  // Use the maximum value between active and archived numbers
  const lastNumber = Math.max(lastActiveNumber, lastArchivedNumber);

  // Return next queue number
  return `${queuePrefix}${lastNumber + 1}`;
};

// Create new queue number
router.post('/create', async (req, res) => {
  const { guestUserId, department } = req.body;

  if (!guestUserId || !department) {
    return res.status(400).json({ message: 'guestUserId and department are required' });
  }

  try {
    // Archive any existing active queue for this user
    const existingQueue = await GuestQueueData.findOne({ guestUserId });
    if (existingQueue) {
      await archiveQueueData(existingQueue, 'rejoined');
      await GuestQueueData.deleteOne({ _id: existingQueue._id });
    }

    // Generate new queue number
    const queueNumber = await generateQueueNumber(department);

    const newQueueData = new GuestQueueData({
      guestUserId,
      department,
      queueNumber,
      status: 'pending',
      createdAt: new Date()
    });

    await newQueueData.save();

    res.status(201).json({
      message: 'Guest queue data created successfully',
      data: newQueueData,
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error creating guest queue data',
      error: error.message
    });
  }
});

// Archive endpoint
router.post('/archive', async (req, res) => {
  try {
    const { queueNumber, originalQueueNumber, exitReason = 'user_left', guestUserId } = req.body;

    // Find the active queue record
    const guestData = await GuestQueueData.findOne({
      $or: [
        { queueNumber: originalQueueNumber },
        { guestUserId }
      ]
    });

    if (!guestData) {
      return res.status(404).json({ message: 'Queue data not found' });
    }

    const now = new Date();
    const archivedGuest = new ArchivedGuestUsers({
      ...guestData.toObject(),
      queueNumber, // This is the unique version with timestamp
      originalQueueNumber: guestData.queueNumber, // Make sure this is set
      archivedAt: now,
      archiveDate: now.toISOString().split('T')[0],
      exitReason,
      status: 'left'
    });

    await archivedGuest.save();
    await GuestQueueData.deleteOne({ _id: guestData._id });

    res.status(201).json({
      message: 'Guest data archived successfully',
      data: archivedGuest
    });
  } catch (error) {
    console.error('Archive error:', error);
    res.status(500).json({
      message: 'Error archiving guest data',
      error: error.message
    });
  }
});

// Get all pending queues by department
router.get('/pending', async (req, res) => {
  const { department } = req.query;

  try {
    const queues = await GuestQueueData.find({
      department,
      status: 'pending'
    }).sort({ queueNumber: 1 });

    res.json(queues);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// Get currently serving queue
router.get('/currentlyServing', async (req, res) => {
  const { department } = req.query;

  if (!department) {
    return res.status(400).json({ message: 'Department is required' });
  }

  try {
    const current = await GuestQueueData.findOne({
      department,
      status: 'accepted'
    });

    if (current) {
      res.json({
        queueNumber: current.queueNumber,
        department,
        guestUserId: current.guestUserId,
        servingStartTime: current.servingStartTime
      });
    } else {
      res.json({
        queueNumber: null,
        department
      });
    }
  } catch (err) {
    console.error('Error fetching currently serving queue:', err);
    res.status(500).json({
      message: 'Server Error',
      error: err.message
    });
  }
});


// Get queue status
router.get('/status/:queueNumber', async (req, res) => {
  const { queueNumber } = req.params;

  try {
    const queue = await GuestQueueData.findOne({ queueNumber });
    res.json({ status: queue?.status || 'pending' });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// Finish current queue and move to next
router.put('/finishQueue/:queueNumber', async (req, res) => {
  const { queueNumber } = req.params;

  try {
    const currentQueue = await GuestQueueData.findOne({ queueNumber });
    if (!currentQueue) {
      return res.status(404).json({
        message: 'Queue not found',
        success: false
      });
    }

    // Calculate serving time in minutes
    const servingStartTime = new Date(currentQueue.servingStartTime || currentQueue.createdAt);
    const servingEndTime = new Date();
    const servingTimeMinutes = (servingEndTime - servingStartTime) / (1000 * 60);

    // Archive the finished queue with serving time data
    const archivedGuest = await archiveQueueData(currentQueue, 'served');

    // Update the archived record with serving time
    await ArchivedGuestUsers.findByIdAndUpdate(archivedGuest._id, {
      servingEndTime,
      servingTimeMinutes: servingTimeMinutes.toFixed(2),
      status: 'completed'
    });

    // Delete the current queue
    await GuestQueueData.deleteOne({ _id: currentQueue._id });

    // Get the next pending queue
    const nextQueue = await GuestQueueData.findOne({
      department: currentQueue.department,
      status: 'pending'
    }).sort({ createdAt: 1 });  // Sort by creation time to ensure FIFO

    // Calculate department stats and return them
    const today = new Date().toISOString().split('T')[0];
    const stats = await ArchivedGuestUsers.aggregate([
      {
        $match: {
          department: currentQueue.department,
          archiveDate: today,
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalServed: { $sum: 1 },
          avgServingTime: { $avg: "$servingTimeMinutes" }
        }
      }
    ]);

    // Guard against null values for avgServingTime
    const departmentStats = stats.length > 0 ? {
      totalServed: stats[0].totalServed,
      avgServingTime: stats[0].avgServingTime ? stats[0].avgServingTime.toFixed(1) : '0.0'
    } : {
      totalServed: 1, // Include the one we just processed
      avgServingTime: isNaN(servingTimeMinutes) ? '0.0' : servingTimeMinutes.toFixed(1)
    };

    res.json({
      success: true,
      message: 'Queue completed successfully',
      nextQueue: nextQueue ? {
        queueNumber: nextQueue.queueNumber,
        createdAt: nextQueue.createdAt
      } : null,
      stats: departmentStats
    });
  } catch (err) {
    console.error('Error in finishQueue:', err);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: err.message
    });
  }
});

// Get a specific guest by queue number
router.get('/getGuest/:queueNumber', async (req, res) => {
  const { queueNumber } = req.params;

  try {
    const guest = await GuestQueueData.findOne({ queueNumber });
    if (!guest) {
      return res.status(404).json({ message: 'Guest not found' });
    }
    res.json(guest);
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// DELETE endpoint (archives before deleting)
router.delete('/delete/:queueNumber', async (req, res) => {
  const { queueNumber } = req.params;

  try {
    const guestData = await GuestQueueData.findOne({ queueNumber });
    if (!guestData) {
      return res.status(404).json({ message: 'Queue data not found' });
    }

    // Archive then delete
    await archiveQueueData(guestData, 'user_left');
    await GuestQueueData.deleteOne({ _id: guestData._id });

    res.status(200).json({
      message: 'Queue data archived successfully',
      data: guestData
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error archiving queue data',
      error: error.message
    });
  }
});

// Get current queue number
router.get('/getCurrentQueue', async (req, res) => {
  const { department } = req.query;

  try {
    const currentQueue = await GuestQueueData.findOne({ department, status: 'pending' })
      .sort({ queueNumber: -1 })
      .limit(1);

    const currentQueueNumber = currentQueue ?
      parseInt(currentQueue.queueNumber.substring(2)) : 0;

    res.json({ currentQueueNumber });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

// Admin accepts a queue
router.put('/acceptQueue/:queueNumber', async (req, res) => {
  const { queueNumber } = req.params;

  try {
    const queue = await GuestQueueData.findOne({ queueNumber });
    if (!queue) {
      return res.status(404).send('Queue not found');
    }

    queue.status = 'accepted';
    queue.servingStartTime = new Date(); // Set the serving start time
    await queue.save();

    const numericPart = parseInt(queueNumber.substring(2));
    const nextQueueNumber = `${queue.department.substring(0, 2).toUpperCase()}${numericPart + 1}`;

    res.json({
      message: 'Queue Accepted',
      nextQueueNumber,
      servingStartTime: queue.servingStartTime
    });
  } catch (err) {
    res.status(500).send('Server Error');
  }
});

router.get('/statistics', async (req, res) => {
  const { department, date } = req.query;

  if (!department) {
    return res.status(400).json({ message: 'Department is required' });
  }

  try {
    const queryDate = date || new Date().toISOString().split('T')[0];

    // Get statistics from archived guests
    const stats = await ArchivedGuestUsers.aggregate([
      {
        $match: {
          department,
          archiveDate: queryDate,
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalServed: { $sum: 1 },
          avgServingTime: { $avg: "$servingTimeMinutes" }
        }
      }
    ]);

    // Get current pending queue count
    const pendingCount = await GuestQueueData.countDocuments({
      department,
      status: 'pending'
    });

    // Get current accepted queue (if any)
    const currentlyServing = await GuestQueueData.findOne({
      department,
      status: 'accepted'
    });

    res.json({
      totalServed: stats.length > 0 ? stats[0].totalServed : 0,
      avgServingTime: stats.length > 0 ? stats[0].avgServingTime.toFixed(1) : '0.0',
      pendingCount,
      currentlyServing: currentlyServing ? {
        queueNumber: currentlyServing.queueNumber,
        servingStartTime: currentlyServing.servingStartTime
      } : null
    });
  } catch (err) {
    console.error('Error fetching statistics:', err);
    res.status(500).json({
      message: 'Error fetching statistics',
      error: err.message
    });
  }
});

router.delete('/removeQueue/:queueNumber', async (req, res) => {
  const { queueNumber } = req.params;
  const {
    removedBy,  // Admin ID or username
    removalReason = 'Administrative action' // Optional reason
  } = req.body;

  try {
    const guestData = await GuestQueueData.findOne({ queueNumber });
    if (!guestData) {
      return res.status(404).json({ message: 'Queue data not found' });
    }

    // Archive then delete with specific exit reason and admin metadata
    const archivedGuest = new ArchivedGuestUsers({
      ...guestData.toObject(),
      queueNumber: `${guestData.queueNumber}-removed`, // Add timestamp indicator
      originalQueueNumber: guestData.queueNumber,
      archivedAt: new Date(),
      archiveDate: new Date().toISOString().split('T')[0],
      exitReason: 'removed_by_admin',
      status: 'removed_by_admin',
      removedBy,
      removalReason
    });

    await archivedGuest.save();
    await GuestQueueData.deleteOne({ _id: guestData._id });

    // Recalculate queue order after removal
    const remainingQueues = await GuestQueueData.find({
      department: guestData.department,
      status: 'pending'
    }).sort({ createdAt: 1 });

    res.status(200).json({
      message: 'Queue data removed successfully',
      data: {
        removedQueue: guestData,
        remainingQueueCount: remainingQueues.length,
        nextQueue: remainingQueues.length > 0 ? remainingQueues[0] : null
      }
    });
  } catch (error) {
    console.error('Error removing queue:', error);
    res.status(500).json({
      message: 'Error removing queue data',
      error: error.message
    });
  }
});

// Add this new route to handle skipping a queue
router.put('/skipQueue/:queueNumber', async (req, res) => {
  const { queueNumber } = req.params;
  const { skippedBy } = req.body;

  try {
    const queue = await GuestQueueData.findOne({ queueNumber });
    if (!queue) {
      return res.status(404).send('Queue not found');
    }

    // Mark the queue as skipped
    queue.isSkipped = true;
    queue.status = 'skipped';
    queue.skippedBy = skippedBy || 'admin';
    queue.skippedAt = new Date();

    await queue.save();

    // Refresh the pending queues for this department
    const pendingQueues = await GuestQueueData.find({
      department: queue.department,
      status: 'pending'
    }).sort({ createdAt: 1 });

    res.json({
      message: 'Queue Skipped',
      skippedQueue: queue,
      pendingQueues
    });
  } catch (err) {
    console.error('Error skipping queue:', err);
    res.status(500).send('Server Error');
  }
});

// Add a route to retrieve skipped queues
router.get('/skippedQueues', async (req, res) => {
  const { department } = req.query;

  if (!department) {
    return res.status(400).json({ message: 'Department is required' });
  }

  try {
    const skippedQueues = await GuestQueueData.find({
      department,
      isSkipped: true,
      status: 'skipped'
    }).sort({ skippedAt: -1 });

    res.json(skippedQueues);
  } catch (err) {
    console.error('Error fetching skipped queues:', err);
    res.status(500).json({
      message: 'Error fetching skipped queues',
      error: err.message
    });
  }
});

router.put('/reintegrateQueue/:queueNumber', async (req, res) => {
  const { queueNumber } = req.params;

  try {
    const queue = await GuestQueueData.findOne({ queueNumber });
    if (!queue) {
      return res.status(404).send('Queue not found');
    }

    // If the queue was skipped, reintegrate it
    if (queue.isSkipped) {
      queue.isSkipped = false;
      queue.status = 'pending';
      queue.skippedBy = undefined;
      queue.skippedAt = undefined;

      await queue.save();
    }

    res.json({
      message: 'Queue Reintegrated',
      queue
    });
  } catch (err) {
    console.error('Error reintegrating queue:', err);
    res.status(500).send('Server Error');
  }
});

module.exports = router;