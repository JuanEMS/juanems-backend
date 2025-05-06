const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  audience: {
    type: String,
    required: [true, 'Audience is required'],
    enum: ['All Users', 'Students', 'Faculty', 'Applicants', 'Staffs', 'Admissions', 'Registrar', 'Accounting', 'IT', 'Administration'],
    default: 'All Users'
  },
  content: {
    type: String,
    required: [true, 'Content is required'],
    trim: true
  },
  status: {
    type: String,
    enum: ['Active', 'Inactive', 'Draft'],
    default: 'Draft',
    required: true
  },
  startDate: {
    type: Date,
    required: [true, 'Start date is required'],
    default: Date.now
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required'],
    validate: {
      validator: function(value) {
        return value > this.startDate;
      },
      message: 'End date must be after start date'
    }
  },
  announcer: {
    type: String,
    required: [true, 'Announcer is required'],
    trim: true
  },
  priority: {
    type: String,
    enum: ['important', 'urgent', 'info', undefined],
    default: undefined
  },
  createdAt: {
    type: Date,
    default: Date.now,
    immutable: true
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
announcementSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Announcement', announcementSchema);