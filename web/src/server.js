const path = require('path');
const express = require('express');
const session = require('express-session');
const { csrfProtection } = require('./middleware/auth');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Hardening: Ẩn hoàn toàn header X-Powered-By
app.disable('x-powered-by');

// Trust proxy để lấy đúng IP từ X-Forwarded-For sau Nginx
app.set('trust proxy', 1);

// Cấu hình View Engine EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Middleware phục vụ static files & upload volume
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Body parsers với giới hạn kích thước an toàn
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));

// Cấu hình Session bảo mật: httpOnly, SameSite=Strict, Secure khi qua HTTPS
app.use(session({
  name: 'restaurant.sid',
  secret: process.env.SESSION_SECRET || 'default_session_secret_restaurant_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: 'auto',
    maxAge: 24 * 60 * 60 * 1000 // 24 giờ
  }
}));

// Route /health trả OK cho Docker healthcheck (không cần CSRF)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Middleware bảo vệ CSRF toàn cục
app.use(csrfProtection);

// Mount toàn bộ routes
app.use('/', routes);

// 404 Handler
app.use((req, res) => {
  res.status(404).render('error', {
    title: '404 Không tìm thấy trang',
    message: 'Trang bạn đang tìm kiếm không tồn tại.'
  });
});

// 500 Error Handler
app.use((err, req, res, next) => {
  console.error('[SERVER_ERROR]', err);
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('error', {
      title: '403 Lỗi Xác Thực',
      message: 'CSRF token không hợp lệ hoặc phiên làm việc đã hết hạn. Vui lòng tải lại trang.'
    });
  }
  res.status(500).render('error', {
    title: '500 Lỗi Hệ Thống',
    message: 'Đã xảy ra lỗi nội bộ máy chủ. Vui lòng thử lại sau.'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[RESTAURANT_APP] Server running on port ${PORT}`);
});