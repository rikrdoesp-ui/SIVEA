'use strict';
/**
 * Genera el PDF de la Lista de verificación de Informes Semestrales.
 * Replica el formato entregado hoy: una página legal vertical con las
 * medidas del original exportado desde Excel. Unidades: puntos.
 *
 * El tamaño de letra es menor que el Calibri 5.8 del original porque
 * Helvetica es más ancha; a 5.3 ambas se ven de la misma altura.
 */
const FichaSemestral = (() => {
  const PAG = { ancho: 612, alto: 1008, arriba: 40.1 };
  const X = { izq: 26, codigo: 62, etiqueta: 96, si: 358, no: 376, na: 394, obs: 414, der: 586 };
  const FS = 5.3;
  const INTERLINEA = 7;
  const RELLENO = 1.5;
  const COLOR = {
    encabezado: [208, 206, 206],
    seccion: [214, 220, 228],
    etiqueta: [172, 185, 202],
    rojo: [255, 0, 0],
    negro: [0, 0, 0],
  };
  const NORMAL = { datos: 11.2, nota: 16.4, cabecera: 8.3, fila: 10.1, filaPma: 10.3, obs: 44, cierre: 44.6, limite: 968 };
  // Si las referencias no dejan caber la ficha en una hoja, se aprietan las filas sin texto largo.
  const COMPACTA = { ...NORMAL, cabecera: 7.8, fila: 8.6, filaPma: 8.6, obs: 24, cierre: 30, limite: 988 };
  let medidas = NORMAL;

  // Topes que garantizan que cada fila cabe en una página y que un respaldo
  // manipulado no bloquee la app. Se rechaza el dato: nunca se recorta en silencio.
  const LIMITE = { dato: 300, obsFila: 1500, textoFila: 2000, recuadro: 20000 };
  const MAX_REFERENCIAS = 5;
  const SUSTITUTOS = { '≥': '>=', '≤': '<=', '₂': '2', '₃': '3', '\t': ' ', '\r': '' };
  const FUERA_DE_WINANSI = /[^\n\x20-\x7E\xA0-\xFF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/gu;

  const sustituir = (texto) => texto.replace(/[≥≤₂₃\t\r]/g, (c) => SUSTITUTOS[c]);

  /** Para texto sacado de un PDF ajeno: lo que la ficha no admite pasa a "?" en vez de bloquear la generación. */
  const sanear = (valor) => sustituir(String(valor)).replace(FUERA_DE_WINANSI, '?');

  function limpiarTexto(valor, campo, limite) {
    if (typeof valor !== 'string') return '';
    const texto = sustituir(valor);
    const invalidos = texto.match(FUERA_DE_WINANSI);
    if (invalidos) throw new Error(`${campo}: el PDF no admite estos caracteres: ${[...new Set(invalidos)].join(' ')}`);
    if (texto.length > limite) throw new Error(`${campo}: supera el límite de ${limite} caracteres`);
    return texto;
  }

  function limpiarParrafos(valor, campo) {
    const parrafos = (Array.isArray(valor) ? valor : [valor]).filter((p) => typeof p === 'string' && p.trim());
    return limpiarTexto(parrafos.join('\n'), campo, LIMITE.recuadro);
  }

  /** Valida los datos, que pueden venir de un respaldo importado, y deja solo lo conocido. */
  function prepararDatos(catalogo, datos) {
    if (datos === null || typeof datos !== 'object') throw new Error('datos: se esperaba un objeto con la ficha');
    const limpio = { respuestas: {} };
    for (const campo of ['proyecto', 'contratista', 'periodo', 'revisadoPor', 'fecha']) {
      limpio[campo] = limpiarTexto(datos[campo], campo, LIMITE.dato);
    }
    const origen = datos.respuestas && typeof datos.respuestas === 'object' ? datos.respuestas : {};
    for (const { id, codigo, texto } of catalogo.secciones.flatMap((s) => s.items)) {
      const r = origen[id] && typeof origen[id] === 'object' ? origen[id] : {};
      const fila = [codigo, texto.length > 60 ? `${texto.slice(0, 60)}…` : texto].filter(Boolean).join(' ');
      limpio.respuestas[id] = {
        estado: ['si', 'no', 'na'].includes(r.estado) ? r.estado : '',
        obs: limpiarTexto(r.obs, `Observación de «${fila}»`, LIMITE.obsFila),
      };
      if (typeof r.texto === 'string') limpio.respuestas[id].texto = limpiarTexto(r.texto, `Observación de «${fila}»`, LIMITE.textoFila);
      limpio.respuestas[id].refs = referenciasDe(r)
        .filter((ref) => ref && typeof ref === 'object')
        .slice(0, MAX_REFERENCIAS)
        .map((ref) => ({
          titulo: limpiarTexto(ref.titulo, `Título de la referencia de «${fila}»`, LIMITE.dato),
          pagina: limpiarTexto(ref.pagina, `Página de la referencia de «${fila}»`, 60),
        }));
    }
    limpio.observaciones = limpiarParrafos(datos.observaciones, 'Observaciones');
    limpio.informeFinal = limpiarParrafos(datos.informeFinal, 'Informe final de cierre');
    return limpio;
  }

  // Un número o un rango con guion, guion largo o medio, o " a " ("25 a 30", "667–670").
  const RANGO_PAGINAS = /^(\d{1,5})(?:\s*(?:[-–—]|a)\s*(\d{1,5}))?$/i;

  /** "págs. 25-30, 40". Lo que no es número ni rango se deja como lo escribió el revisor. */
  function textoPaginas(pagina) {
    const trozos = String(pagina || '').replace(/^\s*págs?\.?/i, '').split(/\s*[,;]\s*|\s+y\s+/).map((t) => t.trim()).filter(Boolean);
    if (!trozos.length) return '';
    const lista = trozos.map((t) => {
      const m = RANGO_PAGINAS.exec(t);
      return m ? (m[2] ? `${m[1]}-${m[2]}` : m[1]) : t;
    });
    if (!trozos.some((t) => RANGO_PAGINAS.test(t))) return lista.join(', ');
    return `${lista.length > 1 || lista[0].includes('-') ? 'págs.' : 'pág.'} ${lista.join(', ')}`;
  }

  /** Acepta la forma actual (varias referencias) y la anterior (una sola). */
  function referenciasDe(r) {
    if (Array.isArray(r.refs)) return r.refs;
    return r.ref ? [r.ref] : [];
  }

  /** Texto de la columna OBSERVACION. SI, NO y N/A tienen columnas propias. */
  function textoObservacion(r) {
    if (typeof r.texto === 'string') return r.texto; // editado a mano en la columna
    const { estado, obs } = r;
    if (estado !== 'si') return obs;
    const referencias = referenciasDe(r)
      .map((ref) => [ref.titulo, textoPaginas(ref.pagina)].filter(Boolean).join(', '))
      .filter(Boolean)
      .join('; ');
    return [referencias, obs].filter(Boolean).join(' - ');
  }

  function crearLienzo(doc) {
    let y = PAG.arriba;

    const lineas = (texto, ancho, bold, fs = FS) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(fs);
      return doc.splitTextToSize(String(texto || ''), ancho - 2 * RELLENO);
    };

    const altoTexto = (cantidad) => cantidad * INTERLINEA + 3;

    const nuevaPagina = () => {
      doc.addPage([PAG.ancho, PAG.alto], 'portrait');
      y = PAG.arriba;
    };

    let alSaltar = null; // dibuja los títulos de columnas de la sección en curso

    const reservar = (alto) => {
      if (y + alto > medidas.limite) nuevaPagina();
    };

    /** celda: { x0, x1, texto, bold, alinea, color, fondo, fs } */
    const dibujar = (celda, yCelda, alto) => {
      const { x0, x1, texto, bold, alinea = 'left', color = COLOR.negro, fondo, fs = FS } = celda;
      if (fondo) doc.setFillColor(...fondo).rect(x0, yCelda, x1 - x0, alto, 'F');
      doc.setDrawColor(0).setLineWidth(0.55).rect(x0, yCelda, x1 - x0, alto, 'S');
      const partes = lineas(texto, x1 - x0, bold, fs);
      if (!partes.length || (partes.length === 1 && !partes[0])) return;
      doc.setTextColor(...color);
      const px = alinea === 'center' ? (x0 + x1) / 2 : x0 + RELLENO;
      const inicio = yCelda + (alto - (partes.length - 1) * INTERLINEA) / 2 + fs * 0.35;
      partes.forEach((p, i) => doc.text(p, px, inicio + i * INTERLINEA, { align: alinea }));
    };

    /** Dibuja una fila que crece según el texto más largo de sus celdas. */
    const fila = (celdas, altoMinimo) => {
      const maximo = Math.max(...celdas.map((c) => lineas(c.texto, c.x1 - c.x0, c.bold, c.fs).length));
      const alto = maximo > 1 ? Math.max(altoMinimo, altoTexto(maximo)) : altoMinimo;
      if (alto > medidas.limite - PAG.arriba) {
        const cual = celdas.slice(0, 2).map((c) => c.texto).filter(Boolean).join(' ').slice(0, 60);
        throw new Error(`La fila «${cual}» de la ficha no cabe en una página`);
      }
      if (y + alto > medidas.limite) {
        nuevaPagina();
        const titulos = alSaltar;
        alSaltar = null; // los títulos se dibujan con esta misma función
        if (titulos) titulos();
        alSaltar = titulos;
      }
      celdas.forEach((c) => dibujar(c, y, alto));
      y += alto;
    };

    const tramoRecuadro = (etiqueta, renglones, alto) => {
      dibujar(etiqueta, y, alto);
      doc.setDrawColor(0).setLineWidth(0.55).rect(X.etiqueta, y, X.der - X.etiqueta, alto, 'S');
      doc.setFont('helvetica', 'normal').setFontSize(FS).setTextColor(...COLOR.negro);
      renglones.forEach((l, i) => doc.text(l, X.etiqueta + RELLENO, y + 7 + i * INTERLINEA));
      y += alto;
    };

    /** Recuadro de texto libre: si no cabe, usa lo que queda y continúa en otra página. */
    const recuadro = (etiqueta, texto, altoMinimo) => {
      let pendientes = texto ? lineas(texto, X.der - X.etiqueta, false) : [];
      for (;;) {
        const necesario = Math.max(altoMinimo, altoTexto(pendientes.length));
        if (y + necesario <= medidas.limite) {
          tramoRecuadro(etiqueta, pendientes, necesario);
          return;
        }
        const disponibles = Math.floor((medidas.limite - y - 3) / INTERLINEA);
        if (disponibles >= 3 && pendientes.length > disponibles) {
          tramoRecuadro(etiqueta, pendientes.slice(0, disponibles), altoTexto(disponibles));
          pendientes = pendientes.slice(disponibles);
        }
        nuevaPagina();
      }
    };

    const posicion = () => y;
    const avanzar = (alto) => { y += alto; };
    const repetirAlSaltar = (titulos) => { alSaltar = titulos; };
    return { fila, recuadro, reservar, posicion, avanzar, repetirAlSaltar };
  }

  function dibujarEncabezado(doc, lienzo, catalogo, datos, logo) {
    const e = catalogo.encabezado;
    const altoLogo = 41.3;
    const y0 = lienzo.posicion();
    doc.setFillColor(...COLOR.encabezado).rect(X.izq, y0, X.der - X.izq, altoLogo, 'F');
    doc.setDrawColor(0).setLineWidth(0.55).rect(X.izq, y0, X.der - X.izq, altoLogo, 'S');
    if (logo) doc.addImage(logo, 'PNG', 94.6, y0 + 4.7, 43.2, 33.1);
    const centro = (X.izq + X.der) / 2;
    doc.setFont('helvetica', 'bold').setFontSize(7.2).setTextColor(...COLOR.negro);
    doc.text(e.programa, centro, y0 + 18, { align: 'center' });
    doc.text(e.seccion, centro, y0 + 28.2, { align: 'center' });
    lienzo.avanzar(altoLogo);

    lienzo.fila([{ x0: X.izq, x1: X.der, texto: e.titulo, bold: true, alinea: 'center', fondo: COLOR.encabezado, fs: 6.4 }], 16.5);
    const dato = (etiqueta, valor) => lienzo.fila([{ x0: X.izq, x1: X.der, texto: `${etiqueta}: ${valor || ''}`, bold: true }], medidas.datos);
    dato('Proyecto o Contrato', datos.proyecto);
    dato('Contratista', datos.contratista);
    dato('Periodo', datos.periodo);
    dato('Revisado por', datos.revisadoPor);
    dato('Fecha', datos.fecha);
    lienzo.fila([{ x0: X.izq, x1: X.der, texto: e.nota }], medidas.nota);
  }

  function celdasRespuesta(r, opciones = {}) {
    const bold = Boolean(opciones.bold);
    return [
      { x0: X.si, x1: X.no, texto: r.estado === 'si' ? 'SI' : '', alinea: 'center', bold },
      { x0: X.no, x1: X.na, texto: r.estado === 'no' ? 'NO' : '', alinea: 'center', bold: true, color: COLOR.rojo },
      { x0: X.na, x1: X.obs, texto: r.estado === 'na' ? 'N/A' : '', alinea: 'center', bold },
      { x0: X.obs, x1: X.der, texto: textoObservacion(r) },
    ];
  }

  function dibujarSeccion(lienzo, seccion, datos) {
    lienzo.repetirAlSaltar(null);
    const titulos = () => lienzo.fila([
      { x0: X.izq, x1: X.si, texto: seccion.titulo, bold: true, fondo: COLOR.seccion },
      { x0: X.si, x1: X.no, texto: 'SI', alinea: 'center', fondo: COLOR.seccion },
      { x0: X.no, x1: X.na, texto: 'NO', alinea: 'center', fondo: COLOR.seccion },
      { x0: X.na, x1: X.obs, texto: 'N/A', alinea: 'center', fondo: COLOR.seccion },
      { x0: X.obs, x1: X.der, texto: 'OBSERVACION', alinea: 'center', fondo: COLOR.seccion },
    ], medidas.cabecera);
    if (seccion.columnas) {
      lienzo.reservar(medidas.cabecera + 2 * medidas.filaPma); // la cabecera no queda sola al final de la página
      titulos();
      lienzo.repetirAlSaltar(titulos);
    }
    const altoFila = seccion.id === 'pma' ? medidas.filaPma : medidas.fila;
    const resaltada = !seccion.columnas;
    for (const item of seccion.items) {
      const inicio = seccion.conCodigo
        ? [
          { x0: X.izq, x1: X.codigo, texto: item.codigo, alinea: 'center' },
          { x0: X.codigo, x1: X.si, texto: item.texto },
        ]
        : [{ x0: X.izq, x1: X.si, texto: item.texto, bold: resaltada, fondo: resaltada ? COLOR.seccion : undefined }];
      lienzo.fila([...inicio, ...celdasRespuesta(datos.respuestas[item.id], { bold: resaltada })], altoFila);
    }
  }

  /**
   * @param {Function} JsPDF constructor de jsPDF
   * @param {object} catalogo contenido de catalogo.json
   * @param {object} datosCrudos encabezado, respuestas por id, observaciones e informeFinal
   * @param {string} [logo] imagen PNG como data URI
   */
  function generar(JsPDF, catalogo, datosCrudos, logo) {
    const datos = prepararDatos(catalogo, datosCrudos);
    const normal = construir(JsPDF, catalogo, datos, logo, NORMAL);
    if (normal.getNumberOfPages() === 1) return normal;
    const compacta = construir(JsPDF, catalogo, datos, logo, COMPACTA);
    return compacta.getNumberOfPages() === 1 ? compacta : normal;
  }

  function construir(JsPDF, catalogo, datos, logo, tamanos) {
    medidas = tamanos;
    const doc = new JsPDF({ unit: 'pt', format: [PAG.ancho, PAG.alto], orientation: 'portrait', compress: true });
    doc.setProperties({ title: 'Lista de verificación de Informe Semestral' });
    const lienzo = crearLienzo(doc);
    dibujarEncabezado(doc, lienzo, catalogo, datos, logo);
    catalogo.secciones.forEach((s) => dibujarSeccion(lienzo, s, datos));
    lienzo.repetirAlSaltar(null);
    lienzo.recuadro(
      { x0: X.izq, x1: X.etiqueta, texto: 'Observaciones', alinea: 'center', fondo: COLOR.etiqueta },
      datos.observaciones,
      medidas.obs,
    );
    lienzo.recuadro(
      { x0: X.izq, x1: X.etiqueta, texto: 'INFORME FINAL DE CIERRE', bold: true, fs: 7 },
      datos.informeFinal,
      medidas.cierre,
    );
    return doc;
  }

  return { generar, textoObservacion, textoPaginas, limpiarTexto, sanear, LIMITE, MAX_REFERENCIAS };
})();

if (typeof module !== 'undefined') module.exports = FichaSemestral;
