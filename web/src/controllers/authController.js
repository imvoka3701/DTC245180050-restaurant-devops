const bcrypt = require('bcryptjs');
const db = require('../db');
const { getClientIp } = require('../middleware/auth');

exports.showLogin = (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { title: 'Đăng nhập', error: null });
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  const ip = getClientIp(req);

  try {
    const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      console.log(`LOGIN_FAILED ip=${ip} user=${username} reason=unknown_user`);
      return res.status(401).render('login', { title: 'Đăng nhập', error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      console.log(`LOGIN_FAILED ip=${ip} user=${username} reason=inactive`);
      return res.status(403).render('login', { title: 'Đăng nhập', error: 'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản lý.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      console.log(`LOGIN_FAILED ip=${ip} user=${username} reason=wrong_password`);
      return res.status(401).render('login', { title: 'Đăng nhập', error: 'Tên đăng nhập hoặc mật khẩu không đúng.' });
    }

    console.log(`LOGIN_SUCCESS ip=${ip} user=${username}`);
    req.session.user = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role
    };

    if (user.role === 'manager') return res.redirect('/manager/dashboard');
    if (user.role === 'staff') return res.redirect('/orders');
    return res.redirect('/');
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Lỗi máy chủ khi đăng nhập.' });
  }
};

exports.showRegister = (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('register', { title: 'Đăng ký tài khoản', error: null });
};

exports.register = async (req, res) => {
  const { username, email, password, full_name } = req.body;

  if (!username || !email || !password || !full_name) {
    return res.status(400).render('register', { title: 'Đăng ký', error: 'Vui lòng điền đầy đủ tất cả các trường.' });
  }

  try {
    const existing = await db.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
    if (existing.rows.length > 0) {
      return res.status(400).render('register', { title: 'Đăng ký', error: 'Tên đăng nhập hoặc Email đã được sử dụng.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const inserted = await db.query(
      `INSERT INTO users (username, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'customer') RETURNING id, username, full_name, role`,
      [username, email, hash, full_name]
    );

    req.session.user = inserted.rows[0];
    res.redirect('/');
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Lỗi máy chủ khi đăng ký.' });
  }
};

exports.logout = (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
};
