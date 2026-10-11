# Danh mục Phiên bản Image (Cố định Tag)

| Thành phần | Image | Phiên bản (Tag) | Vai trò |
|---|---|---|---|
| Web Application | node | 20.18.0-alpine3.20 | Runtime ứng dụng Node.js |
| Database | postgres | 16.4-alpine3.20 | Cơ sở dữ liệu chính |
| Database Admin | dpage/pgadmin4 | 8.11 | Quản trị giao diện CSDL |
| Reverse Proxy | nginx | 1.27.1-alpine | Reverse proxy & SSL termination |
| Metrics Collector | prom/prometheus | v2.54.1 | Hệ thống giám sát metrics |
| Metrics Dashboard | grafana/grafana | 11.2.0 | Dashboard trực quan hóa |
| Container Metrics | gcr.io/cadvisor/cadvisor | v0.49.1 | Thu thập metrics container |
| Nginx Exporter | nginx/nginx-prometheus-exporter | 1.3.0 | Exporter cho Nginx |
| Postgres Exporter | prometheuscommunity/postgres-exporter | v0.15.0 | Exporter cho PostgreSQL |
| Centralized Logging | grafana/loki | 3.1.1 | Lưu trữ & truy vấn log tập trung |
| Log Collector | grafana/promtail | 3.1.1 | Thu thập log container |
| Alert Receiver | alert-sink (tự build từ node) | 20.18.0-alpine3.20 | Điểm nhận cảnh báo webhook |
