-- ====================================================================
-- SCHEMA CƠ SỞ DỮ LIỆU NHÀ HÀNG (7 BẢNG THEO YÊU CẦU ĐỀ BÀI)
-- ====================================================================

-- 1. BẢNG USERS (Người dùng hệ thống)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('customer', 'staff', 'manager')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. BẢNG CATEGORIES (Danh mục món ăn)
CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    sort_order INT DEFAULT 0
);

-- 3. BẢNG MENU_ITEMS (Thực đơn món ăn)
CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    category_id INT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    price NUMERIC(12, 0) NOT NULL CHECK (price >= 0),
    image_path VARCHAR(255),
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 4. BẢNG DINING_TABLES (Bàn ăn)
CREATE TABLE IF NOT EXISTS dining_tables (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    seats INT NOT NULL CHECK (seats > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved'))
);

-- 5. BẢNG RESERVATIONS (Đặt bàn trước)
CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    table_id INT NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
    party_size INT NOT NULL CHECK (party_size > 0),
    reserved_at TIMESTAMPTZ NOT NULL,
    note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 6. BẢNG ORDERS (Đơn gọi món tại bàn)
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_code VARCHAR(30) UNIQUE NOT NULL,
    table_id INT NOT NULL REFERENCES dining_tables(id) ON DELETE RESTRICT,
    created_by INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'served', 'paid', 'cancelled')),
    total_amount NUMERIC(12, 0) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    payment_method VARCHAR(20) NULL CHECK (payment_method IN ('cash', 'card', 'qr')),
    amount_paid NUMERIC(12, 0) DEFAULT 0 CHECK (amount_paid >= 0),
    change_amount NUMERIC(12, 0) DEFAULT 0 CHECK (change_amount >= 0),
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMPTZ NULL
);

-- 7. BẢNG ORDER_ITEMS (Chi tiết món ăn trong đơn hàng)
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INT NOT NULL REFERENCES menu_items(id) ON DELETE RESTRICT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(12, 0) NOT NULL CHECK (unit_price >= 0),
    note TEXT DEFAULT ''
);

-- INDEXES TỐI ƯU TRUY VẤN
CREATE INDEX IF NOT EXISTS idx_menu_category ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_available ON menu_items(is_available);
CREATE INDEX IF NOT EXISTS idx_reservations_lookup ON reservations(table_id, reserved_at);
CREATE INDEX IF NOT EXISTS idx_reservations_user ON reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_table ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ====================================================================
-- SEED DATA CHUẨN
-- ====================================================================

-- 1. USERS SEED (Mật khẩu được băm bằng bcrypt, không để plaintext)
INSERT INTO users (username, email, password_hash, full_name, role) VALUES
('admin', 'admin@restaurant.local', '$2b$10$N0JYdGMUGDECS/oFV3hPB.f.XZ6rVV7A2cq2O/SBFQ8GGSSp304f6', 'Quản Lý Nhà Hàng', 'manager'),
('nhanvien01', 'nv01@restaurant.local', '$2b$10$N0JYdGMUGDECS/oFV3hPB.4ojW7bgGHcE7yz5JsbikkjXbQgaDEZO', 'Nguyễn Phục Vụ', 'staff'),
('nhanvien02', 'nv02@restaurant.local', '$2b$10$N0JYdGMUGDECS/oFV3hPB.4ojW7bgGHcE7yz5JsbikkjXbQgaDEZO', 'Trần Thu Ngân', 'staff'),
('khach01', 'khach01@gmail.com', '$2b$10$N0JYdGMUGDECS/oFV3hPB.wxig.c7lWoBLsRR0yg/3Sjjh9GZwD.y', 'Lê Khách Hàng', 'customer'),
('khach02', 'khach02@gmail.com', '$2b$10$N0JYdGMUGDECS/oFV3hPB.wxig.c7lWoBLsRR0yg/3Sjjh9GZwD.y', 'Phạm Ăn Uống', 'customer')
ON CONFLICT (username) DO NOTHING;

-- 2. CATEGORIES SEED (5 danh mục)
INSERT INTO categories (id, name, sort_order) VALUES
(1, 'Khai vị', 1),
(2, 'Món chính', 2),
(3, 'Lẩu & Nướng', 3),
(4, 'Tráng miệng', 4),
(5, 'Đồ uống', 5)
ON CONFLICT (name) DO NOTHING;

-- 3. DINING TABLES SEED (10 bàn với sức chứa khác nhau)
INSERT INTO dining_tables (code, seats, status) VALUES
('Bàn 01', 2, 'available'),
('Bàn 02', 2, 'available'),
('Bàn 03', 4, 'available'),
('Bàn 04', 4, 'available'),
('Bàn 05', 4, 'available'),
('Bàn 06', 6, 'available'),
('Bàn 07', 6, 'available'),
('Bàn 08', 8, 'available'),
('Bàn 09', 8, 'available'),
('Bàn 10', 12, 'available')
ON CONFLICT (code) DO NOTHING;

-- 4. MENU ITEMS SEED (24 món ăn & đồ uống Nhà hàng Á Đông)
INSERT INTO menu_items (category_id, name, description, price, image_path, is_available) VALUES
(1, 'Sashimi Cá Hồi & Cá Ngừ Đại Dương', 'Cá hồi Na Uy và cá ngừ tươi cắt lát dày, dùng kèm củ cải bào, lá tía tô Nhật và Wasabi tươi.', 125000, '/images/menu/dish-01.svg', true),
(1, 'Há Cảo Tôm Tươi Hoàng Kim (Dimsum)', 'Vỏ bột trong suốt mềm dai gói trọn nhân tôm sú tươi giòn sần sật hấp xửng tre truyền thống.', 68000, '/images/menu/dish-02.svg', true),
(1, 'Bánh Xếp Nhật Áp Chảo Gyoza', 'Bánh xếp nhân thịt heo băm, bắp cải và hẹ áp chảo đế giòn vàng rụm, chấm xì dầu giấm đen Nhật Bản.', 65000, '/images/menu/dish-03.svg', true),
(1, 'Súp Miso Đậu Hũ Non & Rong Biển', 'Nước dùng Dashi cá bào thanh ngọt nấu cùng tương đậu nành Miso đỏ, đậu hũ non mềm mịn và rong biển Wakame.', 45000, '/images/menu/dish-04.svg', true),
(2, 'Mì Ramen Tonkotsu Xá Xíu Nhật Bản', 'Nước súp xương heo hầm 18 tiếng đậm đà, sợi mì tươi dai, thịt Chashu khò lửa và trứng lòng đào Ajitsuke.', 115000, '/images/menu/dish-05.svg', true),
(2, 'Cơm Lươn Nhật Nướng Sốt Kabayaki', 'Lươn Nhật nướng than hoa phết sốt Kabayaki đậm đà ngọt dịu trên nền cơm gạo Nhật Koshihikari dẻo thơm.', 165000, '/images/menu/dish-06.svg', true),
(2, 'Tôm Tempura Hoàng Kim & Rau Củ', 'Tôm sú biển và rau củ theo mùa tẩm bột Tempura chiên giòn xốp nhẹ, chấm sốt Tentsuyu củ cải mài.', 120000, '/images/menu/dish-07.svg', true),
(2, 'Vịt Quay Bắc Kinh Da Giòn Hồng Kông', 'Vịt quay lò củi da giòn bóng bẩy, thịt mềm mọng nước cuốn cùng bánh tráng mỏng và sốt tương Hoisin.', 195000, '/images/menu/dish-08.svg', true),
(2, 'Cơm Trộn Bò Bulgogi Thố Đá (Bibimbap)', 'Cơm nóng giòn đáy thố đá trộn thịt bò Bulgogi, 5 loại rau củ theo mùa, trứng lòng đào và sốt Gochujang.', 95000, '/images/menu/dish-09.svg', true),
(2, 'Cá Hồi Na Uy Áp Chảo Sốt Teriyaki', 'Phi lê cá hồi Na Uy áp chảo da giòn rưới sốt Teriyaki mật ong bóng mượt, rắc mè rang và măng tây xanh.', 175000, '/images/menu/dish-10.svg', true),
(3, 'Lẩu Sukiyaki Bò Wagyu Thượng Hạng', 'Bò Wagyu vân cẩm thạch nhúng nước lẩu Sukiyaki ngọt thanh từ rượu Mirin, xì dầu Nhật, nấm Enoki và đậu hũ.', 349000, '/images/menu/dish-11.svg', true),
(3, 'Lẩu Tứ Xuyên Mala Cay Tê & Nấm Quý', 'Lẩu uyên ương 2 ngăn: một bên cay tê tiêu hồng Tứ Xuyên, một bên canh nấm Matsutake hầm xương bổ dưỡng.', 299000, '/images/menu/dish-12.svg', true),
(3, 'Dẻ Sườn Bò Mỹ Nướng Sốt Tare (Yakiniku)', 'Dẻ sườn bò Karubi cắt lát ướp sốt Tare trái cây nướng than hồng thơm lừng, mềm tan trong miệng.', 215000, '/images/menu/dish-13.svg', true),
(3, 'Ba Chỉ Bò Cuộn Nấm Kim Châm Nướng Miso', 'Thịt ba chỉ bò Mỹ cuộn nấm kim châm tươi nướng sốt tương Miso mật ong và mè trắng rang thơm.', 135000, '/images/menu/dish-14.svg', true),
(4, 'Bánh Mochi Trà Xanh Matcha Nhân Đậu Đỏ', 'Vỏ bánh gạo nếp Nhật dẻo mịn phủ bột trà xanh Uji Kyoto nguyên chất, nhân đậu đỏ Azuki ngọt dịu.', 45000, '/images/menu/dish-15.svg', true),
(4, 'Pudding Đậu Nành Sốt Đường Đen Okinawa', 'Tàu hũ pudding mềm tan như lụa làm từ đậu nành hữu cơ, rưới mật đường đen Okinawa và bột đậu Kinako.', 38000, '/images/menu/dish-16.svg', true),
(4, 'Chè Khúc Bạch Hạnh Nhân & Vải Thiều', 'Khúc bạch phô mai kem sữa béo thanh, hạnh nhân lát nướng giòn kết hợp vải thiều mọng nước mát lạnh.', 48000, '/images/menu/dish-17.svg', true),
(4, 'Bánh Cá Taiyaki Nhân Kem Custard Vani', 'Bánh nướng hình cá tráp Nhật Bản vỏ giòn thơm bơ, nhân kem trứng sữa Custard nóng hổi béo mịn.', 42000, '/images/menu/dish-18.svg', true),
(5, 'Trà Xanh Matcha Uji Kem Phô Mai', 'Trà xanh Matcha Uji Nhật Bản đánh bông thủ công kết hợp lớp kem phô mai Hokkaido mặn ngọt sánh mịn.', 55000, '/images/menu/dish-19.svg', true),
(5, 'Trà Ô Long Hoa Quế Đào Hồng Đài Loan', 'Trà Ô Long cao sơn ủ hương hoa mộc quế thơm ngát, kết hợp đào hồng giòn ngọt thanh mát.', 49000, '/images/menu/dish-20.svg', true),
(5, 'Sữa Tươi Trân Châu Đường Đen Okinawa', 'Trân châu hoàng kim nấu chậm trong mật đường đen Okinawa ấm nóng quyện cùng sữa tươi Meiji thanh mát.', 52000, '/images/menu/dish-21.svg', true),
(5, 'Trà Yuzu Mật Ong Thanh Yên Hàn Quốc', 'Quả thanh yên Yuzu vàng ươm giàu vitamin C pha cùng mật ong rừng và soda mát lạnh sảng khoái.', 48000, '/images/menu/dish-22.svg', true),
(3, 'Lẩu Nấm Trường Thọ Matsutake Nhật Bản', 'Sự kết hợp tinh tế của 6 loại nấm quý Á Đông (Matsutake, Đông trùng, Kim châm) trong nước dùng thanh ngọt.', 285000, '/images/menu/dish-23.svg', true),
(3, 'Lẩu Tomyum Hải Sản Hoàng Gia Thái Lan', 'Nước lẩu Tomyum cốt dừa chua cay nồng đượm lá chanh Kaffir, sả tươi cùng tôm càng, mực ống và vẹm xanh.', 329000, '/images/menu/dish-24.svg', true)
ON CONFLICT DO NOTHING;

-- Đặt chuỗi id tự tăng khớp với id lớn nhất hiện tại
SELECT setval('categories_id_seq', (SELECT MAX(id) FROM categories));
SELECT setval('menu_items_id_seq', (SELECT MAX(id) FROM menu_items));
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('dining_tables_id_seq', (SELECT MAX(id) FROM dining_tables));
