const mongoose = require('mongoose');

const SubjectsSchema = new mongoose.Schema({
    subjectID: { type: String, required: true, unique: true },
    subjectCode: { type: String, required: true },
    subjectName: { type: String, required: true },
    writtenWork: { type: String, required: true },
    performanceTask: { type: String, required: true },
    quarterlyAssessment: { type: String, required: true },
    classification: { type: String, required: true },
    strand : { type: String, require: true }, 
    term: { type: String, required: true },
    gradeLevel: { type: String, required: true },
    status: {type: String, required: true},
    subjectOrder: {type: String, required: true},
    isArchived: {type: Boolean, default: false}  
  }, { timestamps: true });

module.exports = mongoose.model('Subjects', SubjectsSchema);
