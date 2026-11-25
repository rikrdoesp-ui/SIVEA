'use strict';
// Copia a esta carpeta lo que se empaqueta: el HTML de la app (docs/index.html) y el icono.
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const copiar = (origen, destino) => {
  const o = path.join(raiz, origen);
  if (!fs.existsSync(o)) throw new Error(`Falta ${origen}. Corre primero: node tools/empaquetar.js (y tools/iconos.py --ico)`);
  fs.mkdirSync(path.dirname(path.join(__dirname, destino)), { recursive: true });
  fs.copyFileSync(o, path.join(__dirname, destino));
};
copiar('docs/index.html', 'app/index.html');
copiar('iconos/icon.ico', 'build/icon.ico');
