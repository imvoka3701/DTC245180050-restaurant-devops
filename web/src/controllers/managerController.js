const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('../db');

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Chỉ chấp nhận file ảnh thật định dạng PNG, JPG hoặc WEBP.'));
    }
    cb(null, true);
  }
}).single('image');

function validateMagicBytes(buffer, mimetype) {
  if (!buffer || buffer.length < 12) return false;
  if (mimetype === 'image/jpeg' || mimetype === 'image/jpg') {
    return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
  }
  if (mimetype === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  }
  if (mimetype === 'image/webp') {
    return buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP';
  }
  return false;
}

exports.uploadMiddleware = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).redirect('/manager/menu?error=' + encodeURIComponent('Kích thước file ảnh vượt quá giới hạn cho phép (tối đa 5 MB).'));
      }
      return res.status(400).redirect('/manager/menu?error=' + encodeURIComponent(err.message));
    }

    if (req.file) {
      if (!validateMagicBytes(req.file.buffer, req.file.mimetype)) {
        return res.status(400).redirect('/manager/menu?error=' + encodeURIComponent('Tập tin tải lên không phải là ảnh hợp lệ (PNG/JPG/WEBP).'));
      }

      const ext = req.file.mimetype === 'image/png' ? '.png' : (req.file.mimetype === 'image/webp' ? '.webp' : '.jpg');
      const filename = 'dish_' + Date.now() + '_' + crypto.randomBytes(6).toString('hex') + ext;
      const uploadDir = path.join(__dirname, '../../public/uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(path.join(uploadDir, filename), req.file.buffer);
      req.uploadedImagePath = `/uploads/${filename}`;
    }
    next();
  });
};

// 1. Báo Cáo Doanh Thu & KPIs (Tab 1)
exports.dashboard = async (req, res) => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const rangeMode = req.query.range || (req.query.start_date || req.query.end_date ? 'custom' : 'today');

    let startDate = req.query.start_date || todayStr;
    let endDate = req.query.end_date || todayStr;

    if (rangeMode === 'today') {
      startDate = todayStr;
      endDate = todayStr;
    }

    let kpiQuery = `
      SELECT
        COALESCE(SUM(total_amount), 0) AS total_revenue,
        COUNT(*) AS completed_orders,
        COALESCE(ROUND(AVG(total_amount)), 0) AS avg_order_value
      FROM orders
      WHERE status = 'paid'
    `;
    let topDishesQuery = `
      SELECT
        m.id,
        m.name,
        m.image_path,
        c.name AS category_name,
        SUM(oi.quantity) AS total_sold,
        SUM(oi.quantity * oi.unit_price) AS total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN menu_items m ON oi.menu_item_id = m.id
      JOIN categories c ON m.category_id = c.id
      WHERE o.status = 'paid'
    `;
    let dailyQuery = `
      SELECT
        TO_CHAR(COALESCE(paid_at, created_at), 'DD/MM/YYYY') AS day_label,
        COALESCE(paid_at, created_at)::date AS day_sort,
        COALESCE(SUM(total_amount), 0) AS revenue,
        COUNT(*) AS orders_count
      FROM orders
      WHERE status = 'paid'
    `;
    let catRevQuery;
    const params = [];

    if (rangeMode !== 'all') {
      params.push(startDate, endDate);
      const dateCond = ` AND COALESCE(o.paid_at, o.created_at)::date >= $1::date AND COALESCE(o.paid_at, o.created_at)::date <= $2::date`;
      kpiQuery += ` AND COALESCE(paid_at, created_at)::date >= $1::date AND COALESCE(paid_at, created_at)::date <= $2::date`;
      topDishesQuery += dateCond;
      dailyQuery += ` AND COALESCE(paid_at, created_at)::date >= $1::date AND COALESCE(paid_at, created_at)::date <= $2::date`;
      catRevQuery = `
        SELECT
          c.id,
          c.name AS category_name,
          COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS total_qty,
          COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity * oi.unit_price ELSE 0 END), 0) AS revenue
        FROM categories c
        LEFT JOIN menu_items m ON m.category_id = c.id
        LEFT JOIN order_items oi ON oi.menu_item_id = m.id
        LEFT JOIN orders o ON oi.order_id = o.id
          AND o.status = 'paid'
          AND COALESCE(o.paid_at, o.created_at)::date >= $1::date
          AND COALESCE(o.paid_at, o.created_at)::date <= $2::date
        GROUP BY c.id, c.name, c.sort_order
        ORDER BY c.sort_order ASC
      `;
    } else {
      catRevQuery = `
        SELECT
          c.id,
          c.name AS category_name,
          COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity ELSE 0 END), 0) AS total_qty,
          COALESCE(SUM(CASE WHEN o.id IS NOT NULL THEN oi.quantity * oi.unit_price ELSE 0 END), 0) AS revenue
        FROM categories c
        LEFT JOIN menu_items m ON m.category_id = c.id
        LEFT JOIN order_items oi ON oi.menu_item_id = m.id
        LEFT JOIN orders o ON oi.order_id = o.id AND o.status = 'paid'
        GROUP BY c.id, c.name, c.sort_order
        ORDER BY c.sort_order ASC
      `;
    }

    topDishesQuery += `
      GROUP BY m.id, m.name, m.image_path, c.name
      ORDER BY total_sold DESC, total_revenue DESC
      LIMIT 10
    `;
    dailyQuery += `
      GROUP BY COALESCE(paid_at, created_at)::date, TO_CHAR(COALESCE(paid_at, created_at), 'DD/MM/YYYY')
      ORDER BY day_sort ASC
      LIMIT 14
    `;

    const [kpiRes, topDishesRes, dailyRes, catRevRes] = await Promise.all([
      db.query(kpiQuery, params),
      db.query(topDishesQuery, params),
      db.query(dailyQuery, params),
      db.query(catRevQuery, params)
    ]);

    const totalRevenue = parseFloat(kpiRes.rows[0].total_revenue || 0);
    const completedOrders = parseInt(kpiRes.rows[0].completed_orders || 0, 10);
    const avgOrderValue = parseFloat(kpiRes.rows[0].avg_order_value || 0);

    res.render('manager/dashboard', {
      title: 'Dashboard Quản Trị Hệ Thống',
      activeTab: 'kpi',
      startDate,
      endDate,
      rangeMode,
      totalRevenue,
      completedOrders,
      avgOrderValue,
      topDishes: topDishesRes.rows,
      dailyRevenue: dailyRes.rows,
      categoryRevenue: catRevRes.rows
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Không thể tải bảng điều khiển KPI.' });
  }
};

// Xuất Báo Cáo Doanh Thu ra file Excel (CSV chuẩn UTF-8 BOM)
exports.exportRevenueCSV = async (req, res) => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const rangeMode = req.query.range || (req.query.start_date || req.query.end_date ? 'custom' : 'today');
    let startDate = req.query.start_date || todayStr;
    let endDate = req.query.end_date || todayStr;
    if (rangeMode === 'today') {
      startDate = todayStr;
      endDate = todayStr;
    }

    const params = [];
    let dateCond = '';
    if (rangeMode !== 'all') {
      params.push(startDate, endDate);
      dateCond = ` AND COALESCE(o.paid_at, o.created_at)::date >= $1::date AND COALESCE(o.paid_at, o.created_at)::date <= $2::date`;
    }

    const ordersRes = await db.query(`
      SELECT o.order_code, t.code AS table_code, COALESCE(u.full_name, 'Khách tại bàn') AS staff_name,
             o.total_amount, o.payment_method, COALESCE(o.paid_at, o.created_at) AS paid_time
      FROM orders o
      JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.status = 'paid' ${dateCond}
      ORDER BY paid_time DESC
    `, params);

    const topRes = await db.query(`
      SELECT m.name, c.name AS category_name, SUM(oi.quantity) AS total_sold, SUM(oi.quantity * oi.unit_price) AS total_revenue
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      JOIN menu_items m ON oi.menu_item_id = m.id
      JOIN categories c ON m.category_id = c.id
      WHERE o.status = 'paid' ${dateCond}
      GROUP BY m.id, m.name, c.name
      ORDER BY total_sold DESC, total_revenue DESC
    `, params);

    const totalRev = ordersRes.rows.reduce((s, r) => s + Number(r.total_amount), 0);
    const totalCount = ordersRes.rows.length;
    const avgVal = totalCount > 0 ? Math.round(totalRev / totalCount) : 0;

    function csvCell(val) {
      const s = String(val === null || val === undefined ? '' : val).replace(/"/g, '""');
      return `"${s}"`;
    }

    const lines = [];
    lines.push([csvCell('BÁO CÁO DOANH THU & KPI NHÀ HÀNG Á ĐÔNG SAKURA')].join(','));
    lines.push([csvCell('Kỳ báo cáo:'), csvCell(rangeMode === 'all' ? 'Tất cả thời gian' : `${startDate} đến ${endDate}`)].join(','));
    lines.push([csvCell('Thời điểm xuất:'), csvCell(new Date().toLocaleString('vi-VN'))].join(','));
    lines.push('');

    lines.push([csvCell('I. CHỈ SỐ KPI TỔNG QUAN')].join(','));
    lines.push([csvCell('Tổng doanh thu đã thu (VNĐ)'), csvCell('Tổng đơn hàng hoàn tất'), csvCell('Giá trị trung bình / đơn (VNĐ)')].join(','));
    lines.push([csvCell(totalRev), csvCell(totalCount), csvCell(avgVal)].join(','));
    lines.push('');

    lines.push([csvCell('II. TOP MÓN ĂN BÁN CHẠY TRONG KỲ')].join(','));
    lines.push([csvCell('Hạng'), csvCell('Tên món ăn'), csvCell('Danh mục'), csvCell('Số lượng đã bán (phần)'), csvCell('Doanh thu đóng góp (VNĐ)')].join(','));
    if (topRes.rows.length === 0) {
      lines.push([csvCell('Chưa có dữ liệu món bán trong kỳ')].join(','));
    } else {
      topRes.rows.forEach((d, idx) => {
        lines.push([csvCell(idx + 1), csvCell(d.name), csvCell(d.category_name), csvCell(d.total_sold), csvCell(d.total_revenue)].join(','));
      });
    }
    lines.push('');

    lines.push([csvCell('III. DANH SÁCH HÓA ĐƠN ĐÃ THANH TOÁN')].join(','));
    lines.push([csvCell('STT'), csvCell('Mã hóa đơn'), csvCell('Bàn'), csvCell('Người tạo'), csvCell('Phương thức TT'), csvCell('Thời gian thanh toán'), csvCell('Tổng tiền (VNĐ)')].join(','));
    if (ordersRes.rows.length === 0) {
      lines.push([csvCell('Chưa có hóa đơn thanh toán trong kỳ')].join(','));
    } else {
      ordersRes.rows.forEach((o, idx) => {
        lines.push([
          csvCell(idx + 1),
          csvCell(o.order_code),
          csvCell(o.table_code),
          csvCell(o.staff_name),
          csvCell(o.payment_method || 'cash'),
          csvCell(new Date(o.paid_time).toLocaleString('vi-VN')),
          csvCell(o.total_amount)
        ].join(','));
      });
    }

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const fileLabel = rangeMode === 'all' ? 'Tat_Ca' : `${startDate}_${endDate}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Bao_Cao_Doanh_Thu_Sakura_${fileLabel}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error('Export CSV error:', err);
    res.status(500).redirect('/manager/dashboard?error=' + encodeURIComponent('Không thể xuất báo cáo CSV.'));
  }
};

// 2. Quản Lý Thực Đơn & Danh Mục (Tab 2)
exports.listMenu = async (req, res) => {
  try {
    const catRes = await db.query('SELECT * FROM categories ORDER BY sort_order ASC, id ASC');
    const itemsRes = await db.query(`
      SELECT m.*, c.name AS category_name
      FROM menu_items m
      JOIN categories c ON m.category_id = c.id
      ORDER BY c.sort_order ASC, m.id ASC
    `);

    res.render('manager/menu', {
      title: 'Quản Lý Thực Đơn - Dashboard Quản Trị',
      activeTab: 'menu',
      categories: catRes.rows,
      items: itemsRes.rows,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('List menu error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Lỗi tải danh sách món ăn.' });
  }
};

exports.createMenuItem = async (req, res) => {
  const { category_id, name, description, price, is_available } = req.body;
  const image_path = req.uploadedImagePath || '/images/menu/dish-01.svg';

  if (!name || !name.trim()) {
    return res.status(400).redirect('/manager/menu?error=' + encodeURIComponent('Vui lòng nhập tên món ăn.'));
  }

  const priceNum = parseFloat(price);
  if (isNaN(priceNum) || priceNum < 0) {
    return res.status(400).redirect('/manager/menu?error=' + encodeURIComponent('Giá món ăn phải lớn hơn hoặc bằng 0.'));
  }

  try {
    const existing = await db.query('SELECT id FROM menu_items WHERE name = $1', [name.trim()]);
    if (existing.rows.length > 0) {
      return res.status(400).redirect('/manager/menu?error=' + encodeURIComponent('Tên món ăn đã tồn tại trong thực đơn.'));
    }

    await db.query(`
      INSERT INTO menu_items (category_id, name, description, price, image_path, is_available)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [category_id, name.trim(), description || '', priceNum, image_path, is_available === 'on' || is_available === 'true' || is_available === true]);

    res.redirect('/manager/menu?success=' + encodeURIComponent('🎉 Đã thêm món "' + name.trim() + '" kèm hình ảnh và đồng bộ lên Trang chủ Đặt món!'));
  } catch (err) {
    console.error('Create item error:', err);
    res.status(500).redirect('/manager/menu?error=' + encodeURIComponent('Lỗi hệ thống khi thêm món ăn.'));
  }
};

exports.updateMenuItem = async (req, res) => {
  const { id } = req.params;
  const { category_id, name, description, price, is_available } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).redirect('/manager/menu?error=' + encodeURIComponent('Tên món ăn không được để trống.'));
  }

  const priceNum = parseFloat(price);
  if (isNaN(priceNum) || priceNum < 0) {
    return res.status(400).redirect('/manager/menu?error=' + encodeURIComponent('Giá món ăn phải lớn hơn hoặc bằng 0.'));
  }

  try {
    let updateQuery = `
      UPDATE menu_items
      SET category_id = $1, name = $2, description = $3, price = $4, is_available = $5
    `;
    const params = [category_id, name.trim(), description || '', priceNum, is_available === 'on' || is_available === 'true' || is_available === true];

    if (req.uploadedImagePath) {
      params.push(req.uploadedImagePath);
      updateQuery += `, image_path = $${params.length}`;
    }

    params.push(id);
    updateQuery += ` WHERE id = $${params.length}`;

    await db.query(updateQuery, params);
    const msg = req.uploadedImagePath
      ? `📸 Đã tải ảnh mới và cập nhật món "${name.trim()}" thành công! Đã hiển thị trên Trang chủ.`
      : `💾 Đã cập nhật thông tin món "${name.trim()}" thành công!`;
    res.redirect('/manager/menu?success=' + encodeURIComponent(msg));
  } catch (err) {
    console.error('Update item error:', err);
    res.status(500).redirect('/manager/menu?error=' + encodeURIComponent('Lỗi khi cập nhật món ăn.'));
  }
};

exports.deleteMenuItem = async (req, res) => {
  const { id } = req.params;
  try {
    const usedRes = await db.query('SELECT COUNT(*) AS cnt FROM order_items WHERE menu_item_id = $1', [id]);
    if (parseInt(usedRes.rows[0].cnt, 10) > 0) {
      await db.query('UPDATE menu_items SET is_available = false WHERE id = $1', [id]);
      return res.redirect('/manager/menu?success=' + encodeURIComponent('Món ăn đã có trong lịch sử đơn hàng nên được chuyển sang trạng thái "Tạm ngưng phục vụ".'));
    }
    await db.query('DELETE FROM menu_items WHERE id = $1', [id]);
    res.redirect('/manager/menu?success=' + encodeURIComponent('Đã xóa món ăn khỏi hệ thống.'));
  } catch (err) {
    console.error('Delete menu item error:', err);
    res.status(500).redirect('/manager/menu?error=' + encodeURIComponent('Không thể xóa món ăn này.'));
  }
};

// 3. Quản lý Danh mục
exports.listCategories = async (req, res) => {
  try {
    const catRes = await db.query('SELECT * FROM categories ORDER BY sort_order ASC, name ASC');
    res.render('manager/categories', {
      title: 'Quản lý Danh mục',
      activeTab: 'menu',
      categories: catRes.rows,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('List categories error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Lỗi tải danh mục.' });
  }
};

exports.createCategory = async (req, res) => {
  const { name, sort_order, redirect_to } = req.body;
  const target = redirect_to || '/manager/menu';
  try {
    await db.query('INSERT INTO categories (name, sort_order) VALUES ($1, $2)', [name.trim(), parseInt(sort_order || '0', 10)]);
    res.redirect(target + '?success=' + encodeURIComponent('Thêm danh mục mới thành công.'));
  } catch (err) {
    res.status(400).redirect(target + '?error=' + encodeURIComponent('Tên danh mục đã tồn tại hoặc không hợp lệ.'));
  }
};

// 4. Quản Lý Bàn Ăn (Tab 3)
exports.listTables = async (req, res) => {
  try {
    const tableRes = await db.query('SELECT * FROM dining_tables ORDER BY id ASC');
    res.render('manager/tables', {
      title: 'Quản Lý Bàn Ăn - Dashboard Quản Trị',
      activeTab: 'tables',
      tables: tableRes.rows,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Lỗi tải danh sách bàn.' });
  }
};

exports.createTable = async (req, res) => {
  const { code, seats, status } = req.body;
  try {
    await db.query('INSERT INTO dining_tables (code, seats, status) VALUES ($1, $2, $3)', [code.trim(), parseInt(seats, 10), status || 'available']);
    res.redirect('/manager/tables?success=' + encodeURIComponent('Thêm bàn mới thành công! Đã đồng bộ sang trang Đặt món.'));
  } catch (err) {
    res.status(400).redirect('/manager/tables?error=' + encodeURIComponent('Mã bàn đã tồn tại hoặc số ghế không hợp lệ.'));
  }
};

exports.updateTableStatus = async (req, res) => {
  const { id } = req.params;
  const { status, seats, code } = req.body;
  try {
    if (seats && code) {
      await db.query('UPDATE dining_tables SET code = $1, seats = $2, status = $3 WHERE id = $4', [code.trim(), parseInt(seats, 10), status, id]);
    } else {
      await db.query('UPDATE dining_tables SET status = $1 WHERE id = $2', [status, id]);
    }
    res.redirect('/manager/tables?success=' + encodeURIComponent('Đã cập nhật trạng thái bàn và đồng bộ toàn hệ thống.'));
  } catch (err) {
    res.status(400).redirect('/manager/tables?error=' + encodeURIComponent('Không thể cập nhật thông tin bàn.'));
  }
};

// 5. Quản Trị Tài Khoản (Tab 4 - Đồng bộ mọi Role)
exports.listStaff = async (req, res) => {
  try {
    const usersRes = await db.query(`
      SELECT id, username, email, full_name, role, is_active, created_at
      FROM users
      ORDER BY
        CASE role WHEN 'manager' THEN 1 WHEN 'staff' THEN 2 ELSE 3 END,
        id ASC
    `);
    res.render('manager/staff', {
      title: 'Quản Trị Tài Khoản - Dashboard Quản Trị',
      activeTab: 'staff',
      staffList: usersRes.rows,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Lỗi tải danh sách tài khoản.' });
  }
};

exports.createStaff = async (req, res) => {
  const { username, email, password, full_name, role } = req.body;
  const validRole = ['customer', 'staff', 'manager'].includes(role) ? role : 'staff';
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    await db.query(`
      INSERT INTO users (username, email, password_hash, full_name, role)
      VALUES ($1, $2, $3, $4, $5)
    `, [username.trim(), email.trim(), hash, full_name.trim(), validRole]);
    res.redirect('/manager/staff?success=' + encodeURIComponent('Tạo tài khoản mới thành công!'));
  } catch (err) {
    res.status(400).redirect('/manager/staff?error=' + encodeURIComponent('Tên đăng nhập hoặc email đã tồn tại.'));
  }
};

exports.toggleStaffActive = async (req, res) => {
  const { id } = req.params;
  const currentUserId = req.session.user.id;

  if (parseInt(id, 10) === currentUserId) {
    return res.status(400).redirect('/manager/staff?error=' + encodeURIComponent('Bạn không thể tự khóa tài khoản của chính mình!'));
  }

  try {
    await db.query('UPDATE users SET is_active = NOT is_active WHERE id = $1', [id]);
    res.redirect('/manager/staff?success=' + encodeURIComponent('Cập nhật trạng thái hoạt động tài khoản thành công.'));
  } catch (err) {
    res.status(500).redirect('/manager/staff?error=' + encodeURIComponent('Lỗi khi cập nhật tài khoản.'));
  }
};

exports.updateStaffRole = async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  const currentUserId = req.session.user.id;

  if (parseInt(id, 10) === currentUserId && role !== 'manager') {
    return res.status(400).redirect('/manager/staff?error=' + encodeURIComponent('Không thể tự hạ quyền tài khoản Quản trị viên đang đăng nhập!'));
  }

  if (!['customer', 'staff', 'manager'].includes(role)) {
    return res.status(400).redirect('/manager/staff?error=' + encodeURIComponent('Vai trò không hợp lệ.'));
  }

  try {
    await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
    res.redirect('/manager/staff?success=' + encodeURIComponent('Đã cập nhật phân quyền vai trò (Role) thành công.'));
  } catch (err) {
    res.status(500).redirect('/manager/staff?error=' + encodeURIComponent('Lỗi khi cập nhật vai trò.'));
  }
};

// 6. Sổ Đặt Bàn (Tab 5)
exports.listReservations = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT r.*, t.code AS table_code, t.seats AS table_seats, u.full_name AS customer_name, u.email AS customer_email, u.username AS customer_username
      FROM reservations r
      JOIN dining_tables t ON r.table_id = t.id
      JOIN users u ON r.user_id = u.id
      ORDER BY r.reserved_at DESC, r.id DESC
    `);

    res.render('manager/reservations', {
      title: 'Sổ Đặt Bàn - Dashboard Quản Trị',
      activeTab: 'reservations',
      reservations: result.rows,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('Manager list reservations error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Không thể tải sổ đặt bàn.' });
  }
};

exports.updateReservationStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
    return res.status(400).redirect('/manager/reservations?error=' + encodeURIComponent('Trạng thái đặt bàn không hợp lệ.'));
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rRes = await client.query('SELECT table_id FROM reservations WHERE id = $1', [id]);
    if (rRes.rows.length > 0) {
      const tableId = rRes.rows[0].table_id;
      await client.query('UPDATE reservations SET status = $1 WHERE id = $2', [status, id]);
      if (status === 'confirmed') {
        await client.query("UPDATE dining_tables SET status = 'reserved' WHERE id = $1 AND status = 'available'", [tableId]);
      } else if (status === 'cancelled' || status === 'completed') {
        await client.query("UPDATE dining_tables SET status = 'available' WHERE id = $1 AND status = 'reserved'", [tableId]);
      }
    }
    await client.query('COMMIT');
    res.redirect('/manager/reservations?success=' + encodeURIComponent('Đã cập nhật trạng thái đặt bàn và đồng bộ trạng thái bàn ăn.'));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update reservation error:', err);
    res.status(500).redirect('/manager/reservations?error=' + encodeURIComponent('Lỗi khi cập nhật trạng thái đặt bàn.'));
  } finally {
    client.release();
  }
};
