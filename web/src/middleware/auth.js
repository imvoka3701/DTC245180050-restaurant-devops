const crypto = require('crypto');

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || '127.0.0.1';
}

function csrfProtection(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  res.locals.user = req.session.user || null;

  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const token = req.body._csrf || req.headers['x-csrf-token'] || req.query._csrf;
  if (!token || token !== req.session.csrfToken) {
    return res.status(403).render('error', {
      title: '403 Forbidden - CSRF Mismatch',
      message: 'Lỗi bảo mật: Token CSRF không hợp lệ hoặc đã hết hạn.'
    });
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('error', {
        title: '403 Forbidden - Truy cập bị từ chối',
        message: 'Bạn không có quyền truy cập vào chức năng này.'
      });
    }
    next();
  };
}

module.exports = {
  getClientIp,
  csrfProtection,
  requireAuth,
  requireRole
};
