const mongoose = require('mongoose');

const viewedAnnouncementSchema = new mongoose.Schema({
  userEmail: {
    type: String,
    required: [true, 'User email is required'],
    trim: true
  },
  announcementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Announcement',
    required: [true, 'Announcement ID is required']
  },
  viewedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ViewedAnnouncement', viewedAnnouncementSchema);