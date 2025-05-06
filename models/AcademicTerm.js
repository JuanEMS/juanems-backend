const mongoose = require('mongoose');

const examInterviewDateSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  dateStatus: { type: String, required: true, enum: ['Available', 'Unavailable'] },
  maxCapacity: { type: Number, required: true },
  currentCapacity: { type: Number, required: true, default: 0 }
});

const academicTermSchema = new mongoose.Schema({
  term: { type: String, required: true },
  status: { type: String, required: true, enum: ['Active', 'Inactive'] },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  examInterviewDates: [examInterviewDateSchema]
}, { collection: 'AcademicTerm' });

const AcademicTerm = mongoose.models.AcademicTerm || 
  mongoose.model("AcademicTerm", academicTermSchema);

module.exports = AcademicTerm;