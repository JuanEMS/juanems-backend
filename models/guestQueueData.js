const mongoose = require('mongoose');

const guestQueueDataSchema = new mongoose.Schema({
  guestUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'GuestUser', required: true },
  department: { type: String, required: true },
  queueNumber: { type: String, required: true },
  status: { type: String, default: 'pending' },
  timestamp: { type: Date, default: Date.now },
  servingStartTime: { type: Date } // New field to track when serving started
});

const GuestQueueData = mongoose.model('GuestQueueData', guestQueueDataSchema);
module.exports = GuestQueueData;