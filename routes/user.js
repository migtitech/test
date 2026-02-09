const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { isUser } = require('../middleware/auth');
const User = require('../models/User');
const Topic = require('../models/Topic');
const Question = require('../models/Question');
const Submission = require('../models/Submission');
const Transaction = require('../models/Transaction');
const Chat = require('../models/Chat');

const PER_PAGE = 10;

router.use(isUser);

// Dashboard
router.get('/', async (req, res) => {
  const user = await User.findById(req.session.user._id);
  const totalSubmissions = await Submission.countDocuments({ user: user._id });
  const approvedSubmissions = await Submission.countDocuments({ user: user._id, status: 'approved' });
  const pendingSubmissions = await Submission.countDocuments({ user: user._id, status: 'pending' });
  res.render('user/dashboard', { user, totalSubmissions, approvedSubmissions, pendingSubmissions });
});

// Topics list
router.get('/topics', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const total = await Topic.countDocuments();
  const totalPages = Math.ceil(total / PER_PAGE);
  const topics = await Topic.find().sort('-createdAt').skip((page - 1) * PER_PAGE).limit(PER_PAGE);
  const topicQuestionCounts = {};
  for (const t of topics) {
    topicQuestionCounts[t._id] = await Question.countDocuments({ topic: t._id });
  }
  res.render('user/topics', { topics, topicQuestionCounts, currentPage: page, totalPages });
});

// Questions in a topic
router.get('/questions/:topicId', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const topic = await Topic.findById(req.params.topicId);
  const total = await Question.countDocuments({ topic: req.params.topicId });
  const totalPages = Math.ceil(total / PER_PAGE);
  const questions = await Question.find({ topic: req.params.topicId }).sort('-createdAt').skip((page - 1) * PER_PAGE).limit(PER_PAGE);

  // Check which questions user has already submitted
  const submissions = await Submission.find({
    user: req.session.user._id,
    question: { $in: questions.map(q => q._id) }
  });
  const submittedMap = {};
  const submissionIdMap = {};
  submissions.forEach(s => {
    submittedMap[s.question.toString()] = s.status;
    submissionIdMap[s.question.toString()] = s._id;
  });

  res.render('user/questions', { topic, questions, submittedMap, submissionIdMap, currentPage: page, totalPages });
});

// Solve a question (editor page)
router.get('/solve/:questionId', async (req, res) => {
  const question = await Question.findById(req.params.questionId).populate('topic');

  // Check if already submitted
  const existing = await Submission.findOne({ user: req.session.user._id, question: question._id });
  if (existing && existing.status !== 'rejected') {
    return res.render('user/solve', { question, existing, error: 'You have already submitted for this question.', canResubmit: false });
  }
  if (existing && existing.status === 'rejected') {
    // Allow resubmit with half points
    return res.render('user/solve', { question, existing, error: null, canResubmit: true });
  }

  res.render('user/solve', { question, existing: null, error: null, canResubmit: false });
});

// Submit code
router.post('/submit/:questionId', async (req, res) => {
  const { code } = req.body;
  const question = await Question.findById(req.params.questionId);

  const existing = await Submission.findOne({ user: req.session.user._id, question: question._id });

  // If rejected, allow resubmit with half points
  if (existing && existing.status === 'rejected') {
    existing.code = code;
    existing.status = 'pending';
    existing.isResubmission = true;
    existing.effectivePoints = Math.floor(question.points / 2);
    await existing.save();
    return res.redirect(`/user/questions/${question.topic}`);
  }

  // Block duplicate if not rejected
  if (existing) return res.redirect(`/user/questions/${question.topic}`);

  await Submission.create({
    question: question._id,
    user: req.session.user._id,
    code,
    effectivePoints: question.points
  });

  res.redirect(`/user/questions/${question.topic}`);
});

// Submission detail with chat
router.get('/submission/:id', async (req, res) => {
  const submission = await Submission.findOne({ _id: req.params.id, user: req.session.user._id })
    .populate('question').populate('user');
  if (!submission) return res.redirect('/user/topics');
  const chats = await Chat.find({ submission: submission._id }).sort('createdAt');
  res.render('user/submission-detail', { submission, chats });
});

// Wallet
router.get('/wallet', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const user = await User.findById(req.session.user._id);
  const total = await Transaction.countDocuments({ user: user._id });
  const totalPages = Math.ceil(total / PER_PAGE);
  const transactions = await Transaction.find({ user: user._id }).sort('-createdAt').skip((page - 1) * PER_PAGE).limit(PER_PAGE);
  res.render('user/wallet', { user, transactions, currentPage: page, totalPages });
});

// Claim points
router.post('/claim', async (req, res) => {
  const { amount } = req.body;
  const user = await User.findById(req.session.user._id);

  if (Number(amount) <= 0 || Number(amount) > user.wallet) {
    return res.redirect('/user/wallet');
  }

  await Transaction.create({
    user: user._id,
    type: 'claim_requested',
    amount: Number(amount),
    description: `Claim request for ${amount} points`,
    status: 'pending'
  });

  res.redirect('/user/wallet');
});

// Change password
router.get('/settings', async (req, res) => {
  res.render('user/settings', { error: null, success: null });
});

router.post('/settings/password', async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;
  const user = await User.findById(req.session.user._id);

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    return res.render('user/settings', { error: 'Current password is incorrect', success: null });
  }
  if (newPassword !== confirmPassword) {
    return res.render('user/settings', { error: 'New passwords do not match', success: null });
  }
  if (newPassword.length < 6) {
    return res.render('user/settings', { error: 'Password must be at least 6 characters', success: null });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.render('user/settings', { error: null, success: 'Password updated successfully' });
});

// Transaction history
router.get('/transactions', async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const total = await Transaction.countDocuments({ user: req.session.user._id });
  const totalPages = Math.ceil(total / PER_PAGE);
  const transactions = await Transaction.find({ user: req.session.user._id }).sort('-createdAt').skip((page - 1) * PER_PAGE).limit(PER_PAGE);
  res.render('user/transactions', { transactions, currentPage: page, totalPages });
});

module.exports = router;
