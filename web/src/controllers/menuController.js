const db = require('../db');

exports.getMenu = async (req, res) => {
  const user = req.session ? req.session.user : null;

  // Lớp phòng thủ RBAC: Nhân viên và Quản lý không truy cập giao diện đặt món của thực khách
  if (user && user.role === 'staff') {
    return res.redirect('/orders');
  }
  if (user && user.role === 'manager') {
    return res.redirect('/manager/dashboard');
  }

  const { category, search, sort, table } = req.query;

  try {
    const catResult = await db.query('SELECT * FROM categories ORDER BY sort_order ASC, name ASC');
    const categories = catResult.rows;

    const tablesResult = await db.query('SELECT * FROM dining_tables ORDER BY id ASC');
    const tables = tablesResult.rows;

    const itemResult = await db.query(`
      SELECT m.*, c.name AS category_name
      FROM menu_items m
      JOIN categories c ON m.category_id = c.id
      WHERE m.is_available = true
      ORDER BY c.sort_order ASC, m.name ASC
    `);

    res.render('index', {
      title: 'Đặt món - Nhà Hàng Á Đông Sakura',
      categories,
      tables,
      items: itemResult.rows,
      selectedCategory: category || 'all',
      searchQuery: search || '',
      selectedSort: sort || 'name_asc',
      selectedTable: table || '',
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('Get menu error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Không thể tải thực đơn và danh sách bàn.' });
  }
};
