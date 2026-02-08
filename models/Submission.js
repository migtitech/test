const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question', required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  code: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  isResubmission: { type: Boolean, default: false },
  effectivePoints: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Submission', submissionSchema);
