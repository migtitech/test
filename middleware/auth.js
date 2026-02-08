function isLoggedIn(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}

function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  res.redirect('/login');
}

function isUser(req, res, next) {
  if (req.session.user && req.session.user.role === 'user') return next();
  res.redirect('/login');
}

module.exports = { isLoggedIn, isAdmin, isUser };
