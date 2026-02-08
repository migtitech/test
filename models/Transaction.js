const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['earned', 'claim_requested', 'claim_approved', 'claim_rejected'], required: true },
  amount: { type: Number, required: true },
  description: { type: String },
  status: { type: String, enum: ['completed', 'pending', 'rejected'], default: 'completed' },
}, { timestamps: true });

module.exports = mongoose.model('Transaction', transactionSchema);
