const db = require('../db');

exports.list = async (req, res) => {
  try {
    const user = req.session.user;
    let result;
    const isCustomer = user && user.role === 'customer';

    if (isCustomer) {
      result = await db.query(`
        SELECT o.*, t.code AS table_code, COALESCE(u.full_name, 'Khách tại bàn') AS staff_name
        FROM orders o
        JOIN dining_tables t ON o.table_id = t.id
        LEFT JOIN users u ON o.created_by = u.id
        WHERE o.created_by = $1
        ORDER BY o.created_at DESC
      `, [user.id]);
    } else {
      result = await db.query(`
        SELECT o.*, t.code AS table_code, COALESCE(u.full_name, 'Khách tại bàn') AS staff_name
        FROM orders o
        JOIN dining_tables t ON o.table_id = t.id
        LEFT JOIN users u ON o.created_by = u.id
        ORDER BY o.created_at DESC
      `);
    }

    const orders = result.rows;
    const orderItemsMap = {};

    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const itemsRes = await db.query(`
        SELECT oi.*, m.name AS item_name, m.image_path
        FROM order_items oi
        JOIN menu_items m ON oi.menu_item_id = m.id
        WHERE oi.order_id = ANY($1::int[])
        ORDER BY oi.id ASC
      `, [orderIds]);

      itemsRes.rows.forEach(it => {
        if (!orderItemsMap[it.order_id]) orderItemsMap[it.order_id] = [];
        orderItemsMap[it.order_id].push(it);
      });
    }

    orders.forEach(o => {
      o.items = orderItemsMap[o.id] || [];
    });

    res.render('orders/index', {
      title: isCustomer ? 'Đơn Món Của Tôi - Tiến Độ Phục Vụ' : 'Điều Phối Bếp (KDS) & Quản Lý Đơn Gọi Món',
      orders,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Không thể tải danh sách đơn hàng.' });
  }
};

exports.showNew = async (req, res) => {
  const user = req.session ? req.session.user : null;
  if (user && user.role === 'staff') return res.redirect('/orders');
  if (user && user.role === 'manager') return res.redirect('/manager/dashboard');
  return res.redirect('/');
};

exports.create = async (req, res) => {
  const { table_id, items, order_note, merge_order } = req.body;
  const user = req.session ? req.session.user : null;

  // KIỂM SOÁT PHÂN QUYỀN RBAC DOANH NGHIỆP:
  // Nhân viên phục vụ và Quản lý tuyệt đối không có quyền gọi món tại bàn
  if (user && (user.role === 'staff' || user.role === 'manager')) {
    return res.status(403).render('error', {
      title: '403 Forbidden - Lỗi Phân Quyền Nghiệp Vụ',
      message: 'Quyền hạn không hợp lệ: Tài khoản Nhân viên và Quản lý không có quyền gọi món tại bàn. Chức năng đặt món chỉ dành riêng cho Khách hàng.'
    });
  }

  let parsedItems = [];
  try {
    parsedItems = typeof items === 'string' ? JSON.parse(items) : items;
  } catch (e) {
    return res.status(400).redirect('/?error=' + encodeURIComponent('Dữ liệu giỏ hàng không hợp lệ.'));
  }

  if (!table_id || !Array.isArray(parsedItems) || parsedItems.length === 0) {
    return res.status(400).redirect('/?error=' + encodeURIComponent('Vui lòng chọn số bàn và ít nhất 1 món ăn trước khi gửi đơn hàng.'));
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    let creatorId = user ? user.id : null;
    if (!creatorId) {
      const fallbackUser = await client.query("SELECT id FROM users WHERE role = 'customer' ORDER BY id ASC LIMIT 1");
      creatorId = fallbackUser.rows.length > 0 ? fallbackUser.rows[0].id : null;
    }

    const cleanOrderNote = (order_note || '').trim();
    const shouldMerge = merge_order !== 'false';

    // Kiểm tra xem bàn này đang có đơn hàng nào chưa thanh toán không (để gộp đơn gọi thêm món)
    let existingOrder = null;
    if (shouldMerge) {
      const activeRes = await client.query(`
        SELECT id, order_code, status, total_amount, COALESCE(note, '') AS note
        FROM orders
        WHERE table_id = $1 AND status IN ('pending', 'preparing', 'served')
        ORDER BY id DESC
        LIMIT 1
        FOR UPDATE
      `, [table_id]);
      if (activeRes.rows.length > 0) {
        existingOrder = activeRes.rows[0];
      }
    }

    let orderId;
    let isMerged = false;

    if (existingOrder) {
      orderId = existingOrder.id;
      isMerged = true;
    } else {
      const orderCode = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);
      const orderInsert = await client.query(`
        INSERT INTO orders (order_code, table_id, created_by, status, total_amount, note)
        VALUES ($1, $2, $3, 'pending', 0, $4)
        RETURNING id
      `, [orderCode, table_id, creatorId, cleanOrderNote]);
      orderId = orderInsert.rows[0].id;
    }

    let validItemCount = 0;
    for (const it of parsedItems) {
      const menuId = parseInt(it.id || it.menu_item_id, 10);
      const qty = parseInt(it.qty || it.quantity, 10);
      const itemNote = (it.note || '').trim();

      if (!menuId || !qty || qty <= 0) continue;

      const menuRes = await client.query('SELECT price, is_available FROM menu_items WHERE id = $1', [menuId]);
      if (menuRes.rows.length === 0 || !menuRes.rows[0].is_available) continue;

      const unitPrice = parseFloat(menuRes.rows[0].price);

      if (isMerged) {
        const existItemRes = await client.query(`
          SELECT id, quantity, note FROM order_items
          WHERE order_id = $1 AND menu_item_id = $2 AND COALESCE(note, '') = $3
          LIMIT 1
          FOR UPDATE
        `, [orderId, menuId, itemNote]);

        if (existItemRes.rows.length > 0) {
          const newQty = existItemRes.rows[0].quantity + qty;
          await client.query('UPDATE order_items SET quantity = $1 WHERE id = $2', [newQty, existItemRes.rows[0].id]);
        } else {
          await client.query(`
            INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, note)
            VALUES ($1, $2, $3, $4, $5)
          `, [orderId, menuId, qty, unitPrice, itemNote]);
        }
      } else {
        await client.query(`
          INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, note)
          VALUES ($1, $2, $3, $4, $5)
        `, [orderId, menuId, qty, unitPrice, itemNote]);
      }
      validItemCount += qty;
    }

    if (validItemCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).redirect('/?error=' + encodeURIComponent('Không có món ăn hợp lệ trong giỏ hàng.'));
    }

    const sumRes = await client.query(`
      SELECT COALESCE(SUM(quantity * unit_price), 0) AS total
      FROM order_items
      WHERE order_id = $1
    `, [orderId]);
    const finalTotal = parseFloat(sumRes.rows[0].total || 0);

    if (isMerged) {
      let mergedNote = existingOrder.note || '';
      if (cleanOrderNote) {
        mergedNote = mergedNote ? (mergedNote + ' | Gọi thêm: ' + cleanOrderNote) : cleanOrderNote;
      }
      const nextStatus = existingOrder.status === 'served' ? 'preparing' : existingOrder.status;
      await client.query('UPDATE orders SET total_amount = $1, note = $2, status = $3 WHERE id = $4', [finalTotal, mergedNote, nextStatus, orderId]);
    } else {
      await client.query('UPDATE orders SET total_amount = $1 WHERE id = $2', [finalTotal, orderId]);
    }

    await client.query("UPDATE dining_tables SET status = 'occupied' WHERE id = $1", [table_id]);

    await client.query('COMMIT');
    const successMsg = isMerged
      ? `🔄 Đã gộp thêm ${validItemCount} phần vào hóa đơn đang mở (#${existingOrder.order_code}) của bàn thành công!`
      : '🎉 Đặt món thành công! Đơn hàng cùng ghi chú khẩu vị đã được chuyển tới nhà bếp.';
    res.redirect(`/orders/${orderId}?success=` + encodeURIComponent(successMsg));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create order error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Lỗi khi tạo đơn hàng: ' + err.message });
  } finally {
    client.release();
  }
};

exports.show = async (req, res) => {
  const { id } = req.params;
  const user = req.session ? req.session.user : null;

  try {
    const orderRes = await db.query(`
      SELECT o.*, t.code AS table_code, COALESCE(u.full_name, 'Khách tại bàn') AS staff_name
      FROM orders o
      JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.id = $1
    `, [id]);

    if (orderRes.rows.length === 0) {
      return res.status(404).render('error', { title: '404 Not Found', message: 'Không tìm thấy đơn hàng.' });
    }

    const order = orderRes.rows[0];

    // Khách hàng chỉ xem được đơn do chính mình đặt
    if (user && user.role === 'customer' && order.created_by && order.created_by !== user.id) {
      return res.status(403).render('error', {
        title: '403 Forbidden - Truy cập bị từ chối',
        message: 'Bạn không có quyền truy cập vào thông tin đơn hàng của khách hàng khác.'
      });
    }

    const itemsRes = await db.query(`
      SELECT oi.*, m.name AS item_name, m.image_path
      FROM order_items oi
      JOIN menu_items m ON oi.menu_item_id = m.id
      WHERE oi.order_id = $1
      ORDER BY oi.id ASC
    `, [id]);

    res.render('orders/show', {
      title: `Chi tiết Đơn hàng #${order.order_code}`,
      order,
      items: itemsRes.rows,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('Show order error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Không thể tải chi tiết đơn hàng.' });
  }
};

exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { next_status, return_to } = req.body;

  try {
    const currentRes = await db.query('SELECT status, table_id, order_code FROM orders WHERE id = $1', [id]);
    if (currentRes.rows.length === 0) {
      return res.status(404).render('error', { title: '404', message: 'Đơn hàng không tồn tại.' });
    }

    const currentStatus = currentRes.rows[0].status;
    const orderCode = currentRes.rows[0].order_code;

    const validTransitions = {
      pending: ['preparing', 'cancelled'],
      preparing: ['served', 'cancelled'],
      served: ['paid', 'cancelled'],
      paid: [],
      cancelled: []
    };

    if (!validTransitions[currentStatus] || !validTransitions[currentStatus].includes(next_status)) {
      const errUrl = return_to === 'kanban' ? `/orders?error=` : `/orders/${id}?error=`;
      return res.status(400).redirect(errUrl + encodeURIComponent(`Không thể chuyển từ trạng thái '${currentStatus}' sang '${next_status}'.`));
    }

    if (next_status === 'paid') {
      return res.redirect(`/orders/${id}/checkout`);
    }

    await db.query('UPDATE orders SET status = $1 WHERE id = $2', [next_status, id]);
    if (next_status === 'cancelled') {
      await db.query("UPDATE dining_tables SET status = 'available' WHERE id = $1", [currentRes.rows[0].table_id]);
    }

    if (return_to === 'kanban') {
      const label = next_status === 'preparing' ? 'Đang chế biến' : (next_status === 'served' ? 'Đã lên món đủ' : 'Đã hủy');
      return res.redirect('/orders?success=' + encodeURIComponent(`👨‍🍳 Đã chuyển đơn #${orderCode} sang trạng thái "${label}".`));
    }
    res.redirect(`/orders/${id}?success=` + encodeURIComponent('Cập nhật trạng thái đơn hàng thành công.'));
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Không thể cập nhật trạng thái đơn hàng.' });
  }
};

exports.showCheckout = async (req, res) => {
  const { id } = req.params;
  try {
    const orderRes = await db.query(`
      SELECT o.*, t.code AS table_code, COALESCE(u.full_name, 'Khách tại bàn') AS staff_name
      FROM orders o
      JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.id = $1
    `, [id]);

    if (orderRes.rows.length === 0) {
      return res.status(404).render('error', { title: '404', message: 'Không tìm thấy đơn hàng.' });
    }

    const order = orderRes.rows[0];
    if (order.status === 'paid') {
      return res.redirect(`/orders/${id}/invoice`);
    }

    const itemsRes = await db.query(`
      SELECT oi.*, m.name AS item_name, m.image_path
      FROM order_items oi
      JOIN menu_items m ON oi.menu_item_id = m.id
      WHERE oi.order_id = $1
      ORDER BY oi.id ASC
    `, [id]);

    res.render('orders/checkout', {
      title: `Thu Ngân & Thanh Toán Đơn #${order.order_code}`,
      order,
      items: itemsRes.rows,
      error: null
    });
  } catch (err) {
    console.error('Show checkout error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Lỗi tải trang thanh toán.' });
  }
};

exports.processPayment = async (req, res) => {
  const { id } = req.params;
  const { payment_method, amount_paid } = req.body;

  if (!['cash', 'card', 'qr'].includes(payment_method)) {
    return res.status(400).render('error', { title: 'Lỗi 400', message: 'Phương thức thanh toán không hợp lệ.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const orderRes = await client.query('SELECT o.*, t.code AS table_code FROM orders o JOIN dining_tables t ON o.table_id = t.id WHERE o.id = $1 FOR UPDATE OF o', [id]);
    if (orderRes.rows.length === 0) {
      throw new Error('Đơn hàng không tồn tại.');
    }

    const order = orderRes.rows[0];
    if (order.status === 'paid') {
      await client.query('ROLLBACK');
      return res.redirect(`/orders/${id}/invoice`);
    }

    const total = parseFloat(order.total_amount);
    let paid = parseFloat(amount_paid);

    if (payment_method === 'card' || payment_method === 'qr') {
      paid = total;
    }

    if (isNaN(paid) || paid < total) {
      const itemsRes = await client.query(`
        SELECT oi.*, m.name AS item_name, m.image_path
        FROM order_items oi
        JOIN menu_items m ON oi.menu_item_id = m.id
        WHERE oi.order_id = $1
        ORDER BY oi.id ASC
      `, [id]);
      await client.query('ROLLBACK');
      return res.status(400).render('orders/checkout', {
        title: 'Thanh toán Đơn hàng',
        order,
        items: itemsRes.rows,
        error: `Số tiền khách đưa (${(paid || 0).toLocaleString('vi-VN')} ₫) nhỏ hơn tổng hóa đơn (${total.toLocaleString('vi-VN')} ₫).`
      });
    }

    const change = paid - total;

    await client.query(`
      UPDATE orders
      SET status = 'paid', payment_method = $1, amount_paid = $2, change_amount = $3, paid_at = CURRENT_TIMESTAMP
      WHERE id = $4
    `, [payment_method, paid, change, id]);

    await client.query("UPDATE dining_tables SET status = 'available' WHERE id = $1", [order.table_id]);

    await client.query('COMMIT');
    res.redirect(`/orders/${id}/invoice`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Payment error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Lỗi khi xử lý thanh toán: ' + err.message });
  } finally {
    client.release();
  }
};

exports.showInvoice = async (req, res) => {
  const { id } = req.params;
  const user = req.session ? req.session.user : null;

  try {
    const orderRes = await db.query(`
      SELECT o.*, t.code AS table_code, COALESCE(u.full_name, 'Khách tại bàn') AS staff_name
      FROM orders o
      JOIN dining_tables t ON o.table_id = t.id
      LEFT JOIN users u ON o.created_by = u.id
      WHERE o.id = $1
    `, [id]);

    if (orderRes.rows.length === 0) {
      return res.status(404).render('error', { title: '404', message: 'Không tìm thấy hóa đơn.' });
    }

    const order = orderRes.rows[0];

    // Khách hàng chỉ xem được hóa đơn của mình
    if (user && user.role === 'customer' && order.created_by && order.created_by !== user.id) {
      return res.status(403).render('error', { title: '403 Forbidden', message: 'Bạn không có quyền xem hóa đơn của khách hàng khác.' });
    }

    const itemsRes = await db.query(`
      SELECT oi.*, m.name AS item_name
      FROM order_items oi
      JOIN menu_items m ON oi.menu_item_id = m.id
      WHERE oi.order_id = $1
      ORDER BY oi.id ASC
    `, [id]);

    res.render('orders/invoice', {
      title: `Hóa đơn #${order.order_code}`,
      order,
      items: itemsRes.rows
    });
  } catch (err) {
    console.error('Invoice error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Không thể xem hóa đơn.' });
  }
};
