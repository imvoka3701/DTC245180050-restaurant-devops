# TÀI LIỆU TỔNG HỢP NỘI DUNG VÀ MINH CHỨNG CHO BÁO CÁO MÔN HỌC
**Học phần:** Triển khai và Quản trị Hệ thống Phần mềm (DevOps)  
**Đề tài:** Hệ thống Quản lý Nhà hàng & Đặt món (Restaurant Order System)  
**Sinh viên thực hiện:** Trần Danh Đức - **MSSV:** DTC245180050  
**Repository:** `https://github.com/imvoka3107/DTC245180050-restaurant-devops.git`

---

## BẢNG TỔNG HỢP THÀNH PHẦN & PHIÊN BẢN THỰC TẾ (LẤY TỪ DOCKER COMPOSE)

| STT | Tên Dịch Vụ | Tên Container | Image & Tag Cố Định Thực Tế | Cổng Container | Mục Đích Sử Dụng |
|---|---|---|---|---|---|
| 1 | `nginx` | `restaurant-nginx` | `nginx:1.27.1-alpine` | `80/tcp`, `443/tcp` (Host 80, 443) | Reverse Proxy, SSL Termination, Rate Limiting |
| 2 | `web` | `restaurant-web` | Custom build (`node:20.18.0-alpine3.20`) | `3000/tcp` (Nội bộ) | Web Application Node.js (SSR Express + EJS) |
| 3 | `db` | `restaurant-db` | `postgres:16.4-alpine3.20` | `5432/tcp` (Nội bộ) | Hệ quản trị cơ sở dữ liệu quan hệ PostgreSQL 16 |
| 4 | `pgadmin` | `restaurant-pgadmin` | `dpage/pgadmin4:8.11` | `80/tcp` (Nội bộ) | Quản trị giao diện CSDL qua đường dẫn `/pgadmin/` |
| 5 | `prometheus` | `restaurant-prometheus` | `prom/prometheus:v3.14.0` | `9090/tcp` (Nội bộ) | Máy chủ lưu trữ và thu thập Metrics (retention 7d) |
| 6 | `grafana` | `restaurant-grafana` | `grafana/grafana:13.2.2` | `3000/tcp` (Nội bộ) | Bảng điều khiển trực quan hóa Metrics & Logs (`/grafana/`) |
| 7 | `cadvisor` | `restaurant-cadvisor` | `gcr.io/cadvisor/cadvisor:v0.55.1` | `8080/tcp` (Nội bộ) | Thu thập metrics tài nguyên phần cứng container |
| 8 | `nginx-exporter`| `restaurant-nginx-exporter`| `nginx/nginx-prometheus-exporter:1.3.0`| `9113/tcp` (Nội bộ) | Thu thập metrics Nginx stub_status |
| 9 | `postgres-exporter`|`restaurant-postgres-exporter`|`prometheuscommunity/postgres-exporter:v0.15.0`|`9187/tcp` (Nội bộ)| Thu thập metrics CSDL PostgreSQL |
| 10 | `loki` | `restaurant-loki` | `grafana/loki:3.1.1` | `3100/tcp` (Nội bộ) | Hệ thống lưu trữ và đánh chỉ mục Log tập trung |
| 11 | `promtail` | `restaurant-promtail` | `grafana/promtail:3.1.1` | Không publish | Thu thập log container từ Docker daemon đẩy về Loki |
| 12 | `alert-sink` | `restaurant-alert-sink` | Custom build (`node:20.18.0-alpine3.20`) | `8080/tcp` (Nội bộ) | Microservice tiếp nhận Webhook cảnh báo an toàn thông tin |

### Số liệu thống kê Thực tế trên Git Repository:
- **Số lượng container hoạt động:** Đúng 12 container (`12/12 Up healthy`).
- **Tổng số Commit:** Đúng 3 Commit:
  - **Commit 1 (`c603019`):** 61 files changed, 2,962 insertions(+).
  - **Commit 2 (`43404f2`):** 12 files changed, 696 insertions(+), 23 deletions(-).
  - **Commit 3 (`6a30f9e`):** 17 files changed, 1,126 insertions(+), 51 deletions(-).

---

## CHƯƠNG 1: TỔNG QUAN HỆ THỐNG VÀ THIẾT LẬP MÔI TRƯỜNG

### (a) Đoạn mô tả văn phong báo cáo:
"Hệ thống Quản lý Nhà hàng và Đặt món (Restaurant Order System) được xây dựng trên nền tảng máy ảo Ubuntu 24.04 LTS với kiến trúc microservices container hóa hoàn toàn bằng Docker Compose v2. Toàn bộ mã nguồn và cấu hình được quản lý phiên bản qua Git tuân thủ quy tắc quản trị vòng đời phát triển phần mềm chặt chẽ. Môi trường triển khai đảm bảo các tiêu chuẩn an toàn thông tin: các biến cấu hình và mật khẩu bí mật được tách rời hoàn toàn khỏi mã nguồn thông qua file `.env` được bảo vệ bằng quyền truy cập nghiêm ngặt (`chmod 600`), các khóa bí mật chứng chỉ số SSL và thư viện phụ thuộc được loại trừ khỏi kho mã nguồn thông qua `.gitignore`."

### (b) Đường dẫn file cấu hình đưa vào báo cáo:
- `docker-compose.yml` (khối dịch vụ cơ bản và cấu hình networks).
- `.env.example` (cấu trúc tham số môi trường chuẩn).
- `.gitignore` (chính sách loại trừ dữ liệu nhạy cảm).

### (c) File evidence tương ứng:
- `evidence/buoc0-moitruong.txt` (Thông tin phần cứng VM, OS Ubuntu 24.04, Docker version, Git config).

### (d) Danh sách ảnh cần chụp & Lệnh thực thi:
1. **Ảnh 1.1: Thông tin hệ điều hành và phiên bản Docker**
   - *Lệnh thực thi:* `uname -a && docker --version && docker compose version`
2. **Ảnh 1.2: Cấu trúc thư mục dự án và trạng thái Git sạch**
   - *Lệnh thực thi:* `cd ~/restaurant && ls -la && git status`

---

## CHƯƠNG 2: TRIỂN KHAI ỨNG DỤNG WEB VÀ CƠ SỞ DỮ LIỆU POSTGRESQL

### (a) Đoạn mô tả văn phong báo cáo:
"Ứng dụng web được phát triển bằng Node.js 20 LTS sử dụng mô hình Server-Side Rendering (SSR) với Express framework và template engine EJS kết hợp giao diện CSS thuần hiện đại. Cơ sở dữ liệu sử dụng PostgreSQL 16 Alpine với mô hình 7 bảng chuẩn hóa: `users`, `categories`, `menu_items`, `dining_tables`, `reservations`, `orders`, `order_items`. Toàn bộ các ràng buộc toàn vẹn dữ liệu (khóa chính, khóa ngoại `ON DELETE RESTRICT/CASCADE`, ràng buộc kiểm tra `CHECK` giá tiền >= 0, số ghế > 0) và chỉ mục tối ưu hóa truy vấn (`INDEX`) được định nghĩa trong file khởi tạo `db/init.sql`. Hệ thống phân quyền RBAC phân tách 3 vai trò rõ rệt: `customer` (xem thực đơn, đặt bàn), `staff` (quản lý đặt bàn, tạo đơn theo bàn, đổi trạng thái chế biến, thanh toán xuất hóa đơn), và `manager` (CRUD món ăn kèm upload ảnh minh họa, quản lý bàn ăn, nhân viên và xem KPI doanh thu)."

### (b) Đường dẫn file cấu hình đưa vào báo cáo:
- `db/init.sql` (Cấu trúc DDL 7 bảng và dữ liệu mẫu).
- `web/Dockerfile` (Cấu hình đóng gói ứng dụng Node.js với non-root user).
- `web/src/controllers/orderController.js` và `web/src/controllers/managerController.js` (Nghiệp vụ cốt lõi).

### (c) File evidence tương ứng:
- `evidence/buoc12-web-db.txt` (Log tạo 7 bảng CSDL, quan hệ khóa ngoại, index, dữ liệu seed, kiểm thử API web).

### (d) Danh sách ảnh cần chụp & Lệnh thực thi:
1. **Ảnh 2.1: Bảng dữ liệu PostgreSQL trong pgAdmin**
   - *Thực hiện:* Truy cập `https://<VM_IP>/pgadmin/`, đăng nhập và mở cây cấu trúc CSDL `restaurant` -> xem 7 bảng.
2. **Ảnh 2.2: Giao diện Trang chủ và Thực đơn món ăn**
   - *Thực hiện:* Truy cập `https://<VM_IP>/` xem danh sách món ăn, lọc danh mục.
3. **Ảnh 2.3: Giao diện Đặt bàn của Khách hàng**
   - *Thực hiện:* Đăng nhập `khach01` -> vào `/reservations/new` đặt bàn thành công.
4. **Ảnh 2.4: Giao diện Gọi món và Thanh toán Hóa đơn của Nhân viên**
   - *Thực hiện:* Đăng nhập `nhanvien01` -> `/orders/new` tạo đơn và `/orders/:id/checkout` thanh toán.
5. **Ảnh 2.5: Bảng điều khiển KPI Doanh thu của Quản lý**
   - *Thực hiện:* Đăng nhập `admin` -> truy cập `/manager/dashboard`.

---

## CHƯƠNG 3: NGINX REVERSE PROXY, HTTPS VÀ BẢO MẬT GIAO VẬN

### (a) Đoạn mô tả văn phong báo cáo:
"Nginx đóng vai trò là reverse proxy duy nhất phơi bày ra bên ngoài máy chủ (cổng 80 và 443). Toàn bộ truy cập HTTP cổng 80 được chuyển hướng tự động 301 sang HTTPS. Chứng chỉ SSL tự ký được khởi tạo bằng kịch bản tự động `nginx/gen-cert.sh` hỗ trợ mã hóa RSA 2048-bit và Subject Alternative Name (SAN) cho IP máy ảo và localhost. Nginx được thiết lập TLSv1.2 và TLSv1.3 với bộ ciphers bảo mật cao, kích hoạt đầy đủ các tiêu đề an toàn HTTP Security Headers (`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `X-XSS-Protection`, `Referrer-Policy`, `Strict-Transport-Security`, `Content-Security-Policy`), ẩn chữ ký máy chủ (`server_tokens off;`), giới hạn dung lượng tải lên `client_max_body_size 3m`, và cấu hình Rate Limiting chống tấn công brute-force."

### (b) Đường dẫn file cấu hình đưa vào báo cáo:
- `nginx/nginx.conf` (Toàn bộ cấu hình upstream, security headers, rate limiting, SSL parameters).
- `nginx/gen-cert.sh` (Kịch bản sinh chứng chỉ tự ký OpenSSL).

### (c) File evidence tương ứng:
- `evidence/buoc3-nginx.txt` (Log kiểm tra TLS handshake, HTTP redirect 301, kiểm tra các header bảo mật và curl status).

### (d) Danh sách ảnh cần chụp & Lệnh thực thi:
1. **Ảnh 3.1: Kiểm tra chứng chỉ HTTPS và Security Headers bằng cURL**
   - *Lệnh thực thi:* `curl -kI https://192.168.1.15`
2. **Ảnh 3.2: Chi tiết Chứng chỉ SSL trên trình duyệt**
   - *Thực hiện:* Nhấp vào biểu tượng ổ khóa/chứng chỉ trên thanh địa chỉ trình duyệt -> xem SAN IP `192.168.1.15`.

---

## CHƯƠNG 4: HỆ THỐNG GIÁM SÁT PROMETHEUS, GRAFANA VÀ EXPORTERS

### (a) Đoạn mô tả văn phong báo cáo:
"Hạ tầng giám sát hiệu năng được triển khai khép kín gồm Prometheus v3.14 đóng vai trò máy chủ thu thập số liệu (scrape interval 15s) và Grafana v13.2 trực quan hóa bảng điều khiển. Các bộ thu thập số liệu chuyên dụng gồm: cAdvisor (giám sát cgroups CPU, RAM, Network I/O container), Nginx Prometheus Exporter (đọc stub_status qua mạng nội bộ), và Postgres Exporter (thu thập số liệu CSDL với user `exporter` có đặc quyền tối thiểu `pg_monitor`). Toàn bộ cấu hình nguồn dữ liệu (Datasource) và 3 bảng điều khiển (`Restaurant - Containers`, `Restaurant - Nginx`, `Restaurant - PostgreSQL`) được tự động nạp thông qua cơ chế Grafana Provisioning (YAML + JSON)."

### (b) Đường dẫn file cấu hình đưa vào báo cáo:
- `prometheus/prometheus.yml` (Scrape configs và targets).
- `grafana/provisioning/datasources/datasources.yaml` (Provisioning Datasource Prometheus & Loki).
- `grafana/provisioning/dashboards/dashboards.yaml` và các file dashboard JSON.

### (c) File evidence tương ứng:
- `evidence/buoc4-giamsat.txt` (Kiểm tra trạng thái 4 targets Prometheus UP, kiểm tra metrics endpoint, danh sách Grafana dashboards).

### (d) Danh sách ảnh cần chụp & Lệnh thực thi:
1. **Ảnh 4.1: Danh sách Prometheus Targets (Tất cả 4/4 đều UP)**
   - *Lệnh mở tunnel:* `ssh -L 9090:localhost:9090 ductrantest@192.168.1.15`
   - *Thực hiện:* Truy cập `http://localhost:9090/targets` trên trình duyệt máy thật.
2. **Ảnh 4.2: Dashboard Grafana 'Restaurant - Containers'**
   - *Thực hiện:* Truy cập `https://192.168.1.15/grafana/` -> Menu Dashboards -> mở bảng `Restaurant - Containers`.
3. **Ảnh 4.3: Dashboard Grafana 'Restaurant - Nginx'**
   - *Thực hiện:* Mở bảng `Restaurant - Nginx` xem Active Connections và Request Rate.
4. **Ảnh 4.4: Dashboard Grafana 'Restaurant - PostgreSQL'**
   - *Thực hiện:* Mở bảng `Restaurant - PostgreSQL` xem Database Connections, Transactions/sec và Cache Hit Ratio.

---

## CHƯƠNG 5: HỆ THỐNG LOG TẬP TRUNG LOKI, TRUY VẤN LOGQL VÀ SỰ CỐ AN NINH

### (a) Đoạn mô tả văn phong báo cáo:
"Hệ thống quản lý nhật ký tập trung sử dụng Loki v3.1 và Promtail v3.1. Promtail tự động kết nối qua Docker Socket đọc luồng log stdout/stderr, gắn các nhãn nghiệp vụ tương ứng (`job="nginx"`, `job="webapp"`, `job="postgres"`, `job="alert-sink"`) và đẩy về Loki. Dashboard `Restaurant - Logs` cho phép theo dõi log thời gian thực. Kịch bản sự cố an toàn thông tin 'Tấn công dò mật khẩu (Brute-force) vào trang đăng nhập' được thực hiện bằng script gửi liên tiếp 20 yêu cầu sai. Cơ chế phòng vệ hai lớp được kích hoạt: (1) Nginx Rate Limiting chặn các request vượt ngưỡng và trả về mã HTTP 429; (2) Grafana Alerting với biểu thức LogQL `sum(count_over_time({job="webapp"} |= "LOGIN_FAILED" [1m])) > 5` kích hoạt trạng thái Firing, tự động gửi Webhook thông báo tới microservice `alert-sink`."

### (b) Đường dẫn file cấu hình đưa vào báo cáo:
- `loki/loki-config.yaml` (Cấu hình lưu trữ filesystem và retention 7 ngày).
- `promtail/promtail-config.yaml` (Cấu hình discovery docker daemon và pipeline relabeling).
- `grafana/provisioning/alerting/alerting.yaml` (Alert rule và Contact point Webhook).
- `scripts/simulate_bruteforce.sh` (Kịch bản mô phỏng tấn công).
- `alert-sink/server.js` (Mã nguồn webhook receiver).

### (c) File evidence tương ứng:
- `evidence/buoc5-logql.txt` (Kết quả 4 truy vấn LogQL thực tế).
- `evidence/buoc5-sucodo.txt` (Minh chứng chi tiết các pha tấn công, phản hồi HTTP 429 và log webhook nhận cảnh báo).

### (d) Danh sách ảnh cần chụp & Lệnh thực thi:
1. **Ảnh 5.1: Thực thi truy vấn LogQL trên Grafana Explore**
   - *Thực hiện:* Vào Grafana -> Explore -> Datasource `Loki` -> nhập query `{job="webapp"} |= "LOGIN_FAILED"`.
2. **Ảnh 5.2: Bảng điều khiển Grafana 'Restaurant - Logs'**
   - *Thực hiện:* Mở bảng `Restaurant - Logs` xem panel đếm lỗi đăng nhập và phân bố HTTP status.
3. **Ảnh 5.3: Trạng thái Alert Rule 'Restaurant - Brute force login' chuyển sang Firing**
   - *Thực hiện:* Chạy `./scripts/simulate_bruteforce.sh` -> vào Grafana -> Alerting -> Alert rules -> xem rule chuyển sang màu đỏ (Firing).
4. **Ảnh 5.4: Log tiếp nhận Webhook sự cố của Container alert-sink**
   - *Lệnh thực thi:* `docker compose logs --tail=25 alert-sink`

---

## CHƯƠNG 6: CÁC BIỆN PHÁP HARDENING BẢO MẬT TOÀN DIỆN (SECURITY HARDENING)

### (a) Đoạn mô tả văn phong báo cáo:
"Hệ thống áp dụng 7 nhóm biện pháp bảo mật chuyên sâu (Hardening) được kiểm chứng độc lập:
1. **Chạy container phi đặc quyền (Non-root user):** Web app và alert-sink chạy user `node` (1000:1000), postgres chạy `postgres` (70:70), prometheus và các exporter chạy `nobody` (65534:65534), grafana chạy `472`, loki chạy `10001`. CAdvisor và Promtail bắt buộc dùng root để đọc raw cgroups và docker.sock nhưng được cô lập với quyền chỉ đọc (`:ro`).
2. **Phân vùng mạng cô lập (Network Isolation):** Tách 3 mạng Docker (`frontend`, `backend`, `monitoring`). Mạng `backend` được thiết lập `internal: true`, hoàn toàn không có kết nối Internet và DB PostgreSQL không phơi bày cổng ra host.
3. **Nguyên tắc đặc quyền tối thiểu CSDL (Least Privilege):** Tách tài khoản quản trị schema `postgres_admin` và tài khoản ứng dụng `restaurant_app`. Tài khoản ứng dụng chỉ có quyền DML `SELECT/INSERT/UPDATE/DELETE`, bị chặn hoàn toàn quyền `DROP TABLE` và `CREATE TABLE`.
4. **Hạn chế đặc quyền Linux Capabilities & Read-only Rootfs:** Áp dụng `cap_drop: [ALL]`, cờ `security_opt: [no-new-privileges:true]`, và khóa hệ thống tệp chỉ đọc `read_only: true` (kèm `tmpfs` mounts `noexec,nosuid,nodev`).
5. **Giới hạn tài nguyên phần cứng (Resource Quotas):** Thiết lập trần `cpus` và `memory` cho từng container chống tấn công DoS/ReDoS.
6. **Tường lửa máy chủ (Host Firewall - UFW):** Chặn toàn bộ kết nối đến (`default deny incoming`), chỉ mở đúng 3 cổng: 22 (SSH), 80 (HTTP), 443 (HTTPS).
7. **Quản lý bí mật và Quét lỗ hổng Trivy:** Phân quyền file `.env` ở mức `chmod 600`, không commit thông tin nhạy cảm vào Git; thực hiện quét lỗ hổng Trivy trên 4 image và lập phương án giảm thiểu rủi ro."

### (b) Đường dẫn file cấu hình đưa vào báo cáo:
- `docker-compose.yml` (Các khối `user`, `security_opt`, `cap_drop`, `read_only`, `tmpfs`, `deploy.resources`).
- `db/init.sql` (Các lệnh phân quyền `REVOKE CREATE`, `GRANT SELECT, INSERT, UPDATE, DELETE`).
- `web/Dockerfile` (Tạo user `node` và cấp quyền thư mục uploads).

### (c) File evidence tương ứng:
- `evidence/buoc6-hardening.txt` (Log xác minh `id` từng container, `docker inspect` security opts, thử nghiệm DROP TABLE bị từ chối, UFW status).
- `evidence/buoc6-trivy.txt` (Báo cáo quét lỗ hổng Trivy và phương án khắc phục).
- `evidence/final-smoke-test.txt` (Bằng chứng kiểm thử tự động khép kín từ trạng thái sạch).

### (d) Danh sách ảnh cần chụp & Lệnh thực thi:
1. **Ảnh 6.1: Kiểm chứng User Non-root trong Container**
   - *Lệnh thực thi:* `docker compose exec web id && docker compose exec db id && docker compose exec prometheus id`
2. **Ảnh 6.2: Kiểm chứng Tách mạng Docker (Network Isolation)**
   - *Lệnh thực thi:* `docker network inspect restaurant_backend --format "Internal: {{.Internal}}"`
3. **Ảnh 6.3: Kiểm chứng Từ chối lệnh DROP TABLE đối với User restaurant_app**
   - *Lệnh thực thi:* `docker compose exec db psql -U restaurant_app -d restaurant -c "DROP TABLE reservations;"`
4. **Ảnh 6.4: Kiểm chứng Trạng thái Tường lửa UFW**
   - *Lệnh thực thi:* `sudo ufw status verbose`
5. **Ảnh 6.5: Báo cáo Quét lỗ hổng Image bằng Trivy**
   - *Lệnh thực thi:* `grep -E "Total:|IMAGE" ~/restaurant/evidence/buoc6-trivy.txt`

---

## KẾT LUẬN VÀ HƯỚNG PHÁT TRIỂN

### (a) Đánh giá tổng kết:
"Đề tài đã hoàn thành 100% các yêu cầu kỹ thuật của môn học Triển khai và Quản trị Hệ thống Phần mềm. Toàn bộ hệ thống 12 dịch vụ hoạt động ổn định, có khả năng phục hồi cao, được tự động hóa quy trình triển khai 'chạy bằng một lệnh' từ trạng thái sạch. Kiến trúc đảm bảo tính bảo mật toàn diện từ tầng mạng, hệ điều hành máy chủ, container runtime cho đến ứng dụng và cơ sở dữ liệu."

### (b) Hướng phát triển tiếp theo:
- Xây dựng pipeline CI/CD tự động bằng GitHub Actions (tự động linting, kiểm thử đơn vị, quét lỗ hổng bảo mật bằng Trivy khi tạo Pull Request).
- Triển khai mở rộng cụm container bằng Kubernetes (k3s/microk8s) với cơ chế tự động co giãn (Horizontal Pod Autoscaler - HPA).
- Tích hợp chứng chỉ SSL tự động gia hạn Let's Encrypt qua Certbot khi chuyển sang môi trường có Domain thực tế.
