'use strict';
/**
 * Arma el índice de anexos a partir del texto de cada página.
 * Una carátula es una página casi vacía cuyo texto empieza con "Anexo No. N: título".
 * Las páginas largas que citan un anexo en su cuerpo no cuentan.
 */
const IndiceAnexos = (() => {
  const MAX_CARATULA = 400;
  const PIE = /I10-07\s+v\.\s*\d+\s+\S+\s+Página\s+\d+(\s+de\s+\d+)?/gi;
  const CARATULA = /^Anexo\s+(?:N[°ºo.]*\s*)?(\d{1,2})\s*[:\-–]\s*(.+)$/i;
  const OTRO_ANEXO = /\bAnexo\s+(?:N[°ºo.]*\s*)?\d{1,2}\s*[:\-–]/i;

  // Informes mensuales: cada página repite arriba "“Proyecto” Informe Mensual No. 34– enero 2026"
  // y los anexos se rotulan "ANEXO 9.B" o "ANEXO 9.B.1", a veces precedidos por "9.9 ANEXOS".
  // Tras el encabezado viene el número de página impreso ("846").
  const ENCABEZADO_MENSUAL = /^.{0,240}?Informe Mensual No\.?\s*\d+\s*[–-]?\s*\p{L}+\s+\d{4}\s*(?:\d{1,5}(?![\d.])\s*)?/iu;
  const CARATULA_LETRA = /^(?:\d{1,2}\.\d{1,2}\s+ANEXOS\s+)?ANEXO\s+(\d{1,2}\.[A-Z](?:\.\d{1,2})?)\b\.?\s*[:\-–]?\s*(.+)$/;
  const MAX_TITULO = 90;

  const normalizar = (texto) => String(texto).normalize('NFC').replace(/\s+/g, ' ').trim();
  const sinRepetidos = (texto) => normalizar(normalizar(texto).replace(PIE, ' ').replace(ENCABEZADO_MENSUAL, ''));
  const tituloCorto = (t) => (t.length <= MAX_TITULO ? t : `${t.slice(0, MAX_TITULO).replace(/\s+\S*$/, '')}…`);

  /** Distancia de un trozo al anterior, medida a lo largo y a lo ancho del renglón. */
  function desplazamiento(item, previo) {
    const [a, b, , , x, y] = previo.transform;
    const modulo = Math.hypot(a, b) || 1;
    const [ux, uy] = [a / modulo, b / modulo];
    const dx = item.transform[4] - x;
    const dy = item.transform[5] - y;
    return { avance: dx * ux + dy * uy, lateral: -dx * uy + dy * ux };
  }

  /**
   * Reconstruye el texto de una página a partir de sus trozos. Word suele partir
   * palabras y números ("2" + "5:"), así que solo se añade un espacio donde hay
   * un salto de línea o una separación visible entre trozos.
   */
  function textoDePagina(items) {
    let texto = '';
    let previo = null;
    for (const item of items) {
      if (typeof item.str !== 'string' || !Array.isArray(item.transform)) continue;
      if (previo) {
        const { avance, lateral } = desplazamiento(item, previo);
        const alto = item.height || previo.height || 1;
        const otraLinea = previo.hasEOL || Math.abs(lateral) > alto / 2;
        const hueco = avance - previo.width > alto * 0.15;
        if ((otraLinea || hueco) && !texto.endsWith(' ')) texto += ' ';
      }
      texto += item.str;
      previo = item;
    }
    return texto;
  }

  function detectar(textos) {
    const anexos = [];
    const vistos = new Set();
    textos.forEach((texto, i) => {
      const limpio = sinRepetidos(texto);
      // La carátula con letra se reconoce porque la página empieza con ella, aunque traiga más texto.
      const letra = limpio.match(CARATULA_LETRA);
      if (letra) {
        // Una lista de anexos nombra otros anexos principales; una carátula solo trae sus propios subanexos.
        const principal = letra[1].split('.').slice(0, 2).join('.');
        const otros = [...letra[2].matchAll(/\bANEXO\s+(\d{1,2}\.[A-Z])/g)].some((m) => m[1] !== principal);
        if (otros || vistos.has(letra[1])) return;
        vistos.add(letra[1]);
        const titulo = tituloCorto(letra[2].split(/\s+ANEXO\s+\d/)[0]); // sin el subanexo que sigue en la misma página
        anexos.push({ numero: letra[1], titulo, pagina: i + 1, noAplica: /NO\s+APLICA/i.test(titulo) });
        return;
      }
      if (limpio.length >= MAX_CARATULA) return;
      const m = limpio.match(CARATULA);
      // Una lista de anexos no es carátula, y solo cuenta la primera aparición de cada número.
      if (!m || OTRO_ANEXO.test(m[2]) || vistos.has(m[1])) return;
      vistos.add(m[1]);
      anexos.push({
        numero: Number(m[1]),
        titulo: m[2],
        pagina: i + 1,
        noAplica: /NO\s+APLICA/i.test(m[2]),
      });
    });
    return anexos;
  }

  /** Una página tiene "cuerpo" si trae texto real, además del pie. */
  function tieneCuerpo(texto) {
    return sinRepetidos(texto).length >= 300;
  }

  return { detectar, tieneCuerpo, textoDePagina };
})();

if (typeof module !== 'undefined') module.exports = IndiceAnexos;
