const mongoose = require('mongoose');

const guestQueueDataSchema = new mongoose.Schema({
  guestUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'GuestUser', required: true },
  department: { type: String, required: true },
  queueNumber: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'skipped', 'served', 'left'], 
    default: 'pending' 
  },
  timestamp: { type: Date, default: Date.now },
  servingStartTime: { type: Date }, // Time when serving started
  isSkipped: {
    type: Boolean,
    default: false
  },
  skippedBy: {
    type: String
  },
  skippedAt: {
    type: Date
  }
});

const GuestQueueData = mongoose.model('GuestQueueData', guestQueueDataSchema);
module.exports = GuestQueueData;