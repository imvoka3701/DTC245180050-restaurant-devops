# Restaurant Order System - DevOps Project

## Thông tin sinh viên
- MSSV: DTC245180050
- Repository: DTC245180050-restaurant-devops

## Giới thiệu đề tài
Hệ thống Quản lý Nhà hàng / Đặt món (Restaurant Order System) bao gồm 12 container Docker Compose:
- **nginx**: Reverse proxy tiếp nhận truy cập HTTPS tự ký, chuyển tiếp tải và áp dụng security headers.
- **web**: Ứng dụng Node.js (Express + EJS SSR + CSS thuần).
- **db**: Cơ sở dữ liệu PostgreSQL 16.
- **pgadmin**: Công cụ quản trị giao diện trực quan cho cơ sở dữ liệu.
- **prometheus**: Thu thập số liệu giám sát (metrics).
- **grafana**: Bảng điều khiển trực quan hóa metrics và logs.
- **cadvisor**: Thu thập thông số tài nguyên phần cứng container.
- **nginx-exporter**: Thu thập metrics từ Nginx stub status.
- **postgres-exporter**: Thu thập metrics từ PostgreSQL.
- **loki**: Hệ thống lưu trữ và đánh chỉ mục log tập trung.
- **promtail**: Thu thập và đẩy log container về Loki.
- **alert-sink**: Tiếp nhận webhook cảnh báo sự cố an toàn thông tin.

## Hướng dẫn sinh Chứng chỉ SSL tự ký
Trước khi khởi động hoặc khi chuyển máy chủ / IP mới, chạy lệnh sau để sinh cặp khóa SSL:
```bash
chmod +x ./nginx/gen-cert.sh
./nginx/gen-cert.sh
```
Chứng chỉ được tạo tại `nginx/certs/server.crt` và khóa bí mật tại `nginx/certs/server.key` (được bảo vệ không đưa vào Git).

## Ba vai trò người dùng (RBAC)
- **customer**: Khách hàng (xem thực đơn, tìm kiếm, lọc, đặt bàn, hủy đặt bàn).
- **staff**: Nhân viên phục vụ / Thu ngân (quản lý đặt bàn, tạo đơn theo bàn, đổi trạng thái chế biến, thanh toán).
- **manager**: Quản lý (toàn quyền staff, CRUD món ăn & danh mục, quản lý bàn ăn, quản lý nhân viên, xem báo cáo KPI doanh thu).

## Khởi động hệ thống
Khởi động toàn bộ dịch vụ bằng một lệnh duy nhất:
```bash
docker compose up -d --build
```
