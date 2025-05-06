const mongoose = require('mongoose');

const RolesSchema = new mongoose.Schema({
    role: {
        type: String,
        required: true,
        unique: true, 
    },
    modules: {
        type: [String],
        default: [], 
    },
}, { timestamps: true });
  
module.exports = mongoose.model('Roles', RolesSchema);
