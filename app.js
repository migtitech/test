const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB error:', err));

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// Make session user available in all views + load badge counts
const Submission = require('./models/Submission');
const Transaction = require('./models/Transaction');
const User = require('./models/User');

app.use(async (req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.badges = {};

  if (req.session.user) {
    try {
      if (req.session.user.role === 'admin') {
        res.locals.badges.pendingSubmissions = await Submission.countDocuments({ status: 'pending' });
        res.locals.badges.pendingClaims = await Transaction.countDocuments({ type: 'claim_requested', status: 'pending' });
      } else {
        const user = await User.findById(req.session.user._id);
        res.locals.badges.wallet = user ? user.wallet : 0;
        res.locals.badges.pendingSubmissions = await Submission.countDocuments({ user: req.session.user._id, status: 'pending' });
      }
    } catch (e) { /* ignore */ }
  }

  next();
});

// Routes
app.use('/', require('./routes/auth'));
app.use('/admin', require('./routes/admin'));
app.use('/user', require('./routes/user'));

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/user');
  }
  res.redirect('/login');
});

// Socket.IO for real-time chat
const Chat = require('./models/Chat');

io.on('connection', (socket) => {
  socket.on('joinSubmission', (submissionId) => {
    socket.join(`submission_${submissionId}`);
  });

  socket.on('chatMessage', async (data) => {
    const { submissionId, sender, senderRole, message } = data;
    const chat = await Chat.create({ submission: submissionId, sender, senderRole, message });
    io.to(`submission_${submissionId}`).emit('newMessage', {
      sender: chat.sender,
      senderRole: chat.senderRole,
      message: chat.message,
      createdAt: chat.createdAt
    });
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
