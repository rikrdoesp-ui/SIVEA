'use strict';
/**
 * Entrega los componentes pesados. En el archivo único vienen embebidos en base64;
 * en desarrollo se leen de la carpeta del proyecto.
 */
const Recursos = (() => {
  const RUTAS = {
    pdf: 'vendor/pdfjs/pdf.min.mjs',
    worker: 'vendor/pdfjs/pdf.worker.min.mjs',
    'openjpeg.wasm': 'vendor/pdfjs/wasm/openjpeg.wasm',
    'jbig2.wasm': 'vendor/pdfjs/wasm/jbig2.wasm',
    'qcms_bg.wasm': 'vendor/pdfjs/wasm/qcms_bg.wasm',
    catalogo: 'src/catalogo.json',
    'catalogo-166': 'src/catalogo-166.json',
    'catalogo-mensual': 'src/catalogo-mensual.json',
  };

  function decodificar(base64) {
    const binario = atob(base64.trim());
    const bytes = new Uint8Array(binario.length);
    for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
    return bytes;
  }

  async function bytes(nombre) {
    if (!Object.hasOwn(RUTAS, nombre)) throw new Error(`Componente desconocido: ${nombre}`);
    const embebido = document.getElementById(`rec-${nombre}`);
    if (embebido) return decodificar(embebido.textContent);
    const respuesta = await fetch(RUTAS[nombre]);
    if (!respuesta.ok) throw new Error(`No se pudo cargar ${nombre}`);
    return new Uint8Array(await respuesta.arrayBuffer());
  }

  const texto = async (nombre) => new TextDecoder().decode(await bytes(nombre));

  /** Un blob hereda la política de seguridad de la página, también dentro del worker. */
  const urlDeModulo = async (nombre) => URL.createObjectURL(new Blob([await bytes(nombre)], { type: 'text/javascript' }));

  return { bytes, texto, urlDeModulo, rutas: RUTAS };
})();

// tools/empaquetar.js lee de aquí la tabla de componentes que embebe.
if (typeof module !== 'undefined') module.exports = { RUTAS: Recursos.rutas };
