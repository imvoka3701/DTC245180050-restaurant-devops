FROM node:20.18.0-alpine3.20

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY . .

# Tạo thư mục uploads và phân quyền ghi cho user không đặc quyền node (uid 1000)
RUN mkdir -p /app/public/uploads && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=5s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "src/server.js"]