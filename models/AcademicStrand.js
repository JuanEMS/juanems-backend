const mongoose = require('mongoose');

const academicStrandSchema = new mongoose.Schema({
  strand: String,
  status: String
}, { collection: 'AcademicStrand' });

const AcademicStrand = mongoose.models.AcademicStrand || 
  mongoose.model("AcademicStrand", academicStrandSchema);

module.exports = AcademicStrand;