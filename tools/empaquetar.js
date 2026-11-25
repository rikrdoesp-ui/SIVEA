'use strict';
// Une la app en un solo HTML y prepara docs/, la carpeta que publica GitHub Pages. Uso: node tools/empaquetar.js
// docs/index.html también se abre con doble clic. Los iconos salen de iconos/ (tools/iconos.py).
// Incluye solo código y el catálogo; ningún documento real ni respuesta de una revisión.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const raiz = path.join(__dirname, '..');
const leer = (ruta) => fs.readFileSync(path.join(raiz, ruta));
const SALIDA = 'docs';
const ICONOS = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const { RUTAS: EMBEBIDOS } = require('../src/recursos.js');

const huellas = [];
let html = leer('index.html').toString('utf8').replace(/\r\n/g, '\n');

html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, ruta) => {
  // El navegador normaliza los saltos de línea antes de calcular la huella.
  const codigo = leer(ruta).toString('utf8').replace(/\r\n?/g, '\n');
  if (/<\/script/i.test(codigo)) throw new Error(`${ruta} contiene un cierre de script`);
  huellas.push(`'sha256-${crypto.createHash('sha256').update(codigo, 'utf8').digest('base64')}'`);
  return `<script>${codigo}</script>`;
});
// Las imágenes de la marca van dentro del HTML: así también se ven al abrirlo con doble clic.
const TIPOS_IMAGEN = { '.png': 'image/png', '.jpg': 'image/jpeg' };
html = html.replace(/<img ([^>]*)src="(iconos\/[^"]+)"/g, (_, antes, ruta) => {
  const tipo = TIPOS_IMAGEN[path.extname(ruta)];
  if (!tipo) throw new Error(`Tipo de imagen no previsto: ${ruta}`);
  return `<img ${antes}src="data:${tipo};base64,${leer(ruta).toString('base64')}"`;
});
if (huellas.length !== 13) throw new Error(`Se esperaban 13 scripts y se encontraron ${huellas.length}`);

// Sin red: connect-src 'none'. Los componentes vienen dentro del propio archivo.
const CSP = [
  "default-src 'none'",
  `script-src ${huellas.join(' ')} blob: 'wasm-unsafe-eval'`,
  "style-src 'unsafe-inline'",
  "img-src 'self' data: blob:",
  'font-src data: blob:',
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const patronCsp = /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/;
if (!patronCsp.test(html)) throw new Error('No se encontró la política de seguridad');
html = html.replace(patronCsp, (_, a, b) => `${a}${CSP}${b}`);

const recursos = Object.entries(EMBEBIDOS)
  .map(([nombre, ruta]) => `<script type="text/plain" id="rec-${nombre}">${leer(ruta).toString('base64')}</script>`)
  .join('\n');
const primero = html.indexOf('<script>');
html = `${html.slice(0, primero)}${recursos}\n${html.slice(primero)}`;

const salida = path.join(raiz, SALIDA);
fs.mkdirSync(salida, { recursive: true });
fs.writeFileSync(path.join(salida, 'index.html'), html);
fs.copyFileSync(path.join(raiz, 'manifest.webmanifest'), path.join(salida, 'manifest.webmanifest'));
for (const icono of ICONOS) {
  const origen = path.join(raiz, 'iconos', icono);
  if (!fs.existsSync(origen)) throw new Error(`Falta iconos/${icono}. Genéralos con: uv run --with pillow python tools/iconos.py <imagen>`);
  fs.copyFileSync(origen, path.join(salida, icono));
}
// La versión del trabajador cambia con el contenido: así cada publicación reemplaza la copia guardada.
// También cuenta el manifiesto: un cambio solo en él debe llegar a las apps ya instaladas.
const version = crypto.createHash('sha256').update(html).update(leer('manifest.webmanifest')).digest('hex').slice(0, 12);
const sw = leer('sw.js').toString('utf8').replace("const VERSION = 'desarrollo';", `const VERSION = '${version}';`);
if (!sw.includes(version)) throw new Error('No se pudo poner la versión en sw.js');
fs.writeFileSync(path.join(salida, 'sw.js'), sw);
fs.writeFileSync(path.join(salida, '.nojekyll'), '');
console.log(`${SALIDA}/index.html: ${(html.length / 1e6).toFixed(1)} MB, versión ${version}`);
