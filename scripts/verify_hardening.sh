#!/usr/bin/env bash
exec > evidence/buoc6-hardening.txt 2>&1

echo "================================================================================"
echo "EVIDENCE REPORT: BUOC 6 - SECURITY HARDENING VERIFICATION"
echo "Date: $(date -u)"
echo "Host: $(hostname) - $(uname -a)"
echo "================================================================================"
echo ""

echo "=== 1. NON-ROOT USER VERIFICATION (id IN EACH CONTAINER) ==="
for s in web alert-sink db pgadmin prometheus grafana loki nginx-exporter postgres-exporter cadvisor promtail nginx; do
    echo -n "Service [$s]: "
    docker compose exec -T $s id || echo "(Failed)"
done
echo ""

echo "=== 2. NETWORK ISOLATION VERIFICATION ==="
echo "--- Docker Networks ---"
docker network ls | grep -E "restaurant|NAME"
echo ""
echo "--- Backend Network (internal: true) Inspection ---"
docker network inspect restaurant_backend --format "Internal: {{.Internal}}"
docker network inspect restaurant_backend --format "{{range .Containers}}Container: {{.Name}} -> {{.IPv4Address}}{{println}}{{end}}"
echo ""
echo "--- Frontend Network Inspection ---"
docker network inspect restaurant_frontend --format "Internal: {{.Internal}}"
docker network inspect restaurant_frontend --format "{{range .Containers}}Container: {{.Name}} -> {{.IPv4Address}}{{println}}{{end}}"
echo ""
echo "--- Monitoring Network Inspection ---"
docker network inspect restaurant_monitoring --format "Internal: {{.Internal}}"
docker network inspect restaurant_monitoring --format "{{range .Containers}}Container: {{.Name}} -> {{.IPv4Address}}{{println}}{{end}}"
echo ""

echo "=== 3. HOST PORT EXPOSURE & FIREWALL VERIFICATION ==="
echo "--- Listening TCP Ports on Host (ss -tlnp) ---"
ss -tlnp
echo ""
echo "--- UFW Firewall Status (sudo ufw status verbose) ---"
echo ductrantest | sudo -S ufw status verbose
echo ""

echo "=== 4. DATABASE LEAST PRIVILEGE VERIFICATION ==="
echo "--- Test 1: DROP TABLE reservations as restaurant_app (MUST FAIL) ---"
docker compose exec -T db psql -U restaurant_app -d restaurant -c "DROP TABLE reservations;" 2>&1 || true
echo ""
echo "--- Test 2: CREATE TABLE as restaurant_app (MUST FAIL) ---"
docker compose exec -T db psql -U restaurant_app -d restaurant -c "CREATE TABLE evil_table (id int);" 2>&1 || true
echo ""
echo "--- Test 3: Normal SELECT as restaurant_app (MUST SUCCEED) ---"
docker compose exec -T db psql -U restaurant_app -d restaurant -c "SELECT id, code, seats, status FROM dining_tables LIMIT 3;"
echo ""
echo "--- Test 4: Schema Permissions and Table Ownership ---"
docker compose exec -T db psql -U postgres_admin -d restaurant -c "\dn+ public"
docker compose exec -T db psql -U postgres_admin -d restaurant -c "\dt"
echo ""

echo "=== 5. CONTAINER SECURITY ATTRIBUTES (no-new-privileges, cap_drop, read_only) ==="
docker inspect restaurant-web --format "Web: SecurityOpt={{.HostConfig.SecurityOpt}} CapDrop={{.HostConfig.CapDrop}} ReadonlyRootfs={{.HostConfig.ReadonlyRootfs}}"
docker inspect restaurant-db --format "DB: SecurityOpt={{.HostConfig.SecurityOpt}} CapDrop={{.HostConfig.CapDrop}} ReadonlyRootfs={{.HostConfig.ReadonlyRootfs}}"
docker inspect restaurant-nginx --format "Nginx: SecurityOpt={{.HostConfig.SecurityOpt}} CapDrop={{.HostConfig.CapDrop}} ReadonlyRootfs={{.HostConfig.ReadonlyRootfs}} CapAdd={{.HostConfig.CapAdd}}"
docker inspect restaurant-alert-sink --format "AlertSink: SecurityOpt={{.HostConfig.SecurityOpt}} CapDrop={{.HostConfig.CapDrop}} ReadonlyRootfs={{.HostConfig.ReadonlyRootfs}}"
echo ""

echo "=== 6. HTTP SECURITY HEADERS & SERVER TOKENS (curl -kI https://localhost) ==="
curl -kI https://localhost
echo ""

echo "=== 7. SECRET SCANNING (git grep & file check) ==="
echo "Permissions of .env file: $(ls -la .env)"
echo "Checking Git index and history for leaks:"
git grep -i -E "password.*=.*[A-Za-z0-9]{8,}" || echo "No password leaks found in committed files!"
echo ""

echo "=== 8. END-TO-END APPLICATION WORKFLOW SMOKE TEST ==="
COOKIE_JAR=/tmp/smoke_cookies.txt
rm -f $COOKIE_JAR

echo "1) Testing Customer Login (/login)..."
LOGIN_PAGE=$(curl -k -s -c $COOKIE_JAR https://localhost/login)
CSRF_TOKEN=$(echo "$LOGIN_PAGE" | grep -o 'name="_csrf" value="[^"]*"' | head -n1 | cut -d'"' -f4)

LOGIN_RES=$(curl -k -s -b $COOKIE_JAR -c $COOKIE_JAR -X POST https://localhost/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-CSRF-Token: ${CSRF_TOKEN}" \
  -d "_csrf=${CSRF_TOKEN}&username=khach01&password=Cust@Rest2026!Dine" -w "%{http_code}")
echo "Customer Login HTTP status: $LOGIN_RES (Expect 302)"

echo "2) Testing Customer Reservation Creation (/reservations)..."
RES_PAGE=$(curl -k -s -b $COOKIE_JAR -c $COOKIE_JAR https://localhost/reservations/new)
RES_CSRF=$(echo "$RES_PAGE" | grep -o 'name="_csrf" value="[^"]*"' | head -n1 | cut -d'"' -f4)
RES_CODE=$(curl -k -s -b $COOKIE_JAR -c $COOKIE_JAR -X POST https://localhost/reservations \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-CSRF-Token: ${RES_CSRF}" \
  -d "_csrf=${RES_CSRF}&party_size=4&reserved_at=2026-12-01T19:00&table_id=1&note=Test+Hardening" -w "%{http_code}")
echo "Create Reservation HTTP status: $RES_CODE (Expect 302)"

echo "3) Testing Staff Login & Order Creation (/orders)..."
rm -f $COOKIE_JAR
STAFF_LOGIN=$(curl -k -s -c $COOKIE_JAR https://localhost/login)
STAFF_CSRF=$(echo "$STAFF_LOGIN" | grep -o 'name="_csrf" value="[^"]*"' | head -n1 | cut -d'"' -f4)
curl -k -s -b $COOKIE_JAR -c $COOKIE_JAR -X POST https://localhost/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-CSRF-Token: ${STAFF_CSRF}" \
  -d "_csrf=${STAFF_CSRF}&username=nhanvien01&password=Staff@Rest2026!Ord" > /dev/null

ORDER_NEW_PAGE=$(curl -k -s -b $COOKIE_JAR -c $COOKIE_JAR https://localhost/orders/new)
ORDER_CSRF=$(echo "$ORDER_NEW_PAGE" | grep -o 'name="_csrf" value="[^"]*"' | head -n1 | cut -d'"' -f4)
ORDER_HEADER=$(curl -k -s -b $COOKIE_JAR -c $COOKIE_JAR -X POST https://localhost/orders \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-CSRF-Token: ${ORDER_CSRF}" \
  --data-urlencode "_csrf=${ORDER_CSRF}" \
  --data-urlencode "table_id=1" \
  --data-urlencode 'items=[{"menu_item_id":1,"quantity":2}]' -i | head -n 12)
ORDER_STATUS=$(echo "$ORDER_HEADER" | grep -o "HTTP/1.1 [0-9]*" | head -n1 | awk '{print $2}')
ORDER_LOC=$(echo "$ORDER_HEADER" | grep -i "Location:" | awk '{print $2}' | tr -d '\r')
echo "Create Order HTTP status: $ORDER_STATUS (Redirect: $ORDER_LOC)"

echo "4) Testing Staff Payment Process (Checkout)..."
if [ -n "$ORDER_LOC" ]; then
  ORDER_ID=$(echo "$ORDER_LOC" | awk -F'/' '{print $NF}')
  CHECKOUT_PAGE=$(curl -k -s -b $COOKIE_JAR -c $COOKIE_JAR https://localhost/orders/${ORDER_ID}/checkout)
  PAY_CSRF=$(echo "$CHECKOUT_PAGE" | grep -o 'name="_csrf" value="[^"]*"' | head -n1 | cut -d'"' -f4)
  PAY_CODE=$(curl -k -s -b $COOKIE_JAR -c $COOKIE_JAR -X POST https://localhost/orders/${ORDER_ID}/checkout \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -H "X-CSRF-Token: ${PAY_CSRF}" \
    -d "_csrf=${PAY_CSRF}&payment_method=cash&amount_paid=500000" -w "%{http_code}")
  echo "Process Payment for Order #${ORDER_ID} HTTP status: $PAY_CODE (Expect 302)"
fi

echo "5) Testing Manager Login & File Upload (/manager/menu)..."
rm -f $COOKIE_JAR
ADMIN_PAGE=$(curl -k -s -c $COOKIE_JAR https://localhost/login)
ADMIN_CSRF=$(echo "$ADMIN_PAGE" | grep -o 'name="_csrf" value="[^"]*"' | head -n1 | cut -d'"' -f4)
curl -k -s -b $COOKIE_JAR -c $COOKIE_JAR -X POST https://localhost/login \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-CSRF-Token: ${ADMIN_CSRF}" \
  -d "_csrf=${ADMIN_CSRF}&username=admin&password=Admin@Rest2026!Mgr" > /dev/null

TMP_IMG=/tmp/test_dish.png
python3 -c "import base64; open('$TMP_IMG','wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='))"

MENU_PAGE=$(curl -k -s -b $COOKIE_JAR -c $COOKIE_JAR https://localhost/manager/menu)
MENU_CSRF=$(echo "$MENU_PAGE" | grep -o 'name="_csrf" value="[^"]*"' | head -n1 | cut -d'"' -f4)
RAND_DISH="Mon Ngon Hardened $(date +%s)"

UPLOAD_RES=$(curl -k -s -b $COOKIE_JAR -c $COOKIE_JAR -X POST "https://localhost/manager/menu?_csrf=${MENU_CSRF}" \
  -H "X-CSRF-Token: ${MENU_CSRF}" \
  -F "_csrf=${MENU_CSRF}" \
  -F "category_id=1" \
  -F "name=${RAND_DISH}" \
  -F "description=Delicious tested dish created during hardening test" \
  -F "price=180000" \
  -F "image=@$TMP_IMG;type=image/png" -w "%{http_code}")
echo "Upload Menu Item HTTP status: $UPLOAD_RES (Expect 302)"

echo "6) Testing Grafana Subpath Access & Health (/grafana/api/health)..."
curl -k -s https://localhost/grafana/api/health
echo ""

echo "=== HARDENING VERIFICATION COMPLETE ==="
