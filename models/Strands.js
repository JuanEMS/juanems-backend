const mongoose = require('mongoose');

const StrandsSchema = new mongoose.Schema({
    strandCode: { type: String, required: true, unique: true },
    strandName: { type: String, required: true },
    status: {type: String, required: true},
    isArchived: {type: Boolean, default: false}  
  }, { timestamps: true });

module.exports = mongoose.model('Strands', StrandsSchema);
