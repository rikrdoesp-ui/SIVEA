'use strict';
/**
 * Genera el PDF de la Lista de Verificación de la Gestión Ambiental Mensual Contratista (R-PA03-20).
 * Replica el formato entregado hoy: A4 vertical, de una a dos hojas. Unidades: puntos.
 * Los tamaños de letra son menores que los de Calibri porque Helvetica es más ancha.
 * Comparte con ficha.js la validación de caracteres y largos: nunca se recorta en silencio.
 */
const FichaMensual = (() => {
  const Base = typeof module !== 'undefined' ? require('./ficha.js') : FichaSemestral;
  const Puntaje = typeof module !== 'undefined' ? require('./puntaje.js') : PuntajeMensual;

  const PAG = { ancho: 595.2, alto: 841.68, arriba: 28.6, limite: 812 };
  const X = { izq: 26, items: 79, si: 326, no: 347, na: 369, obs: 391, pct: 420, der: 570 };
  const FS = { cuerpo: 6.2, obs: 5.4, dato: 6.4, seccion: 6.4, cabecera: 7.8, evaluacion: 7.3, total: 7.1 };
  const PAD = 1.8;
  const COLOR = { verde: [218, 242, 208], gris: [217, 217, 217], negro: [0, 0, 0], marca: [90, 142, 118] };
  const FINO = 0.7;
  const GRUESO = 1.4;
  const ALTO_MIN = 15;
  const ALTO_OTROS = 12.4;
  const MAX_OTROS = 2000;

  // Campos de texto del encabezado y las firmas; avance.js usa esta misma lista.
  const CAMPOS = ['contratista', 'fecha', 'proyecto', 'comentario', 'frente', 'fisico', 'evaluadoPor', 'aprobadoPor'];
  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  /** Día, mes y año de "d/m/aaaa"; null si no tiene esa forma o el mes no está entre 1 y 12. */
  function partesDeFecha(fecha) {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(fecha || '');
    return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? { dia: Number(m[1]), mes: Number(m[2]), anio: m[3] } : null;
  }

  /** "Mensual ENERO-26" a partir de una fecha día/mes/año; vacío si la fecha no es válida. */
  function comentarioDeFecha(fecha) {
    const f = partesDeFecha(fecha);
    return f ? `Mensual ${MESES[f.mes - 1]}-${f.anio.slice(2)}` : '';
  }

  /** Nombre corto del proyecto: la última palabra ("…DEL RÍO MATASNILLO" → "Matasnillo"). */
  function proyectoCorto(proyecto) {
    const ultima = String(proyecto || '').split(/[^\p{L}\p{N}]+/u).filter(Boolean).pop() || '';
    return ultima ? ultima[0].toUpperCase() + ultima.slice(1).toLowerCase() : '';
  }

  /**
   * Nombre del PDF entregado: "LVS del EsIA Matasnillo.pdf" (semestrales) o
   * "LVM Matasnillo 07-26.pdf" (mensual: mes del comentario "Mensual JULIO-26" o, si no, de la fecha).
   */
  function nombreDeArchivo({ mensual, proyecto, comentario, fecha }) {
    const corto = proyectoCorto(proyecto) || 'Proyecto';
    if (!mensual) return `LVS del EsIA ${corto}.pdf`;
    const c = /(\p{L}+)-(\d{2})\s*$/u.exec(comentario || '');
    const i = c ? MESES.indexOf(c[1].toUpperCase()) : -1;
    let mes = i >= 0 ? `${String(i + 1).padStart(2, '0')}-${c[2]}` : '';
    const f = partesDeFecha(fecha);
    if (!mes && f) mes = `${String(f.mes).padStart(2, '0')}-${f.anio.slice(2)}`;
    return `LVM ${corto}${mes ? ` ${mes}` : ''}.pdf`;
  }

  const RESERVADOS = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

  /** Lo que el revisor escriba como nombre, sin caracteres que Windows no admite y con ".pdf". */
  function nombreSeguro(nombre, respaldo) {
    const limpio = String(nombre || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
    const raiz = limpio.replace(/\.pdf$/i, '');
    if (!raiz) return respaldo;
    // Windows no deja crear archivos con estos nombres, ni con extensión ("CON.pdf").
    const seguro = RESERVADOS.test(raiz) ? `_${limpio}` : limpio;
    return /\.pdf$/i.test(seguro) ? seguro : `${seguro}.pdf`;
  }

  /** Valida los datos, que pueden venir de un respaldo importado, y deja solo lo conocido. */
  function prepararDatos(catalogo, datos) {
    if (datos === null || typeof datos !== 'object') throw new Error('datos: se esperaba un objeto con la ficha');
    const { limpiarTexto, LIMITE, MAX_REFERENCIAS } = Base;
    const limpio = { respuestas: {} };
    for (const campo of CAMPOS) {
      limpio[campo] = limpiarTexto(datos[campo], campo, LIMITE.dato);
    }
    limpio.otros = limpiarTexto(datos.otros, 'Otros', MAX_OTROS);
    const crudo = datos.porcentajeC;
    const hayPorcentaje = crudo !== undefined && crudo !== null && String(crudo).trim() !== '';
    limpio.porcentajeC = Puntaje.porcentaje(crudo);
    if (hayPorcentaje && limpio.porcentajeC === null) throw new Error('Porcentaje de cumplimiento (C): debe ser un número de 0 a 100');
    const origen = datos.respuestas && typeof datos.respuestas === 'object' ? datos.respuestas : {};
    for (const seccion of catalogo.secciones.filter((s) => !s.numerico)) {
      for (const { id, codigo } of seccion.items) {
        const r = origen[id] && typeof origen[id] === 'object' ? origen[id] : {};
        const fila = `${seccion.id}.${codigo}`;
        const limpia = {
          estado: ['si', 'no', 'na'].includes(r.estado) ? r.estado : '',
          obs: limpiarTexto(r.obs, `Observación de «${fila}»`, LIMITE.obsFila),
        };
        if (typeof r.texto === 'string') limpia.texto = limpiarTexto(r.texto, `Observación de «${fila}»`, LIMITE.textoFila);
        limpia.refs = (Array.isArray(r.refs) ? r.refs : [])
          .filter((ref) => ref && typeof ref === 'object')
          .slice(0, MAX_REFERENCIAS)
          .map((ref) => ({
            titulo: limpiarTexto(ref.titulo, `Título de la referencia de «${fila}»`, LIMITE.dato),
            pagina: limpiarTexto(ref.pagina, `Página de la referencia de «${fila}»`, 60),
          }));
        limpio.respuestas[id] = limpia;
      }
    }
    return limpio;
  }

  function crearLienzo(doc) {
    let y = PAG.arriba;
    let inicioPagina = y;

    const lineas = (texto, ancho, bold, fs) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal').setFontSize(fs);
      return doc.splitTextToSize(String(texto || ''), ancho - 2 * PAD);
    };

    const linea = (x0, x1, yy, grosor) => doc.setDrawColor(0).setLineWidth(grosor).line(x0, yy, x1, yy);

    /** Marco grueso de la hoja en curso. */
    const cerrarPagina = () => doc.setDrawColor(0).setLineWidth(GRUESO).rect(X.izq, inicioPagina, X.der - X.izq, y - inicioPagina, 'S');

    const nuevaPagina = () => {
      cerrarPagina();
      doc.addPage([PAG.ancho, PAG.alto], 'portrait');
      y = PAG.arriba;
      inicioPagina = y;
    };

    const reservar = (alto, cual = '') => {
      if (alto > PAG.limite - PAG.arriba) throw new Error(`El bloque «${String(cual).slice(0, 60)}» de la ficha no cabe en una página`);
      if (y + alto > PAG.limite) nuevaPagina();
    };

    /** celda: { x0, x1, texto, bold, alinea, fondo, fs, interlinea } */
    const dibujar = (celda, yy, alto) => {
      const { x0, x1, texto, bold, alinea = 'left', fondo, fs = FS.cuerpo, interlinea = 9, sinBorde } = celda;
      if (fondo) doc.setFillColor(...fondo).rect(x0, yy, x1 - x0, alto, 'F');
      if (!sinBorde) doc.setDrawColor(0).setLineWidth(FINO).rect(x0, yy, x1 - x0, alto, 'S');
      const partes = lineas(texto, x1 - x0, bold, fs);
      if (!partes.length || (partes.length === 1 && !partes[0])) return;
      doc.setTextColor(...COLOR.negro);
      const px = alinea === 'center' ? (x0 + x1) / 2 : alinea === 'right' ? x1 - PAD - 1 : x0 + PAD;
      const inicio = yy + (alto - (partes.length - 1) * interlinea) / 2 + fs * 0.35;
      partes.forEach((p, i) => doc.text(p, px, inicio + i * interlinea, { align: alinea }));
    };

    /** Una fila crece según su celda más larga. `grueso` marca con línea gruesa arriba y abajo. Devuelve su posición. */
    const fila = (celdas, altoMinimo, grueso = false) => {
      const maximo = Math.max(...celdas.map((c) => lineas(c.texto, c.x1 - c.x0, c.bold, c.fs || FS.cuerpo).length));
      const interlinea = Math.max(...celdas.map((c) => c.interlinea || 9));
      const alto = maximo > 1 ? Math.max(altoMinimo, maximo * interlinea + 2.4) : altoMinimo;
      reservar(alto, celdas.slice(0, 2).map((c) => c.texto).filter(Boolean).join(' '));
      const arriba = y;
      celdas.forEach((c) => dibujar(c, arriba, alto));
      if (grueso) { linea(X.izq, X.der, arriba, GRUESO); linea(X.izq, X.der, arriba + alto, GRUESO); }
      y += alto;
      return { y: arriba, alto };
    };

    return { doc, fila, reservar, cerrarPagina, dibujar, linea, lineas, posicion: () => y, avanzar: (alto) => { y += alto; } };
  }

  /** Check verde, hecho con líneas porque Helvetica no tiene ✓. */
  function marcaCheck(doc, cx, cy) {
    doc.setDrawColor(...COLOR.marca).setLineWidth(1.7).setLineCap('round').setLineJoin('round');
    doc.lines([[2.2, 2.6], [4.4, -5.4]], cx - 3.2, cy + 0.2, [1, 1], 'S');
    doc.setLineCap('butt').setLineJoin('miter');
  }

  function marcaGuion(doc, cx, cy) {
    doc.setDrawColor(...COLOR.negro).setLineWidth(1).line(cx - 2.5, cy, cx + 2.5, cy);
  }

  function dibujarEncabezado(lienzo, e, datos, logo) {
    const { doc } = lienzo;
    const y0 = lienzo.posicion();
    const alto = 48.7;
    const xCodigo = 406;
    doc.setDrawColor(0).setLineWidth(FINO);
    doc.rect(X.izq, y0, X.items - X.izq, alto, 'S').rect(X.items, y0, xCodigo - X.items, alto, 'S').rect(xCodigo, y0, X.der - xCodigo, alto, 'S');
    if (logo) doc.addImage(logo, 'PNG', 29.5, y0 + (alto - 35.6) / 2, 46, 35.6);
    doc.setTextColor(...COLOR.negro).setFont('helvetica', 'bold');
    const centro = (X.items + xCodigo) / 2;
    doc.setFontSize(7.5).text(e.procedimiento, centro, y0 + 15, { align: 'center' });
    doc.setFontSize(7.4).text(e.titulo, centro, y0 + 33.3, { align: 'center' });
    doc.setFontSize(5.3);
    [`Código: ${e.codigo}`, `Edición: ${e.edicion}`, `Vigencia:  ${e.vigencia}`].forEach((t, i) => doc.text(t, xCodigo + 2, y0 + 17.5 + i * 8.6));
    lienzo.avanzar(alto);
    lienzo.linea(X.izq, X.der, y0 + alto, GRUESO);

    // Datos: etiqueta en negrita y valor subrayado, en dos columnas.
    const yDatos = lienzo.posicion();
    const colIzq = 320 - (X.izq + 1.3);
    const colDer = X.der - 2 - 327;
    const campo = (rotulo, valor, x, ancho, yy) => {
      doc.setFont('helvetica', 'bold').setFontSize(FS.dato);
      const etiqueta = `${rotulo}: `;
      doc.text(etiqueta, x, yy);
      const xv = x + doc.getTextWidth(etiqueta);
      doc.setFont('helvetica', 'normal').setFontSize(FS.dato);
      const partes = doc.splitTextToSize(valor || '', ancho - (xv - x));
      partes.forEach((p, i) => {
        doc.text(p, xv, yy + i * 7.5);
        if (p) doc.setDrawColor(0).setLineWidth(0.4).line(xv, yy + i * 7.5 + 1, xv + doc.getTextWidth(p), yy + i * 7.5 + 1);
      });
      return partes.length;
    };
    /** Campo con renglón: "Etiqueta:___valor_____" hasta xFin. */
    const renglon = (rotulo, valor, x, xFin, yy) => {
      doc.setFont('helvetica', 'bold').setFontSize(FS.dato).text(`${rotulo}:`, x, yy);
      const xv = x + doc.getTextWidth(`${rotulo}:`);
      doc.setDrawColor(0).setLineWidth(0.4).line(xv, yy + 1.2, xFin, yy + 1.2);
      doc.setFont('helvetica', 'normal').setFontSize(FS.dato);
      const partes = doc.splitTextToSize(valor || '', xFin - xv - 12);
      if (partes.length > 1) throw new Error(`${rotulo}: no cabe en una línea`);
      doc.text(partes[0] || '', xv + 8, yy);
    };
    const xi = X.izq + 1.3;
    let yy = yDatos + 12;
    const n1 = Math.max(campo('Contratista', datos.contratista, xi, colIzq, yy), campo('Fecha', datos.fecha, 327, colDer, yy));
    yy += 15 + (n1 - 1) * 7.5;
    const n2 = Math.max(campo('Proyecto', datos.proyecto, xi, colIzq, yy), campo('Comentario', datos.comentario, 327, colDer, yy));
    yy += 18 + (n2 - 1) * 7.5;
    renglon('Frente de trabajo', datos.frente, xi, 324, yy);
    renglon('% Físico de obra', datos.fisico, 327, 494, yy);
    lienzo.avanzar(yy + 7.4 - yDatos);
    lienzo.linea(X.izq, X.der, lienzo.posicion(), GRUESO);

    // Tipo de verificación
    const yTipo = lienzo.posicion();
    doc.setFont('helvetica', 'bold').setFontSize(5.9).text('Tipo de Verificación :', xi, yTipo + 14);
    doc.setFont('helvetica', 'normal').text('Mensual', 96, yTipo + 14);
    doc.setDrawColor(0).setLineWidth(FINO).rect(126, yTipo + 5.8, 13.2, 11.6, 'S');
    marcaCheck(doc, 132.6, yTipo + 11.8);
    lienzo.avanzar(24.3);
    lienzo.linea(X.izq, X.der, lienzo.posicion(), GRUESO);
  }

  function dibujarCabeceraTabla(lienzo) {
    const f = { fondo: COLOR.verde, bold: true, alinea: 'center', fs: FS.cabecera };
    lienzo.fila([
      { ...f, x0: X.izq, x1: X.items, texto: 'Ítems' },
      { ...f, x0: X.items, x1: X.si, texto: 'Puntos a verificar' },
      { ...f, x0: X.si, x1: X.obs, texto: 'Evaluación de cumplimiento', fs: FS.evaluacion, interlinea: 10 },
      { ...f, x0: X.obs, x1: X.der, texto: 'Observaciones' },
    ], 22.6, true);
  }

  function filaTitulo(lienzo, seccion) {
    lienzo.reservar(14.3 + 3 * ALTO_MIN, seccion.titulo); // el título no queda solo al final de la hoja
    const g = { fondo: COLOR.gris, bold: true, fs: FS.seccion };
    if (seccion.columnas) {
      lienzo.fila([
        { ...g, x0: X.izq, x1: X.si, texto: seccion.titulo },
        { ...g, x0: X.si, x1: X.no, texto: 'SI', alinea: 'center' },
        { ...g, x0: X.no, x1: X.na, texto: 'NO', alinea: 'center' },
        { ...g, x0: X.na, x1: X.obs, texto: 'N/A', alinea: 'center' },
        { ...g, x0: X.obs, x1: X.der, texto: '' },
      ], 14.3, true);
    } else {
      lienzo.fila([{ ...g, x0: X.izq, x1: X.der, texto: seccion.titulo }], 14.3, true);
    }
  }

  function filaTotal(lienzo, s, c) {
    const verde = { fondo: COLOR.verde, alinea: 'center', fs: FS.total };
    lienzo.fila([
      { x0: X.izq, x1: X.si, texto: 'Total:', alinea: 'right', bold: true, fs: FS.total },
      { ...verde, x0: X.si, x1: X.no, texto: String(c.si) },
      { ...verde, x0: X.no, x1: X.na, texto: String(c.no) },
      { ...verde, x0: X.na, x1: X.obs, texto: String(c.na) },
      { ...verde, x0: X.obs, x1: X.pct, texto: `${Puntaje.entero(c.puntos)}%`, bold: true },
      { ...verde, x0: X.pct, x1: X.der, texto: `Cumplimiento ${s.id} (ponderación a ${s.peso}%)`, bold: true },
    ], 21.4, true);
  }

  function dibujarSeccion(lienzo, s, datos, calculo) {
    const { doc } = lienzo;
    filaTitulo(lienzo, s);
    if (s.numerico) {
      const [item] = s.items;
      const verde = { fondo: COLOR.verde, alinea: 'center', bold: true, fs: FS.total };
      lienzo.fila([
        { x0: X.izq, x1: X.items, texto: item.codigo, alinea: 'center' },
        { x0: X.items, x1: X.si, texto: item.texto },
        { x0: X.si, x1: X.obs, texto: datos.porcentajeC === null ? '' : `${Puntaje.entero(datos.porcentajeC)}%`, alinea: 'center' },
        { ...verde, x0: X.obs, x1: X.pct, texto: `${Puntaje.entero(calculo.puntos)}%` },
        { ...verde, x0: X.pct, x1: X.der, texto: `Cumplimiento ${s.id} (ponderación a ${s.peso}%)` },
      ], 21, true);
      return;
    }
    for (const item of s.items) {
      const r = datos.respuestas[item.id];
      const { y, alto } = lienzo.fila([
        { x0: X.izq, x1: X.items, texto: item.codigo, alinea: 'center' },
        { x0: X.items, x1: X.si, texto: item.texto },
        { x0: X.si, x1: X.no, texto: '' },
        { x0: X.no, x1: X.na, texto: '' },
        { x0: X.na, x1: X.obs, texto: '' },
        { x0: X.obs, x1: X.der, texto: Base.textoObservacion(r), fs: FS.obs, interlinea: 8.4 },
      ], ALTO_MIN);
      const cy = y + alto / 2;
      if (r.estado === 'si') marcaCheck(doc, (X.si + X.no) / 2, cy);
      if (r.estado === 'no') marcaCheck(doc, (X.no + X.na) / 2, cy);
      if (r.estado === 'na') marcaGuion(doc, (X.na + X.obs) / 2, cy);
    }
    filaTotal(lienzo, s, calculo);
  }

  function dibujarCierre(lienzo, datos, total) {
    const { doc } = lienzo;
    lienzo.fila([
      { x0: X.izq, x1: X.obs, texto: 'Total:', alinea: 'right', bold: true, fs: FS.total },
      { x0: X.obs, x1: X.pct, texto: `${Puntaje.entero(total)}%`, alinea: 'center', bold: true, fs: FS.total },
      { x0: X.pct, x1: X.der, texto: 'Cumplimiento mensual', bold: true, fs: FS.total },
    ], 17.6, true);

    // Otros: cinco renglones grises; si el texto es más largo, se agregan renglones.
    const parrafos = lienzo.lineas(datos.otros, X.der - X.items, false, FS.cuerpo);
    const renglones = Math.max(5, parrafos.length);
    lienzo.avanzar(3.8);
    lienzo.reservar(renglones * ALTO_OTROS + 2 * 10.5 + 14, 'Otros');
    const y0 = lienzo.posicion();
    lienzo.dibujar({ x0: X.izq, x1: X.items, texto: '', fondo: COLOR.gris }, y0, renglones * ALTO_OTROS);
    doc.setFont('helvetica', 'bold').setFontSize(FS.seccion).setTextColor(...COLOR.negro).text('Otros :', X.izq + 1.3, y0 + 7.6);
    for (let i = 0; i < renglones; i += 1) {
      lienzo.dibujar({ x0: X.items, x1: X.der, texto: '', fondo: COLOR.gris }, y0 + i * ALTO_OTROS, ALTO_OTROS);
      if (parrafos[i]) doc.setFont('helvetica', 'normal').setFontSize(FS.cuerpo).setTextColor(...COLOR.negro).text(parrafos[i], X.items + PAD, y0 + i * ALTO_OTROS + 8.4);
    }
    lienzo.avanzar(renglones * ALTO_OTROS);
    lienzo.linea(X.izq, X.der, y0, GRUESO);

    const firma = (rotulo, valor) => {
      const yy = lienzo.posicion();
      lienzo.dibujar({ x0: X.izq + 1.3, x1: X.items, texto: rotulo, alinea: 'center', bold: true, fondo: COLOR.verde, fs: FS.seccion, sinBorde: true }, yy, 10.5);
      lienzo.dibujar({ x0: X.items, x1: X.si, texto: valor, bold: true, fondo: COLOR.verde, fs: FS.seccion, sinBorde: true }, yy, 10.5);
      lienzo.linea(X.items, X.si, yy + 10.5, 0.7);
      lienzo.avanzar(10.5);
    };
    lienzo.avanzar(5.8);
    firma('Evaluado por:', datos.evaluadoPor);
    lienzo.avanzar(5.8);
    firma('Aprobado por:', datos.aprobadoPor);
    lienzo.avanzar(1);
  }

  /**
   * @param {Function} JsPDF constructor de jsPDF
   * @param {object} catalogo contenido de catalogo-mensual.json
   * @param {object} datosCrudos encabezado, respuestas por id, porcentajeC, otros y firmas
   * @param {string} [logo] imagen PNG como data URI
   */
  function generar(JsPDF, catalogo, datosCrudos, logo) {
    const datos = prepararDatos(catalogo, datosCrudos);
    const { secciones, total } = Puntaje.calcular(catalogo, datos.respuestas, datos.porcentajeC);
    const doc = new JsPDF({ unit: 'pt', format: [PAG.ancho, PAG.alto], orientation: 'portrait', compress: true });
    doc.setProperties({ title: 'Lista de verificación de la gestión ambiental mensual' });
    const lienzo = crearLienzo(doc);
    dibujarEncabezado(lienzo, catalogo.encabezado, datos, logo);
    dibujarCabeceraTabla(lienzo);
    for (const s of catalogo.secciones) dibujarSeccion(lienzo, s, datos, secciones[s.id]);
    dibujarCierre(lienzo, datos, total);
    lienzo.cerrarPagina();
    return doc;
  }

  return { generar, partesDeFecha, comentarioDeFecha, nombreDeArchivo, nombreSeguro, CAMPOS };
})();

if (typeof module !== 'undefined') module.exports = FichaMensual;
