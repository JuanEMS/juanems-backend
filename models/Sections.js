const mongoose = require('mongoose');

const SectionsSchema = new mongoose.Schema({
    sectionName: { type: String, required: true, unique: true },
    gradeLevel: { type: String, required: true },
    strand : { type: String, require: true }, 
    capacity: { type: String, required: true },
    status: {type: String, required: true},
    isArchived: {type: Boolean, default: false}  
  }, { timestamps: true });

module.exports = mongoose.model('Sections', SectionsSchema);
