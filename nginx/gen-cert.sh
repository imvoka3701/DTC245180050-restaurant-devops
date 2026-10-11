#!/usr/bin/env bash
set -e

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/certs" && pwd)"
mkdir -p "$CERT_DIR"

VM_IP="192.168.1.15"

echo "Đang sinh chứng chỉ SSL tự ký cho IP: ${VM_IP}..."

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${CERT_DIR}/server.key" \
  -out "${CERT_DIR}/server.crt" \
  -subj "/C=VN/ST=Hanoi/L=Hanoi/O=RestaurantDevOps/OU=IT/CN=${VM_IP}" \
  -addext "subjectAltName = IP:${VM_IP},DNS:localhost,IP:127.0.0.1"

chmod 600 "${CERT_DIR}/server.key"
chmod 644 "${CERT_DIR}/server.crt"

echo "Chứng chỉ SSL đã sẵn sàng tại ${CERT_DIR}/server.crt và ${CERT_DIR}/server.key"
