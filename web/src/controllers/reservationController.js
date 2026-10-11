const db = require('../db');

exports.list = async (req, res) => {
  const user = req.session.user;
  try {
    let result;
    if (user.role === 'customer') {
      result = await db.query(`
        SELECT r.*, t.code AS table_code
        FROM reservations r
        JOIN dining_tables t ON r.table_id = t.id
        WHERE r.user_id = $1
        ORDER BY r.reserved_at DESC
      `, [user.id]);
    } else {
      result = await db.query(`
        SELECT r.*, t.code AS table_code, u.full_name AS customer_name, u.email AS customer_email
        FROM reservations r
        JOIN dining_tables t ON r.table_id = t.id
        JOIN users u ON r.user_id = u.id
        ORDER BY r.reserved_at DESC
      `);
    }

    res.render('reservations/index', {
      title: 'Danh sách Đặt bàn',
      reservations: result.rows,
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('List reservations error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Không thể tải danh sách đặt bàn.' });
  }
};

exports.showNew = (req, res) => {
  res.render('reservations/new', { title: 'Đặt bàn mới', error: null });
};

exports.create = async (req, res) => {
  const { party_size, reserved_at, note } = req.body;
  const user = req.session.user;

  const partySizeNum = parseInt(party_size, 10);
  if (isNaN(partySizeNum) || partySizeNum <= 0) {
    return res.status(400).render('reservations/new', { title: 'Đặt bàn mới', error: 'Số lượng khách không hợp lệ.' });
  }

  if (!reserved_at) {
    return res.status(400).render('reservations/new', { title: 'Đặt bàn mới', error: 'Vui lòng chọn thời gian đặt bàn.' });
  }

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    const tableQuery = `
      SELECT t.id, t.code
      FROM dining_tables t
      WHERE t.seats >= $1
        AND NOT EXISTS (
          SELECT 1 FROM reservations r
          WHERE r.table_id = t.id
            AND r.status IN ('pending', 'confirmed')
            AND r.reserved_at >= ($2::timestamptz - interval '2 hours')
            AND r.reserved_at <= ($2::timestamptz + interval '2 hours')
        )
      ORDER BY t.seats ASC, t.id ASC
      LIMIT 1
      FOR UPDATE OF t
    `;

    const tableRes = await client.query(tableQuery, [partySizeNum, reserved_at]);
    if (tableRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).render('reservations/new', {
        title: 'Đặt bàn mới',
        error: 'Rất tiếc! Không còn bàn trống phù hợp với số lượng khách trong khung giờ này. Vui lòng chọn thời gian khác.'
      });
    }

    const tableId = tableRes.rows[0].id;
    await client.query(`
      INSERT INTO reservations (user_id, table_id, party_size, reserved_at, note, status)
      VALUES ($1, $2, $3, $4, $5, 'pending')
    `, [user.id, tableId, partySizeNum, reserved_at, note || '']);

    await client.query('COMMIT');
    res.redirect('/reservations?success=' + encodeURIComponent('Đặt bàn thành công! Đã đồng bộ vào Sổ Đặt Bàn của nhà hàng.'));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Reservation error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Lỗi hệ thống khi đặt bàn.' });
  } finally {
    client.release();
  }
};

exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const user = req.session.user;

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const rRes = await client.query('SELECT table_id, user_id, status FROM reservations WHERE id = $1', [id]);
    if (rRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).render('error', { title: '404', message: 'Không tìm thấy lịch đặt bàn.' });
    }
    const rRow = rRes.rows[0];

    if (user.role === 'customer') {
      if (status !== 'cancelled') {
        await client.query('ROLLBACK');
        return res.status(403).render('error', { title: '403 Forbidden', message: 'Khách hàng chỉ có quyền hủy đặt bàn của mình.' });
      }
      await client.query(`
        UPDATE reservations SET status = 'cancelled'
        WHERE id = $1 AND user_id = $2 AND status = 'pending'
      `, [id, user.id]);
    } else {
      if (!['pending', 'confirmed', 'cancelled', 'completed'].includes(status)) {
        await client.query('ROLLBACK');
        return res.status(400).render('error', { title: '400 Bad Request', message: 'Trạng thái không hợp lệ.' });
      }
      await client.query(`UPDATE reservations SET status = $1 WHERE id = $2`, [status, id]);
      if (status === 'confirmed') {
        await client.query("UPDATE dining_tables SET status = 'reserved' WHERE id = $1 AND status = 'available'", [rRow.table_id]);
      } else if (status === 'cancelled' || status === 'completed') {
        await client.query("UPDATE dining_tables SET status = 'available' WHERE id = $1 AND status = 'reserved'", [rRow.table_id]);
      }
    }

    await client.query('COMMIT');
    res.redirect('/reservations?success=' + encodeURIComponent('Cập nhật trạng thái đặt bàn thành công.'));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update reservation status error:', err);
    res.status(500).render('error', { title: 'Lỗi 500', message: 'Không thể cập nhật đặt bàn.' });
  } finally {
    client.release();
  }
};
