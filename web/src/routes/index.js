const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const menuController = require('../controllers/menuController');
const reservationController = require('../controllers/reservationController');
const orderController = require('../controllers/orderController');
const managerController = require('../controllers/managerController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Public & Customer Ordering Routes
router.get('/', menuController.getMenu);
router.get('/login', authController.showLogin);
router.post('/login', authController.login);
router.get('/register', authController.showRegister);
router.post('/register', authController.register);
router.get('/logout', authController.logout);
router.post('/logout', authController.logout);

// Reservations (Customer, Staff, Manager)
router.get('/reservations', requireAuth, reservationController.list);
router.get('/reservations/new', requireRole('customer'), reservationController.showNew);
router.post('/reservations', requireRole('customer'), reservationController.create);
router.post('/reservations/:id/status', requireAuth, reservationController.updateStatus);

// Orders (Create & View Receipt allowed from Homepage; Kitchen Status & Cashier Checkout for Staff/Manager)
router.get('/orders', requireAuth, orderController.list);
router.get('/orders/new', orderController.showNew);
router.post('/orders', orderController.create);
router.get('/orders/:id', orderController.show);
router.post('/orders/:id/status', requireRole('staff', 'manager'), orderController.updateStatus);
router.get('/orders/:id/checkout', requireRole('staff', 'manager'), orderController.showCheckout);
router.post('/orders/:id/checkout', requireRole('staff', 'manager'), orderController.processPayment);
router.get('/orders/:id/invoice', orderController.showInvoice);

// Manager / Admin Dashboard Routes (Role 'manager')
router.get('/manager/dashboard', requireRole('manager'), managerController.dashboard);
router.get('/manager/dashboard/export', requireRole('manager'), managerController.exportRevenueCSV);

router.get('/manager/menu', requireRole('manager'), managerController.listMenu);
router.post('/manager/menu', requireRole('manager'), managerController.uploadMiddleware, managerController.createMenuItem);
router.post('/manager/menu/:id', requireRole('manager'), managerController.uploadMiddleware, managerController.updateMenuItem);
router.post('/manager/menu/:id/delete', requireRole('manager'), managerController.deleteMenuItem);

router.get('/manager/categories', requireRole('manager'), managerController.listCategories);
router.post('/manager/categories', requireRole('manager'), managerController.createCategory);

router.get('/manager/tables', requireRole('manager'), managerController.listTables);
router.post('/manager/tables', requireRole('manager'), managerController.createTable);
router.post('/manager/tables/:id/status', requireRole('manager'), managerController.updateTableStatus);

router.get('/manager/staff', requireRole('manager'), managerController.listStaff);
router.post('/manager/staff', requireRole('manager'), managerController.createStaff);
router.post('/manager/staff/:id/toggle', requireRole('manager'), managerController.toggleStaffActive);
router.post('/manager/staff/:id/role', requireRole('manager'), managerController.updateStaffRole);

router.get('/manager/reservations', requireRole('manager'), managerController.listReservations);
router.post('/manager/reservations/:id/status', requireRole('manager'), managerController.updateReservationStatus);

module.exports = router;
