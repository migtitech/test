const express = require('express');
const router = express.Router();

// Static admin credentials
const ADMIN_EMAIL = 'admin@gmail.com';
const ADMIN_PASSWORD = 'admin1230145';

const User = require('../models/User');
const bcrypt = require('bcryptjs');

router.get('/login', (req, res) => {
  res.render('auth/login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Check static admin login
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.user = { _id: 'admin', name: 'Admin', email: ADMIN_EMAIL, role: 'admin' };
    return res.redirect('/admin');
  }

  // Check user login from DB
  const user = await User.findOne({ email, role: 'user' });
  if (!user) {
    return res.render('auth/login', { error: 'Invalid email or password' });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.render('auth/login', { error: 'Invalid email or password' });
  }

  req.session.user = { _id: user._id, name: user.name, email: user.email, role: 'user' };
  res.redirect('/user');
});

router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

module.exports = router;
