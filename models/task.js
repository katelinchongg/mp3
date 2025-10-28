const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  description:{ type: String, default: '' },
  deadline:  { type: Date, required: true },
  completed: { type: Boolean, default: false },
  assignedUser:     { type: String, default: '' },               // user _id string
  assignedUserName: { type: String, default: 'unassigned' },
  dateCreated:      { type: Date, default: Date.now }
}, { versionKey: false });

module.exports = mongoose.model('Task', TaskSchema);
