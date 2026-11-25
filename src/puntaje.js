'use strict';
/**
 * Puntaje de la Lista de verificación mensual (R-PA03-20), igual que su Excel.
 * Secciones con SI/NO/N/A: SI / (SI + NO) × peso. Si todo es N/A o está vacío, vale su peso completo.
 * Sección numérica (C): porcentaje / 100 × peso. Total = suma de las secciones.
 * Los valores se devuelven sin redondear; la pantalla y el PDF muestran enteros con `entero`.
 */
const PuntajeMensual = (() => {
  /** Número entre 0 y 100 escrito por el revisor; null si está vacío o no es válido. */
  function porcentaje(valor) {
    if (typeof valor !== 'number' && typeof valor !== 'string') return null;
    // Solo dígitos con coma o punto decimal: nada de "0x1F", "1e1" ni espacios en blanco.
    if (typeof valor === 'string' && !/^\d+(?:[.,]\d+)?$/.test(valor.trim())) return null;
    const n = typeof valor === 'number' ? valor : Number(valor.trim().replace(',', '.'));
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
  }

  /** Redondeo como el del Excel (mitades hacia arriba); el épsilon evita 42.4999… por coma flotante. */
  const entero = (x) => Math.round(x + 1e-9);

  /** @returns {{secciones: Object, total: number}} por id de sección: conteos y `puntos` ponderados. */
  function calcular(catalogo, respuestas, porcentajeC) {
    const secciones = {};
    let total = 0;
    for (const s of catalogo.secciones) {
      let puntos;
      if (s.numerico) {
        puntos = ((porcentaje(porcentajeC) || 0) * s.peso) / 100;
        secciones[s.id] = { peso: s.peso, puntos };
      } else {
        const cuenta = { si: 0, no: 0, na: 0 };
        for (const { id } of s.items) {
          const e = respuestas && respuestas[id] && respuestas[id].estado;
          if (typeof e === 'string' && Object.hasOwn(cuenta, e)) cuenta[e] += 1;
        }
        const validas = cuenta.si + cuenta.no;
        puntos = validas ? (cuenta.si / validas) * s.peso : s.peso;
        secciones[s.id] = { ...cuenta, peso: s.peso, puntos };
      }
      total += puntos;
    }
    return { secciones, total };
  }

  return { calcular, entero, porcentaje };
})();

if (typeof module !== 'undefined') module.exports = PuntajeMensual;
