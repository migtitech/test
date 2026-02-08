const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
  submission: { type: mongoose.Schema.Types.ObjectId, ref: 'Submission', required: true },
  sender: { type: String, required: true }, // 'admin' or the user's name
  senderRole: { type: String, enum: ['admin', 'user'], required: true },
  message: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Chat', chatSchema);
