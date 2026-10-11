const mongoose = require('mongoose');

const CATEGORIES = ['Garbage picking', 'Sweeping', 'Toilet cleaning', 'Events'];

const photoSchema = new mongoose.Schema({
  category: { type: String, enum: CATEGORIES, required: true },
  area:     { type: String, trim: true, maxlength: 100, default: '' },
  caption:  { type: String, trim: true, maxlength: 200, default: '' },
  imageUrl: { type: String, required: true },   // link to the image on Cloudinary
  publicId: { type: String, required: true },   // Cloudinary id, needed to delete the image later
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Photo', photoSchema);
module.exports.CATEGORIES = CATEGORIES;
