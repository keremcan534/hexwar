import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";

const root = resolve(process.cwd());
const port = Number.parseInt(process.env.PORT ?? "5173", 10);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  // Menü müziği: yanlış tür gönderilirse tarayıcı <audio> kaynağını reddeder.
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function localPath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const candidate = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  return candidate;
}

/**
 * Geliştirme kancası: maplab.html tuvali PNG olarak `.shots/` altına yazar.
 * Görsel yineleme döngüsü (çiz → bak → düzelt) ekran görüntüsünü tam
 * çözünürlükte diske ister; önizleme penceresi görüntüyü yarıya küçültüyor.
 * Yalnız geliştirme sunucusunda, yalnız bu tek uç nokta.
 */
async function saveShot(request, response) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const name = basename(String(payload.name ?? "shot")).replace(/[^\w.-]/g, "_");
  const data = String(payload.png ?? "").replace(/^data:image\/png;base64,/, "");
  const dir = resolve(root, ".shots");
  await mkdir(dir, { recursive: true });
  const file = resolve(dir, name.endsWith(".png") ? name : `${name}.png`);
  await writeFile(file, Buffer.from(data, "base64"));
  response.writeHead(200, { "Content-Type": "text/plain" }).end(file);
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && (request.url ?? "").startsWith("/__shot")) {
      await saveShot(request, response);
      return;
    }
    let filePath = localPath(request.url ?? "/");
    if (!filePath) {
      response.writeHead(403).end("Forbidden");
      return;
    }

    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = resolve(filePath, "index.html");
    const body = await readFile(filePath);
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": contentTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream",
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    const status = error?.code === "ENOENT" ? 404 : 500;
    response.writeHead(status).end(status === 404 ? "Not Found" : "Server Error");
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Hexwar running at http://localhost:${port}/`);
});
