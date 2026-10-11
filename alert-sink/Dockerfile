FROM node:20.18.0-alpine3.20
WORKDIR /app
COPY package.json server.js ./
RUN mkdir -p /var/log && touch /var/log/alerts.log && chown -R node:node /app /var/log/alerts.log
USER node
EXPOSE 8080
CMD ["node", "server.js"]