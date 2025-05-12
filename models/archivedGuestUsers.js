const mongoose = require('mongoose');

const archivedGuestUsersSchema = new mongoose.Schema({
  // Original queue data fields
  guestUserId: { 
    type: String, 
    required: true,
    index: true
  },
  department: { 
    type: String, 
    required: true,
    enum: ['Admissions', 'Registrar', 'Accounting'],
    index: true
  },
  queueNumber: { 
    type: String, 
    required: true,
    index: true
  },
  originalQueueNumber: {
    type: String,
    required: true,
    index: true
  },
  status: { 
    type: String, 
    enum: ['pending', 'accepted', 'completed', 'left', 'rejoined'], 
    required: true
  },
  createdAt: { 
    type: Date,
    default: Date.now
  },
  
  // Archive-specific fields
  archivedAt: { 
    type: Date, 
    required: true,
    default: Date.now
  },
  exitReason: { 
    type: String, 
    enum: ['served', 'user_left', 'rejoined', 'other'],
    required: true
  },
  archiveDate: { 
    type: String, 
    required: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^\d{4}-\d{2}-\d{2}$/.test(v);
      },
      message: props => `${props.value} is not a valid date format (YYYY-MM-DD)!`
    }
  },
  originalQueueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GuestQueueData',
    index: true
  },
  uniqueArchiveId: {
    type: String,
    unique: true,
    index: true
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save hook to set default values and ensure data consistency
archivedGuestUsersSchema.pre('save', function(next) {
  // Set archiveDate if not provided
  if (!this.archiveDate) {
    const date = this.archivedAt || new Date();
    this.archiveDate = date.toISOString().split('T')[0];
  }

  // Generate uniqueArchiveId if not provided
  if (!this.uniqueArchiveId) {
    const timestamp = this.archivedAt?.getTime() || Date.now();
    this.uniqueArchiveId = `${this.queueNumber}-${timestamp}`;
  }

  // Ensure originalQueueNumber is set
  if (!this.originalQueueNumber && this.queueNumber) {
    // Extract the original queue number by removing any timestamp suffix
    this.originalQueueNumber = this.queueNumber.split('-')[0];
  }

  // Set status based on exitReason if not provided
  if (!this.status) {
    if (this.exitReason === 'served') {
      this.status = 'completed';
    } else if (this.exitReason === 'rejoined') {
      this.status = 'left';
    } else {
      this.status = 'left';
    }
  }

  next();
});

// Virtual for formatted archived date
archivedGuestUsersSchema.virtual('formattedArchivedAt').get(function() {
  return this.archivedAt?.toLocaleString() || '';
});

// Virtual for display queue number (shows original without timestamp)
archivedGuestUsersSchema.virtual('displayQueueNumber').get(function() {
  return this.originalQueueNumber || this.queueNumber?.split('-')[0];
});

// Indexes for optimized queries
archivedGuestUsersSchema.index({ 
  originalQueueNumber: 1, 
  archiveDate: 1 
});

archivedGuestUsersSchema.index({ 
  guestUserId: 1, 
  archivedAt: -1 
});

archivedGuestUsersSchema.index({ 
  department: 1, 
  archivedAt: -1 
});

// Compound index for common query patterns
archivedGuestUsersSchema.index({
  department: 1,
  status: 1,
  archivedAt: -1
});

// Text index for searching
archivedGuestUsersSchema.index({
  originalQueueNumber: 'text',
  guestUserId: 'text'
});

module.exports = mongoose.model('ArchivedGuestUsers', archivedGuestUsersSchema);