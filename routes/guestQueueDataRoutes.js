const express = require('express');
const GuestQueueData = require('../models/guestQueueData');
const ArchivedGuestUsers = require('../models/archivedGuestUsers');
const router = express.Router();

// Helper function to archive queue data
const archiveQueueData = async (queueData, exitReason = 'user_left') => {
  const now = new Date();
  // Format date in local timezone (YYYY-MM-DD)
  const localDate = now.toLocaleDateString('en-CA'); // en-CA formats as YYYY-MM-DD
  
  // Calculate all timing metrics
  let waitingTimeMinutes = null;
  let servingTimeMinutes = null;
  let totalTimeMinutes = null;
  
  // If original timestamp exists (queue creation time)
  if (queueData.timestamp) {
    // Calculate total time in system
    totalTimeMinutes = (now - new Date(queueData.timestamp)) / (1000 * 60);
    
    // If serving start time exists (when queue was accepted)
    if (queueData.servingStartTime) {
      // Calculate waiting time (time between creation and start of service)
      waitingTimeMinutes = (new Date(queueData.servingStartTime) - new Date(queueData.timestamp)) / (1000 * 60);
      
      // Calculate serving time (time between start of service and now)
      servingTimeMinutes = (now - new Date(queueData.servingStartTime)) / (1000 * 60);
    } else {
      // If never served, all time is waiting time
      waitingTimeMinutes = totalTimeMinutes;
      servingTimeMinutes = 0;
    }
  }

  const archivedGuest = new ArchivedGuestUsers({
    ...queueData.toObject(),
    _id: undefined, // Let MongoDB create new ID
    archivedAt: now,
    archiveDate: localDate,  // Use local date format
    exitReason,
    status: exitReason === 'served' ? 'completed' : 'left',
    originalQueueId: queueData._id,
    originalQueueNumber: queueData.queueNumber,
    
    // Preserve all timing information
    timestamp: queueData.timestamp || queueData.createdAt,
    servingStartTime: queueData.servingStartTime,
    servingEndTime: exitReason === 'served' ? now : null,
    waitingTimeMinutes: waitingTimeMinutes ? waitingTimeMinutes.toFixed(2) : null,
    servingTimeMinutes: servingTimeMinutes ? servingTimeMinutes.toFixed(2) : null,
    totalTimeMinutes: totalTimeMinutes ? totalTimeMinutes.toFixed(2) : null
  });

  await archivedGuest.save();
  return archivedGuest;
};

// Helper function to generate queue numbers
const generateQueueNumber = async (department) => {
  // Get the current date in local timezone in YYYY-MM-DD format
  const now = new Date();
  const localDate = now.toLocaleDateString('en-CA'); // en-CA formats as YYYY-MM-DD
  
  console.log(`[Queue Generator] Server date: ${now}`);
  console.log(`[Queue Generator] Local date for queue generation: ${localDate}`);
  console.log(`[Queue Generator] Department: ${department}`);

  // Set department prefix
  let queuePrefix = '';
  switch (department) {
    case 'Admissions': queuePrefix = 'AD'; break;
    case 'Registrar': queuePrefix = 'RE'; break;
    case 'Accounting': queuePrefix = 'AC'; break;
    default: queuePrefix = department.substring(0, 2).toUpperCase();
  }
  console.log(`[Queue Generator] Department prefix: ${queuePrefix}`);

  // Find active queues for the department
  const lastActiveQueue = await GuestQueueData.findOne({
    department
  })
    .sort({ queueNumber: -1 })
    .select('queueNumber');

  console.log(`[Queue Generator] Last active queue:`, lastActiveQueue ?
    `Found: ${lastActiveQueue.queueNumber}` : 'No active queues found');

  // Find all archived queues from today first
  const allArchivedFromToday = await ArchivedGuestUsers.find({
    department,
    archiveDate: localDate
  })
    .select('originalQueueNumber queueNumber status');
  
  console.log(`[Queue Generator] All archived queues from today:`, 
    allArchivedFromToday.length ? 
      JSON.stringify(allArchivedFromToday.map(q => ({
        originalQueueNumber: q.originalQueueNumber, 
        queueNumber: q.queueNumber,
        status: q.status
      }))) : 
      'None found');
  
  // Find the highest numeric queue number by manually parsing them
  let highestArchivedQueue = null;
  let highestArchivedNumber = 0;
  
  for (const queue of allArchivedFromToday) {
    const queueNumStr = queue.originalQueueNumber;
    const numericPart = parseInt(queueNumStr.replace(queuePrefix, ''));
    
    if (!isNaN(numericPart) && numericPart > highestArchivedNumber) {
      highestArchivedNumber = numericPart;
      highestArchivedQueue = queue;
    }
  }
  
  console.log(`[Queue Generator] Last archived queue from today:`, highestArchivedQueue ?
    `Found: ${highestArchivedQueue.originalQueueNumber} (numeric value: ${highestArchivedNumber})` : 'No archived queues found for today');
    
  console.log(`[Queue Generator] All archived queues from today:`, 
    allArchivedFromToday.length ? 
      JSON.stringify(allArchivedFromToday.map(q => ({
        originalQueueNumber: q.originalQueueNumber, 
        queueNumber: q.queueNumber,
        status: q.status
      }))) : 
      'None found');

  // Determine the highest queue number between active and archived for today
  let lastActiveNumber = lastActiveQueue ?
    parseInt(lastActiveQueue.queueNumber.replace(queuePrefix, '')) || 0 : 0;
  console.log(`[Queue Generator] Last active number: ${lastActiveNumber}`);

  // Use the highest archived number we found
  console.log(`[Queue Generator] Last archived number: ${highestArchivedNumber}`);

  // Use the maximum value between active and archived numbers
  const lastNumber = Math.max(lastActiveNumber, highestArchivedNumber);
  console.log(`[Queue Generator] Max of active and archived: ${lastNumber}`);

  // If no records found, start with 1, otherwise increment from last number
  const nextNumber = lastNumber > 0 ? lastNumber + 1 : 1;
  console.log(`[Queue Generator] Next queue number: ${nextNumber}`);
  const fullQueueNumber = `${queuePrefix}${nextNumber}`;
  console.log(`[Queue Generator] Generated queue number: ${fullQueueNumber}`);

  // Return next queue number
  return fullQueueNumber;
};

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
    
    // Get the current date in local timezone
    const now = new Date();
    // Format date in local timezone (YYYY-MM-DD)
    const localDate = now.toLocaleDateString('en-CA'); // en-CA formats as YYYY-MM-DD
    
    const archivedGuest = new ArchivedGuestUsers({
      ...guestData.toObject(),
      queueNumber, // This is the unique version with timestamp
      originalQueueNumber: guestData.queueNumber, // Make sure this is set
      archivedAt: now,
      archiveDate: localDate, // Using localDate instead of UTC date
      exitReason,
      status: 'left'
    });
    
    await archivedGuest.save();
    await GuestQueueData.deleteOne({ _id: guestData._id }); // Fixed typo in property name
    
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

// Updated finishQueue route
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

    const now = new Date();
    // Get local date for stats calculation
    const localDate = now.toLocaleDateString('en-CA'); // en-CA formats as YYYY-MM-DD
    
    // Calculate all timing metrics with precision
    let waitingTimeMinutes = null;
    let servingTimeMinutes = null;
    let totalTimeMinutes = null;
    
    // Calculate total time in system (from creation to completion)
    const creationTime = new Date(currentQueue.timestamp || currentQueue.createdAt);
    totalTimeMinutes = (now - creationTime) / (1000 * 60);
    
    // Calculate waiting time (from creation to when service started)
    const servingStartTime = new Date(currentQueue.servingStartTime || creationTime);
    waitingTimeMinutes = (servingStartTime - creationTime) / (1000 * 60);
    
    // Calculate serving time (from service start to now)
    servingTimeMinutes = (now - servingStartTime) / (1000 * 60);

    // Archive the finished queue with serving time data
    const archivedGuest = await archiveQueueData(currentQueue, 'served');

    // Update the archived record with explicit timing information
    await ArchivedGuestUsers.findByIdAndUpdate(archivedGuest._id, {
      servingEndTime: now,
      waitingTimeMinutes: waitingTimeMinutes.toFixed(2),
      servingTimeMinutes: servingTimeMinutes.toFixed(2),
      totalTimeMinutes: totalTimeMinutes.toFixed(2),
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
    const stats = await ArchivedGuestUsers.aggregate([
      {
        $match: {
          department: currentQueue.department,
          archiveDate: localDate,  // Use local date
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalServed: { $sum: 1 },
          avgServingTime: { $avg: "$servingTimeMinutes" },
          avgWaitingTime: { $avg: "$waitingTimeMinutes" },
          avgTotalTime: { $avg: "$totalTimeMinutes" }
        }
      }
    ]);

    // Guard against null values for stats
    const departmentStats = stats.length > 0 ? {
      totalServed: stats[0].totalServed,
      avgServingTime: stats[0].avgServingTime ? stats[0].avgServingTime.toFixed(1) : '0.0',
      avgWaitingTime: stats[0].avgWaitingTime ? stats[0].avgWaitingTime.toFixed(1) : '0.0',
      avgTotalTime: stats[0].avgTotalTime ? stats[0].avgTotalTime.toFixed(1) : '0.0'
    } : {
      totalServed: 1, // Include the one we just processed
      avgServingTime: servingTimeMinutes.toFixed(1),
      avgWaitingTime: waitingTimeMinutes.toFixed(1),
      avgTotalTime: totalTimeMinutes.toFixed(1)
    };

    res.json({
      success: true,
      message: 'Queue completed successfully',
      completedQueue: {
        queueNumber: currentQueue.queueNumber,
        waitingTimeMinutes: waitingTimeMinutes.toFixed(2),
        servingTimeMinutes: servingTimeMinutes.toFixed(2),
        totalTimeMinutes: totalTimeMinutes.toFixed(2)
      },
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

// Updated statistics route
router.get('/statistics', async (req, res) => {
  const { department, date } = req.query;
  
  if (!department) {
    return res.status(400).json({ message: 'Department is required' });
  }
  
  try {
    // Handle date parameter more robustly
    let queryDate;
    
    if (date) {
      // Validate the date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        return res.status(400).json({ message: 'Invalid date format. Please use YYYY-MM-DD' });
      }
      queryDate = date;
    } else {
      // Default to today's date in local format
      const now = new Date();
      queryDate = now.toLocaleDateString('en-CA'); // en-CA formats as YYYY-MM-DD
      console.log(`No date provided, using local date: ${queryDate}`);
    }
    
    // Get statistics from archived guests
    console.log(`Fetching statistics for department: ${department}, date: ${queryDate}`);
    const stats = await ArchivedGuestUsers.aggregate([
      {
        $match: {
          department,
          archiveDate: { $eq: queryDate }, // Explicit equality check
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
    console.log(`Found ${stats.length > 0 ? stats[0].totalServed : 0} completed entries for ${queryDate}`);
    
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
    
    // Additional date-based metrics using local date
    // For the beginning of the week, use date manipulation on client-side date
    const weekStartDate = new Date(queryDate);
    weekStartDate.setDate(weekStartDate.getDate() - weekStartDate.getDay()); // Start of week (Sunday)
    const weekStart = weekStartDate.toLocaleDateString('en-CA'); // Format as YYYY-MM-DD
    
    const weeklyStats = await ArchivedGuestUsers.aggregate([
      {
        $match: {
          department,
          archiveDate: {
            $gte: weekStart,
            $lte: queryDate
          },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          weeklyCount: { $sum: 1 },
          weeklyAvgTime: { $avg: "$servingTimeMinutes" }
        }
      }
    ]);
    console.log(`Found ${weeklyStats.length > 0 ? weeklyStats[0].weeklyCount : 0} completed entries for the week`);
    
    res.json({
      date: queryDate,
      totalServed: stats.length > 0 ? stats[0].totalServed : 0,
      avgServingTime: stats.length > 0 ? parseFloat(stats[0].avgServingTime.toFixed(1)) : 0.0,
      pendingCount,
      weeklyTotalServed: weeklyStats.length > 0 ? weeklyStats[0].weeklyCount : 0,
      weeklyAvgServingTime: weeklyStats.length > 0 ? parseFloat(weeklyStats[0].weeklyAvgTime.toFixed(1)) : 0.0,
      currentlyServing: currentlyServing ? {
        queueNumber: currentlyServing.queueNumber,
        servingStartTime: currentlyServing.servingStartTime,
        // Calculate estimated remaining time based on average serving time
        estimatedRemainingMinutes: stats.length > 0 ? 
          Math.max(0, Math.round(stats[0].avgServingTime - 
            ((new Date() - new Date(currentlyServing.servingStartTime)) / 60000))) : null
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

    const now = new Date();
    // Format date in local timezone (YYYY-MM-DD)
    const localDate = now.toLocaleDateString('en-CA'); // en-CA formats as YYYY-MM-DD
    
    // Calculate all timing metrics with precision
    let waitingTimeMinutes = null;
    let servingTimeMinutes = null;
    let totalTimeMinutes = null;
    
    // Calculate total time in system (from creation to removal)
    const creationTime = new Date(guestData.timestamp || guestData.createdAt);
    totalTimeMinutes = (now - creationTime) / (1000 * 60);
    
    // Calculate waiting time (from creation to when service started, if applicable)
    if (guestData.servingStartTime) {
      const servingStartTime = new Date(guestData.servingStartTime);
      waitingTimeMinutes = (servingStartTime - creationTime) / (1000 * 60);
      
      // Calculate serving time (from service start to now)
      servingTimeMinutes = (now - servingStartTime) / (1000 * 60);
    } else {
      // If never served, all time is waiting time
      waitingTimeMinutes = totalTimeMinutes;
      servingTimeMinutes = 0;
    }

    // Archive then delete with specific exit reason, admin metadata, and timing information
    const archivedGuest = new ArchivedGuestUsers({
      ...guestData.toObject(),
      _id: undefined, // Let MongoDB create new ID
      queueNumber: `${guestData.queueNumber}`, 
      originalQueueNumber: guestData.queueNumber,
      archivedAt: now,
      archiveDate: localDate, // Use local date format
      exitReason: 'removed_by_admin',
      status: 'removed_by_admin',
      removedBy,
      removalReason,
      // Add timing data
      servingEndTime: now,
      waitingTimeMinutes: waitingTimeMinutes ? waitingTimeMinutes.toFixed(2) : null,
      servingTimeMinutes: servingTimeMinutes ? servingTimeMinutes.toFixed(2) : null,
      totalTimeMinutes: totalTimeMinutes ? totalTimeMinutes.toFixed(2) : null
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
        nextQueue: remainingQueues.length > 0 ? remainingQueues[0] : null,
        timingInfo: {
          waitingTimeMinutes: waitingTimeMinutes ? waitingTimeMinutes.toFixed(2) : null,
          servingTimeMinutes: servingTimeMinutes ? servingTimeMinutes.toFixed(2) : null,
          totalTimeMinutes: totalTimeMinutes ? totalTimeMinutes.toFixed(2) : null
        }
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

router.put('/transferQueue/:queueNumber', async (req, res) => {
  const { queueNumber } = req.params;
  const {
    targetDepartment,
    transferredBy,
    transferReason = 'Administrative transfer'
  } = req.body;

  try {
    const currentQueue = await GuestQueueData.findOne({ queueNumber });
    if (!currentQueue) {
      return res.status(404).json({
        message: 'Queue not found',
        success: false
      });
    }

    const originalDepartment = currentQueue.department;
    const guestUserId = currentQueue.guestUserId;

    const now = new Date();
    const localDate = now.toLocaleDateString('en-CA'); // en-CA formats as YYYY-MM-DD

    // Calculate all timing metrics with precision
    let waitingTimeMinutes = null;
    let servingTimeMinutes = null;
    let totalTimeMinutes = null;
    
    // Calculate total time in system (from creation to transfer)
    const creationTime = new Date(currentQueue.timestamp || currentQueue.createdAt);
    totalTimeMinutes = (now - creationTime) / (1000 * 60);
    
    // Calculate waiting time (from creation to when service started, if applicable)
    if (currentQueue.servingStartTime) {
      const servingStartTime = new Date(currentQueue.servingStartTime);
      waitingTimeMinutes = (servingStartTime - creationTime) / (1000 * 60);
      
      // Calculate serving time (from service start to now)
      servingTimeMinutes = (now - servingStartTime) / (1000 * 60);
    } else {
      // If never served, all time is waiting time
      waitingTimeMinutes = totalTimeMinutes;
      servingTimeMinutes = 0;
    }

    // First create a record of the transfer in the archive with timing information
    const transferRecord = new ArchivedGuestUsers({
      ...currentQueue.toObject(),
      _id: undefined, // Let MongoDB create new ID
      originalQueueNumber: currentQueue.queueNumber,
      archivedAt: now,
      archiveDate: localDate, // Use local date format
      exitReason: 'transferred',
      transferredTo: targetDepartment,
      transferredBy,
      transferReason,
      status: 'transferred',
      // Add timing data
      servingEndTime: now,
      waitingTimeMinutes: waitingTimeMinutes ? waitingTimeMinutes.toFixed(2) : null,
      servingTimeMinutes: servingTimeMinutes ? servingTimeMinutes.toFixed(2) : null,
      totalTimeMinutes: totalTimeMinutes ? totalTimeMinutes.toFixed(2) : null
    });

    await transferRecord.save();

    // Delete the current queue BEFORE creating a new one to avoid duplicate key errors
    await GuestQueueData.deleteOne({ _id: currentQueue._id });

    // Generate a new queue number for the target department
    const newQueueNumber = await generateQueueNumber(targetDepartment);

    // Create a new queue entry in the target department
    const newQueue = new GuestQueueData({
      guestUserId: guestUserId,
      department: targetDepartment,
      queueNumber: newQueueNumber,
      status: 'pending',
      createdAt: new Date(),
      transferredFrom: originalDepartment,
      previousQueueNumber: currentQueue.queueNumber
    });

    await newQueue.save();

    res.json({
      success: true,
      message: `Queue successfully transferred from ${originalDepartment} to ${targetDepartment}`,
      oldQueueNumber: currentQueue.queueNumber,
      newQueueNumber: newQueueNumber,
      timingInfo: {
        waitingTimeMinutes: waitingTimeMinutes ? waitingTimeMinutes.toFixed(2) : null,
        servingTimeMinutes: servingTimeMinutes ? servingTimeMinutes.toFixed(2) : null,
        totalTimeMinutes: totalTimeMinutes ? totalTimeMinutes.toFixed(2) : null
      }
    });
  } catch (err) {
    console.error('Error transferring queue:', err);
    res.status(500).json({
      success: false,
      message: 'Error transferring queue',
      error: err.message
    });
  }
});

// Updated archived queue history route with department filtering
router.get('/queue/archived', async (req, res) => {
  try {
    const { department } = req.query;
    
    // Create a filter object
    let filter = {};
    
    // If department is provided and not 'IT' or 'Administration', filter by department
    if (department && !['IT', 'Administration'].includes(department)) {
      filter.department = department;
    }
    
    // Query the database with the filter
    const archivedRecords = await ArchivedGuestUsers.find(filter)
      .select('queueNumber department status exitReason waitingTimeMinutes servingTimeMinutes totalTimeMinutes archivedAt archiveDate')
      .sort({ archivedAt: -1 })
      .lean();
    
    res.status(200).json({
      success: true,
      data: archivedRecords,
      count: archivedRecords.length
    });
    
  } catch (error) {
    console.error('Error fetching archived queue history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching archived queue history',
      error: error.message
    });
  }
});

module.exports = router;