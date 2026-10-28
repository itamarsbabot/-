// Local dev server: serves public/ and the same /api/tutor handler Netlify uses.
// Run: ANTHROPIC_API_KEY=... node server.mjs   → http://localhost:8888
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import handler from "./netlify/functions/tutor.mjs";

const PORT = process.env.PORT || 8888;
const ROOT = join(process.cwd(), "public");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2",
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/tutor") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const webReq = new Request(url, {
      method: req.method, headers: req.headers,
      body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
    });
    const webRes = await handler(webReq);
    res.writeHead(webRes.status, Object.fromEntries(webRes.headers));
    if (webRes.body) for await (const c of webRes.body) res.write(c);
    return res.end();
  }
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  try {
    const data = await readFile(join(ROOT, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end("not found");
  }
}).listen(PORT, () => console.log(`Tutor running on http://localhost:${PORT}`));
