const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true, maxlength: 100 },
  email:     { type: String, required: true, trim: true, lowercase: true, maxlength: 150 },
  phone:     { type: String, trim: true, maxlength: 20, default: '' },
  message:   { type: String, required: true, trim: true, maxlength: 2000 },
  read:      { type: Boolean, default: false },
  emailSent: { type: Boolean, default: false },   // did the notification email go out?
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);
