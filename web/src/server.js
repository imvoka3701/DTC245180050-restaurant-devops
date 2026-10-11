const path = require('path');
const express = require('express');
const session = require('express-session');
const { csrfProtection } = require('./middleware/auth');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy để lấy đúng IP từ X-Forwarded-For
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

// Cấu hình Session bảo mật
app.use(session({
  name: 'restaurant.sid',
  secret: process.env.SESSION_SECRET || 'default_session_secret_restaurant_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: false, // sẽ kích hoạt khi sau Nginx HTTPS
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

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).render('error', {
    title: '500 Lỗi máy chủ',
    message: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[RESTAURANT APP] Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});
