const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
  userID: {
    type: String,
    required: true
  },
  accountName: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: [
      'Admissions (Staff)',
      'Registrar (Staff)',
      'Accounting (Staff)',
      'Administration (Sub-Admin)',
      'IT (Super Admin)'
    ]
  },
  action: {
    type: String,
    required: true,
    enum: [
      'Logged In',
      'Logged Out',
      'Create',
      'Update',
      'Delete',
      'Archive',
      'Unarchive',
      'Export'
    ]
  },
  detail: {
    type: String,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('SystemLogs', systemLogSchema);

