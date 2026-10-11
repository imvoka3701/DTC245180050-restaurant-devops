# Báo Cáo Phân Tích Sự Cố An Toàn Thông Tin: Tấn Công Dò Mật Khẩu (Brute Force)

## 1. Mô tả sự cố (Incident Description)
- **Thời gian diễn ra**: Ngày 11/10/2026, từ `19:55:41 UTC` đến `19:56:03 UTC`.
- **Hệ thống bị nhắm tới**: Giao diện đăng nhập ứng dụng Quản lý Nhà hàng (`https://192.168.1.15/login`).
- **Hình thức tấn công**: Tấn công vét cạn / dò từ điển mật khẩu (Password Brute-Force / Credential Stuffing).
- **Hành vi quan sát được**: Kẻ tấn công gửi liên tiếp 20 yêu cầu HTTP POST tới endpoint `/login` trong vòng 22 giây, nhắm vào tài khoản quản trị viên `admin` với danh sách mật khẩu phổ biến (`123456`, `password`, `admin123`, `welcome`, ...). Các yêu cầu cách nhau khoảng 0.5 giây nhằm thử vượt qua các cơ chế kiểm tra đơn giản.

---

## 2. Cơ chế Phát hiện (Detection & Alerting)
- **Công cụ phát hiện**: Grafana Alerting kết hợp dữ liệu log tập trung Loki.
- **Quy tắc cảnh báo (Alert Rule)**: `Restaurant - Brute force login`
  - **Truy vấn LogQL**:
    ```logql
    sum(count_over_time({job="webapp"} |= "LOGIN_FAILED" [1m]))
    ```
  - **Điều kiện kích hoạt**: Khi số lượng log `LOGIN_FAILED` vượt quá 5 lần trong vòng 1 phút (`threshold > 5`).
  - **Độ nghiêm trọng (Severity)**: `critical`.
- **Kênh thông báo (Contact Point)**: Webhook gửi tới dịch vụ nội bộ `http://alert-sink:8080/webhook`.
- **Trạng thái thực tế**:
  - Tại giây thứ 10 của đợt tấn công, hệ thống ghi nhận giá trị đếm đạt 7 (vượt ngưỡng 5).
  - Alert chuyển từ `Normal` sang `Firing`.
  - Service `alert-sink` nhận được payload webhook từ Grafana Alertmanager và ghi nhận vào log `[ALERT-WEBHOOK]`.

---

## 3. Truy vết sự cố bằng LogQL (Incident Investigation)
Bằng cách truy vấn hệ thống Loki qua Grafana Explore và LogQL API:

### Bước 1: Xác định quy mô và loại hình sự cố
```logql
{job="webapp"} |= "LOGIN_FAILED"
```
*Kết quả trích xuất thật*:
```text
1791748563035921833 LOGIN_FAILED ip=172.20.0.1 user=admin reason=wrong_password
1791748561915407002 LOGIN_FAILED ip=172.20.0.1 user=admin reason=wrong_password
1791748560824760250 LOGIN_FAILED ip=172.20.0.1 user=admin reason=wrong_password
1791748559719134344 LOGIN_FAILED ip=172.20.0.1 user=admin reason=wrong_password
1791748558625806582 LOGIN_FAILED ip=172.20.0.1 user=admin reason=wrong_password
```
- **Tài khoản mục tiêu**: `admin`
- **Địa chỉ IP nguồn**: `172.20.0.1` (IP gateway Nginx/Client kết nối nội bộ)
- **Nguyên nhân thất bại**: `wrong_password`
- **Tần suất**: ~1 yêu cầu mỗi 0.5 - 1 giây.

### Bước 2: Đối chiếu log Nginx Reverse Proxy
```logql
{job="nginx"} |~ "POST /login"
```
- Các yêu cầu POST xuất hiện với mã trạng thái `HTTP 401 Unauthorized`.
- Nginx ghi nhận User-Agent: `curl/8.5.0` và cùng địa chỉ IP nguồn.

---

## 4. Xử lý và Biện pháp Khắc phục (Remediation & Hardening)

### A. Giải pháp tức thời (Đã áp dụng thành công)
Gia cố cơ chế **Rate Limiting** ngay tại tầng Reverse Proxy Nginx:
```nginx
# Chỉ áp dụng giới hạn tần suất cho phương thức POST tới trang đăng nhập
map $request_method $limit_key {
    POST $binary_remote_addr;
    default "";
}
limit_req_zone $limit_key zone=login_limit:10m rate=10r/m;

location /login {
    limit_req zone=login_limit burst=5 nodelay;
    limit_req_status 429;
    ...
}
```
**Hiệu quả sau khi gia cố**:
- Khi kẻ tấn công gửi chuỗi 20 yêu cầu liên tiếp, từ yêu cầu thứ 8 trở đi Nginx lập tức trả về mã lỗi **HTTP 429 Too Many Requests**, ngăn chặn toàn bộ các yêu cầu này tới ứng dụng web Node.js.
- Người dùng bình thường truy cập và đăng nhập hợp lệ vẫn nhận được phản hồi **HTTP 302 Redirect** thành công mà không bị ảnh hưởng.

### B. Giải pháp đề xuất dài hạn
1. **Khóa tài khoản tạm thời (Account Lockout)**: Khóa tạm thời tài khoản 15 phút nếu nhập sai mật khẩu 5 lần liên tiếp.
2. **Xác thực đa yếu tố (MFA / 2FA)**: Bắt buộc xác thực TOTP đối với tài khoản `manager` và `staff`.
3. **Fail2ban / IP Blacklisting tự động**: Tự động chặn IP tại iptables/UFW nếu phát hiện quá nhiều mã lỗi 401/429 trong thời gian ngắn.
4. **CAPTCHA / Turnstile**: Tự động kích hoạt CAPTCHA sau 3 lần đăng nhập thất bại từ một IP.

---

## 5. Bài học kinh nghiệm (Lessons Learned)
- **Tầm quan trọng của Log tập trung & có cấu trúc**: Việc ứng dụng xuất log có cấu trúc rõ ràng (`LOGIN_FAILED ip=... user=... reason=...`) giúp Promtail và Loki trích xuất và truy vết sự cố nhanh chóng chỉ trong vài giây.
- **Giám sát chủ động thay vì bị động**: Cảnh báo tự động qua Alert rule giúp phát hiện hành vi tấn công ngay lập tức khi đang diễn ra, trước khi kẻ tấn công có cơ hội đoán đúng mật khẩu.
- **Phòng thủ theo chiều sâu (Defense in Depth)**: Chặn tấn công từ tầng Reverse Proxy (Nginx 429) giúp tiết kiệm tài nguyên CPU/Database của backend webapp khi bị tấn công DDoS hoặc brute-force quy mô lớn.