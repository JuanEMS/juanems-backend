const mongoose = require('mongoose');

const guestUserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  mobileNumber: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});

const GuestUser = mongoose.model('GuestUser', guestUserSchema);

module.exports = GuestUser;
