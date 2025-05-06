const mongoose = require('mongoose');

const yearLevelSchema = new mongoose.Schema({
  level: String,
  status: String
}, { collection: 'YearLevel' });

const YearLevel = mongoose.models.YearLevel || 
  mongoose.model("YearLevel", yearLevelSchema);

module.exports = YearLevel;