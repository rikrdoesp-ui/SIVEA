'use strict';
/**
 * Forma del avance guardado de una revisión. Lo guardado en el navegador o en una
 * copia JSON puede venir dañado o ser de otra lista: aquí se valida antes de usarlo.
 */
const Avance = (() => {
  // En el navegador estos scripts se cargan antes que este (ver index.html).
  const Ficha = typeof module !== 'undefined' ? require('./ficha.js') : FichaSemestral;
  const Mensual = typeof module !== 'undefined' ? require('./ficha-mensual.js') : FichaMensual;
  const Puntaje = typeof module !== 'undefined' ? require('./puntaje.js') : PuntajeMensual;
  const CAMPOS = ['proyecto', 'contratista', 'periodo', 'revisadoPor', 'fecha'];
  // Campos del encabezado y las firmas de la lista mensual que no están ya en CAMPOS; las otras listas los dejan vacíos.
  const CAMPOS_MENSUALES = Mensual.CAMPOS.filter((c) => !CAMPOS.includes(c));
  const ESTADOS = { si: 'SI', no: 'NO', na: 'N/A' };
  const MAX_LUGARES = Ficha.MAX_REFERENCIAS;
  const PRIMERA_LISTA = 'esia-067-2005';
  const LISTA_MENSUAL = 'mensual-r-pa03-20';

  const vacio = () => ({ datos: {}, respuestas: {}, observaciones: '', informeFinal: '', autollenado: false, verificados: {}, porcentajeC: '', otros: '' });

  /** Solo se conserva lo que tiene la forma esperada y pertenece a la lista (ids). */
  function normalizar(guardado, ids) {
    const limpio = vacio();
    if (!guardado || typeof guardado !== 'object') return limpio;
    const texto = (v) => (typeof v === 'string' ? v : '');
    const datos = guardado.datos && typeof guardado.datos === 'object' ? guardado.datos : {};
    for (const c of [...CAMPOS, ...CAMPOS_MENSUALES]) limpio.datos[c] = texto(datos[c]);
    const respuestas = guardado.respuestas && typeof guardado.respuestas === 'object' ? guardado.respuestas : {};
    for (const id of ids) {
      const r = respuestas[id] && typeof respuestas[id] === 'object' ? respuestas[id] : {};
      // typeof: un arreglo ["si"] también pasaría hasOwn al convertirse en texto.
      limpio.respuestas[id] = { estado: typeof r.estado === 'string' && Object.hasOwn(ESTADOS, r.estado) ? r.estado : '', obs: texto(r.obs) };
      if (typeof r.texto === 'string') limpio.respuestas[id].texto = r.texto;
      const refs = Array.isArray(r.refs) ? r.refs : (r.ref ? [r.ref] : []); // r.ref: borradores anteriores
      limpio.respuestas[id].refs = refs
        .filter((x) => x && typeof x === 'object')
        .slice(0, MAX_LUGARES)
        .map((x) => ({ titulo: texto(x.titulo), pagina: texto(x.pagina) }));
    }
    limpio.observaciones = texto(guardado.observaciones);
    limpio.informeFinal = texto(guardado.informeFinal);
    // Porcentaje de la sección C: texto con un número de 0 a 100, o vacío.
    const pct = Puntaje.porcentaje(guardado.porcentajeC);
    limpio.porcentajeC = pct === null ? '' : Puntaje.aTexto(pct);
    limpio.otros = texto(guardado.otros);
    limpio.autollenado = guardado.autollenado === true;
    limpio.nombre = texto(guardado.nombre);
    limpio.actualizado = Number.isFinite(guardado.actualizado) ? guardado.actualizado : 0;
    const verificados = guardado.verificados && typeof guardado.verificados === 'object' ? guardado.verificados : {};
    for (const [numero, valor] of Object.entries(verificados)) {
      // Anexos semestrales "13"; mensuales "9.B" o "9.B.1".
      if (valor === true && /^\d{1,2}(?:\.[A-Z](?:\.\d{1,2})?)?$/.test(numero)) limpio.verificados[numero] = true;
    }
    return limpio;
  }

  /** Revisa una copia JSON ya leída y devuelve su avance, o lanza un error que se muestra tal cual. */
  function desdeCopia(datos, lista, ids) {
    if (!datos || datos.app !== 'semestrales') throw new Error('no es una copia de esta app');
    // Las copias anteriores a la segunda lista no traen "lista": son de la primera.
    if ((datos.lista || PRIMERA_LISTA) !== lista) throw new Error('es de la otra lista de verificación; cámbiala arriba y vuelve a cargarla');
    return normalizar(datos.ficha, ids);
  }

  return { CAMPOS, CAMPOS_MENSUALES, ESTADOS, MAX_LUGARES, PRIMERA_LISTA, LISTA_MENSUAL, vacio, normalizar, desdeCopia };
})();

if (typeof module !== 'undefined') module.exports = Avance;
