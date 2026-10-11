const http = require("http");
const fs = require("fs");

const PORT = process.env.PORT || 8080;
const LOG_FILE = process.env.LOG_FILE || "/var/log/alerts.log";

const server = http.createServer((req, res) => {
  if (req.method === "POST") {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", () => {
      const timestamp = new Date().toISOString();
      const logMsg = `[ALERT-WEBHOOK] ${timestamp} ${body}\n`;
      process.stdout.write(logMsg);
      try {
        fs.appendFileSync(LOG_FILE, logMsg);
      } catch (e) {
        console.error("File write error:", e.message);
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", timestamp }));
    });
  } else {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Alert-sink is healthy\n");
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[ALERT-SINK] Listening on port ${PORT}`);
});
