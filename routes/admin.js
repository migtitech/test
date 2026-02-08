const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { isAdmin } = require('../middleware/auth');
const User = require('../models/User');
const Topic = require('../models/Topic');
const Question = require('../models/Question');
const Submission = require('../models/Submission');
const Transaction = require('../models/Transaction');
const Chat = require('../models/Chat');

router.use(isAdmin);

// Dashboard
router.get('/', async (req, res) => {
  const totalUsers = await User.countDocuments({ role: 'user' });
  const totalTopics = await Topic.countDocuments();
  const totalQuestions = await Question.countDocuments();
  const pendingSubmissions = await Submission.countDocuments({ status: 'pending' });
  const pendingClaims = await Transaction.countDocuments({ type: 'claim_requested', status: 'pending' });
  res.render('admin/dashboard', { totalUsers, totalTopics, totalQuestions, pendingSubmissions, pendingClaims });
});

// ---- User Management ----
router.get('/users', async (req, res) => {
  const users = await User.find({ role: 'user' }).sort('-createdAt');
  res.render('admin/users', { users, error: null, success: null });
});

router.post('/users/create', async (req, res) => {
  const { name, email, password } = req.body;
  const existing = await User.findOne({ email });
  if (existing) {
    const users = await User.find({ role: 'user' }).sort('-createdAt');
    return res.render('admin/users', { users, error: 'Email already exists', success: null });
  }
  const hashed = await bcrypt.hash(password, 10);
  await User.create({ name, email, password: hashed, role: 'user' });
  res.redirect('/admin/users');
});

router.post('/users/delete/:id', async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.redirect('/admin/users');
});

// ---- Topics ----
router.get('/topics', async (req, res) => {
  const topics = await Topic.find().sort('-createdAt');
  const topicQuestionCounts = {};
  for (const t of topics) {
    topicQuestionCounts[t._id] = await Question.countDocuments({ topic: t._id });
  }
  res.render('admin/topics', { topics, topicQuestionCounts });
});

router.post('/topics/create', async (req, res) => {
  await Topic.create({ title: req.body.title });
  res.redirect('/admin/topics');
});

router.post('/topics/delete/:id', async (req, res) => {
  await Question.deleteMany({ topic: req.params.id });
  await Topic.findByIdAndDelete(req.params.id);
  res.redirect('/admin/topics');
});

// ---- Questions ----
router.get('/questions/:topicId', async (req, res) => {
  const topic = await Topic.findById(req.params.topicId);
  const questions = await Question.find({ topic: req.params.topicId }).sort('-createdAt');
  res.render('admin/questions', { topic, questions });
});

router.post('/questions/create', async (req, res) => {
  const { topic, title, description, points } = req.body;
  await Question.create({ topic, title, description, points: Number(points) });
  res.redirect(`/admin/questions/${topic}`);
});

router.post('/questions/delete/:id', async (req, res) => {
  const q = await Question.findById(req.params.id);
  const topicId = q.topic;
  await Submission.deleteMany({ question: req.params.id });
  await Question.findByIdAndDelete(req.params.id);
  res.redirect(`/admin/questions/${topicId}`);
});

// ---- Submissions ----
router.get('/submissions', async (req, res) => {
  const submissions = await Submission.find()
    .populate('question')
    .populate('user')
    .sort('-createdAt');
  res.render('admin/submissions', { submissions });
});

// Submission detail with chat
router.get('/submissions/:id', async (req, res) => {
  const submission = await Submission.findById(req.params.id).populate('question').populate('user');
  if (!submission) return res.redirect('/admin/submissions');
  const chats = await Chat.find({ submission: submission._id }).sort('createdAt');
  res.render('admin/submission-detail', { submission, chats });
});

router.post('/submissions/approve/:id', async (req, res) => {
  const submission = await Submission.findById(req.params.id).populate('question');
  if (!submission || submission.status !== 'pending') return res.redirect('/admin/submissions');

  submission.status = 'approved';
  const points = submission.effectivePoints || submission.question.points;
  await submission.save();

  // Add points to user wallet
  await User.findByIdAndUpdate(submission.user, { $inc: { wallet: points } });

  // Create transaction
  await Transaction.create({
    user: submission.user,
    type: 'earned',
    amount: points,
    description: `Earned for: ${submission.question.title}${submission.isResubmission ? ' (resubmission)' : ''}`,
    status: 'completed'
  });

  res.redirect('/admin/submissions');
});

router.post('/submissions/reject/:id', async (req, res) => {
  await Submission.findByIdAndUpdate(req.params.id, { status: 'rejected' });
  res.redirect('/admin/submissions');
});

// ---- Claims ----
router.get('/claims', async (req, res) => {
  const claims = await Transaction.find({ type: 'claim_requested' })
    .populate('user')
    .sort('-createdAt');
  res.render('admin/claims', { claims });
});

router.post('/claims/approve/:id', async (req, res) => {
  const claim = await Transaction.findById(req.params.id);
  if (!claim || claim.status !== 'pending') return res.redirect('/admin/claims');

  claim.status = 'completed';
  claim.type = 'claim_approved';
  await claim.save();

  // Deduct from wallet
  await User.findByIdAndUpdate(claim.user, { $inc: { wallet: -claim.amount } });

  res.redirect('/admin/claims');
});

router.post('/claims/reject/:id', async (req, res) => {
  const claim = await Transaction.findById(req.params.id);
  if (!claim || claim.status !== 'pending') return res.redirect('/admin/claims');

  claim.status = 'rejected';
  claim.type = 'claim_rejected';
  await claim.save();

  res.redirect('/admin/claims');
});

// ---- All Transactions ----
router.get('/transactions', async (req, res) => {
  const transactions = await Transaction.find()
    .populate('user')
    .sort('-createdAt');
  res.render('admin/transactions', { transactions });
});

module.exports = router;
