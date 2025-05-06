const mongoose = require('mongoose');

const academicYearSchema = new mongoose.Schema({
  Year: String,
  status: String
}, { collection: 'AcademicYear' });

const AcademicYear = mongoose.models.AcademicYear || 
  mongoose.model("AcademicYear", academicYearSchema);

module.exports = AcademicYear;