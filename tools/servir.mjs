// Servidor estático para probar en localhost. No se publica. Solo entrega la app (index, src, vendor).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

const root = join(import.meta.dirname, '..');
const port = Number(process.argv[2] || 8093);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

createServer(async (req, res) => {
  let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (ruta.endsWith('/')) ruta += 'index.html';
  const archivo = normalize(join(root, ruta));
  const relativa = archivo.slice(root.length + 1).toLowerCase();
  const permitida = relativa === 'index.html' || relativa.startsWith(`src${sep}`) || relativa.startsWith(`vendor${sep}`) || relativa.startsWith(`iconos${sep}`);
  if (!archivo.startsWith(root + sep) || !permitida) {
    res.writeHead(403).end();
    return;
  }
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'content-type': types[extname(archivo)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(cuerpo);
  } catch {
    res.writeHead(404).end('No encontrado');
  }
}).listen(port, '127.0.0.1', () => console.log(`Semestrales en http://127.0.0.1:${port}`));
