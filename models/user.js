const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  pendingTasks: [{ type: String }],
  dateCreated: { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('User', UserSchema);
