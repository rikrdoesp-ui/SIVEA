'use strict';
/**
 * Sugiere dónde mirar para cada requisito. Solo orienta: quien revisa decide.
 * Los anexos se ubican por tema, porque su número cambia entre informes.
 */
const Evidencia = (() => {
  const MAX_PAGINAS = 6;
  const programa = (expresion) => ({ cuerpo: new RegExp(expresion, 'i') });
  const acapite = (n) => ({ matrizResolucion: new RegExp(`ac[aá]pite\\s+${n}\\b`, 'i') });
  const articulo = (n) => ({ matrizResolucion: new RegExp(`Art[ií]culo\\s+${n}\\b`, 'i') });
  const anexos = (expresion, cuerpo) => ({ anexos: new RegExp(expresion, 'i'), cuerpo: cuerpo && new RegExp(cuerpo, 'i') });

  const REGLAS = {
    'pma-01': programa('programa de control de ruidos?'),
    'pma-02': programa('programa de calidad del? aire'),
    'pma-03': programa('programa de limpieza y desarraigue'),
    'pma-04': programa('programa de control de erosi[oó]n'),
    'pma-05': programa('programa de manejo de la fauna'),
    'pma-06': programa('programa de control de criaderos'),
    'pma-07': programa('programa de tr[aá]nsito'),
    'pma-08': programa('programa de clausura de tanques'),
    'pma-09': programa('programa de manejo del paisaje'),
    'pma-10': programa('programa de sitios arqueol[oó]gicos'),
    'pma-11': programa('programa de manejo de escombros'),
    'pma-12': programa('programa de manejo de obras de concreto'),
    'pma-13': programa('programa de manejo de maquinaria'),
    'pma-14': programa('programa de manejo de las casetas'),
    'pma-15': programa('programa de informaci[oó]n, comunicaci[oó]n'),
    'pma-16': programa('planes? de prevenci[oó]n de riesgos'),
    'pma-17': programa('planes? de contingencias?'),
    ...Object.fromEntries(Array.from({ length: 15 }, (_, i) => [`res-${String(i + 1).padStart(2, '0')}`, acapite(i + 1)])),
    'res-16': articulo(4),
    'res-17': articulo(6),
    'gen-01': programa('resultados de los monitoreos'),
    'gen-02': programa('porcentaje de cumplimiento|cuadro de seguimiento'),
    'gen-03': programa('observaciones y recomendaciones generales'),
    'anx-01': anexos('cronograma|porcentaje de avance'),
    'anx-02': anexos('listado de equipos', 'equipo utilizado'),
    'anx-03': anexos('mantenimiento de equipos'),
    'anx-04': anexos('asistencia.*capacitaci|educaci[oó]n ambiental'),
    'anx-05': anexos('inspecci[oó]n(es)? ambiental|verificaci[oó]n.*ambiental'),
    'anx-06': anexos('poda|tala\\b|indemnizaci[oó]n'),
    'anx-07': anexos('reciclaje|desechos org[aá]nicos|recolecci[oó]n de residuos'),
    'anx-08': anexos('residuos.*peligros'),
    'anx-09': anexos('rescate de fauna|registro de fauna'),
    'anx-10': anexos('ATTT|ruptura|obra en cauce'),
    'anx-11': anexos('escombros'),
    'anx-12': anexos('vegetal|desechos org[aá]nicos'),
    'anx-13': anexos('reforestaci[oó]n|inventario forestal'),
    'anx-14': anexos('monitoreos|certificaciones atmosf'),
    'anx-15': anexos('plan de seguridad'),
    'anx-16': anexos('salud ocupacional|dosimetr', 'dosimetr'),
    'anx-17': anexos('inspecci[oó]n.*seguridad|botiqu[ií]n'),
    'anx-18': anexos('asistencia.*capacitaci'),
    'anx-19': anexos('extintores'),
    'anx-20': anexos('EPP|protecci[oó]n personal'),
    'anx-21': anexos('fumigaci[oó]n'),
    'anx-22': anexos('inodoros|ba[ñn]os port'),
    'anx-23': anexos('tr[aá]nsito|cierres parcial'),
    'anx-24': anexos('educaci[oó]n ambiental'),
    'anx-25': anexos('gesti[oó]n social|publicaciones|permisos de paso'),
    'anx-26': anexos('emergencias ambientales|plan de contingencia'),
    // Lista mensual R-PA03-20, calibrada con el Informe Mensual No. 34 (anexos "ANEXO 9.X").
    'mA-01': anexos('actas de reuni', 'Cuadro 9\\.2\\b|reuniones? de seguimiento'),
    'mA-02': programa('inspecciones coordinadas|Cuadro 9\\.3\\b'),
    'mA-03': anexos('comunicaciones', 'comunicaciones de la secci'),
    'mA-04': anexos('ficha de evaluaci[oó]n', 'hallazgos? de (la )?inspecci'),
    'mA-05': programa('bit[aá]cora|lista de verificaci|Cuadro 9\\.3\\b'),
    'mA-06': programa('informes? semestral|informes? de cumplimiento'),
    'mB-01': anexos('permisos ambientales|otros permisos', 'permisolog'),
    'mB-02': anexos('certificaciones atmosf', 'cronograma de monitoreos'),
    'mB-03': anexos('mantenimiento'),
    'mB-04': anexos('registro fotogr', 'programa de control de (la )?calidad del? aire'),
    'mB-05': anexos('registro fotogr', 'programa de control de ruidos?'),
    'mB-06': anexos('capacitaci|inducci', 'Cuadro 9\\.8\\b'),
    'mB-07': programa('\\bBPA\\b|buenas pr[aá]cticas'),
    'mB-08': anexos('reciclaje', 'Cuadro 9\\.5\\b'),
    'mB-09': programa('manejo de (las )?casetas|campamentos? temporal'),
    'mB-10': programa('(desechos|residuos) vegetales'),
    'mB-11': anexos('disposici[oó]n de residuos|residuos s[oó]lidos'),
    'mB-12': anexos('escombros'),
    'mB-13': anexos('peligros'),
    'mB-14': anexos('ba[ñn]os port'),
    'mB-15': anexos('rescate'),
    'mB-16': anexos('registro fotogr', 'letreros?.{0,80}(caza|fauna)|prohibid[oa] (la )?caza'),
    'mB-17': anexos('control de plagas|fumigaci', 'control de plagas|fumigaci'),
    'mB-18': anexos('registro fotogr', 'programa de control de erosi'),
    'mB-19': anexos('cierre attt|otros permisos', 'programa de tr[aá]nsito'),
    'mB-20': programa('plan de educaci[oó]n ambiental'),
    'mB-21': anexos('sustancias qu[ií]micas', 'plan de prevenci[oó]n de riesgos'),
    'mB-22': programa('ruptura de tuber|servicios p[uú]blicos'),
    'mB-23': anexos('emergencia|situaci[oó]n extraordinaria', 'plan de contingencias?'),
    'mC-01': programa('promedio de cumplimiento|porcentaje de cumplimiento'),
  };

  const ENCABEZADO_RESOLUCION = /Art[ií]culos,\s*ac[aá]pites/i;
  const INDICE = /CUADRO DE CONTENIDO/i;

  function buscarPaginas(textos, expresion, cumple) {
    const paginas = [];
    for (let i = 0; i < textos.length && paginas.length < MAX_PAGINAS; i += 1) {
      if (cumple(textos[i], i + 1) && expresion.test(textos[i])) paginas.push(i + 1);
    }
    return paginas;
  }

  // Títulos de sección: "9.3.2 AVANCE IMPLEMENTACION PLAN …" (número y palabras en mayúsculas)
  // o leyendas de cuadro: "Cuadro 9.8: Capacitaciones realizadas …".
  const PALABRA_MAYUS = '[A-ZÁÉÍÓÚÑÜ0-9][A-ZÁÉÍÓÚÑÜ0-9,()/–-]*';
  const TITULO_NUMERADO = new RegExp(`(?<![\\d.])\\d{1,2}(?:\\.\\d{1,2}){1,3}\\.?\\s+(?:${PALABRA_MAYUS}(?=\\s|$)\\s*){2,14}`, 'g');
  // Leyenda de cuadro: la palabra que sigue al número va en mayúscula ("Cuadro 9.8: Capacitaciones…");
  // así no cuenta una mención en el texto ("en el Cuadro 9.8 se presenta…").
  const LEYENDA_CUADRO = /\bCuadro\s+\d{1,2}(?:\.\d{1,2}){0,2}\s*[:.–-]?\s*[A-ZÁÉÍÓÚÑ][^.•]{3,100}/g;
  const MAX_TITULO_SECCION = 80;
  const PAGINAS_ATRAS = 60; // una sección (p. ej. una matriz) puede ocupar muchas páginas sin repetir su título

  const recortar = (t) => {
    let limpio = t.replace(/\s+/g, ' ').trim();
    const anio = limpio.match(/^.*?\b(?:19|20)\d{2}\b/); // la leyenda suele terminar en el año; luego viene la tabla
    if (anio && /^Cuadro/.test(limpio)) limpio = anio[0];
    limpio = limpio.replace(/\s+\S$/, '').replace(/[\s,;:(–-]+$/, ''); // sin la letra suelta del texto que sigue
    return limpio.length <= MAX_TITULO_SECCION ? limpio : `${limpio.slice(0, MAX_TITULO_SECCION).replace(/\s+\S*$/, '')}…`;
  };

  const titulosDe = (texto) => [...texto.matchAll(TITULO_NUMERADO), ...texto.matchAll(LEYENDA_CUADRO)]
    .map((m) => ({ texto: recortar(m[0]), en: m.index, numerado: !/^Cuadro/.test(m[0]) }))
    .filter((t) => t.texto.length >= 8)
    .sort((a, b) => a.en - b.en);

  /**
   * Título de la sección donde aparece lo buscado en la página p (desde 1): primero uno que ya
   * contenga lo buscado; si no, el último anterior a la coincidencia; si la página no tiene,
   * el último título numerado de las páginas previas.
   */
  function seccionDe(textos, p, expresion) {
    const texto = textos[p - 1];
    const titulos = titulosDe(texto);
    const propio = titulos.find((t) => expresion.test(t.texto));
    if (propio) return propio.texto;
    const donde = texto.search(expresion);
    const previos = titulos.filter((t) => t.en <= donde);
    if (previos.length) return previos[previos.length - 1].texto;
    for (let q = p - 1; q >= Math.max(1, p - PAGINAS_ATRAS); q -= 1) {
      const numerados = titulosDe(textos[q - 1]).filter((t) => t.numerado);
      if (numerados.length) return numerados[numerados.length - 1].texto;
    }
    return titulos.length ? titulos[0].texto : 'Cuerpo del informe';
  }

  /** Devuelve, por id de requisito, los anexos y las páginas donde conviene mirar. */
  function sugerir(ids, textos, indice) {
    const inicioAnexos = indice.length ? indice[0].pagina : textos.length + 1;
    const enCuerpo = (t, pagina) => pagina < inicioAnexos && !INDICE.test(t);
    const enMatriz = (t, pagina) => pagina < inicioAnexos && ENCABEZADO_RESOLUCION.test(t);
    const resultado = {};
    for (const id of ids) {
      const regla = REGLAS[id] || {};
      const delCuerpo = regla.cuerpo ? buscarPaginas(textos, regla.cuerpo, enCuerpo) : [];
      const deMatriz = regla.matrizResolucion ? buscarPaginas(textos, regla.matrizResolucion, enMatriz) : [];
      resultado[id] = {
        anexos: regla.anexos ? indice.filter((a) => regla.anexos.test(a.titulo)) : [],
        paginas: [...delCuerpo, ...deMatriz],
        // Por página, el título de sección para citarlo en la observación o la referencia.
        secciones: [
          ...delCuerpo.map((p) => ({ pagina: p, titulo: seccionDe(textos, p, regla.cuerpo) })),
          ...deMatriz.map((p) => ({ pagina: p, titulo: seccionDe(textos, p, regla.matrizResolucion) })),
        ],
      };
    }
    return resultado;
  }

  /** Añade a cada anexo sus hojas, sin contar la carátula, y cuántas no tienen texto. */
  function rangos(indice, textos, tieneTexto) {
    return indice.map((anexo, i) => {
      const desde = anexo.pagina + 1;
      const hasta = i + 1 < indice.length ? indice[i + 1].pagina - 1 : textos.length;
      const hojas = Math.max(0, hasta - desde + 1);
      const escaneadas = textos.slice(desde - 1, hasta).filter((t) => !tieneTexto(t)).length;
      return { ...anexo, desde, hasta, hojas, escaneadas };
    });
  }

  const MAX_TITULO_REFERENCIA = 68; // junto con la página, cabe en dos líneas de la columna

  /** Título corto para citar un anexo: "Anexo 13: Registro de inspección de Extintores". */
  function tituloResumido(anexo) {
    const titulo = anexo.titulo
      .replace(/\s*\(?NO APLICA.*$/i, '')
      .replace(/\s*(?:vigentes?\s+)?(?:para|al finalizar|de)\s+este\s+periodo.*$/i, '')
      .replace(/[\s.:]+$/, '');
    const completo = `Anexo ${anexo.numero}: ${titulo}`;
    if (completo.length <= MAX_TITULO_REFERENCIA) return completo;
    const corte = completo.slice(0, MAX_TITULO_REFERENCIA).replace(/\s+\S*$/, '');
    return `${corte.replace(/[\s,;:(]+$/, '')}…`;
  }

  const nombreRequisito = (texto) => texto.replace(/\s*\(.*$/, '').replace(/\s+/g, ' ').trim().replace(/\.$/, '');

  /** Frases listas para usar, según lo que se encontró para el requisito. */
  function frases(id, texto, evidencia, estado) {
    const fila = ['Registros incompletos', 'Fechas fuera del periodo', 'Sin firma', 'Documento ilegible'];
    if (evidencia && evidencia.anexos.some((a) => a.noAplica)) fila.unshift('El informe indica que no aplica para este periodo');
    const sinEvidencia = evidencia && !evidencia.anexos.length && !evidencia.paginas.length;
    if (estado === 'si' || (!sinEvidencia && estado !== 'no')) return { fila, generales: [] };
    const nombre = nombreRequisito(texto);
    const cierre = 'correspondiente al período evaluado, a fin de sustentar el cumplimiento ambiental y permitir la aprobación del documento.';
    const generales = /^(pma|res)/.test(id)
      ? [`No se evidencia dentro del Informe Semestral el cumplimiento de: ${nombre}.`, `Se debe incluir en el informe la evidencia de cumplimiento de: ${nombre}, ${cierre}`]
      : [`No se evidencia dentro del Informe Semestral: ${nombre}. Este soporte es necesario para validar la implementación de las medidas establecidas en el PMA.`, `Se debe incluir en el informe: ${nombre}, ${cierre}`];
    return { fila, generales };
  }

  /** Lee del propio informe los datos que encabezan la ficha, si los encuentra. */
  function datosDelInforme(textos) {
    // Algunos informes traen la portada como imagen: el periodo aparece más adelante.
    const unido = textos.slice(0, 8).join(' ').replace(/\s+/g, ' ');
    const rango = '(.{1,40}?\\d{4})\\s*[–-]\\s*(.{1,40}?\\d{4})';
    const periodo = ['Per[ií]odo del Informe:', 'Fase de construcci[oó]n:', 'periodo semestral:']
      .map((rotulo) => unido.match(new RegExp(`${rotulo}\\s*${rango}`, 'i')))
      .find(Boolean);
    // Semestrales: el proyecto va entre paréntesis; mensuales: entre comillas.
    const proyecto = unido.match(/\(([^()]{0,200}(?:DISEÑO|CONSTRUCCI[OÓ]N)[^()]{0,200})\)/)
      || unido.match(/[“"]([^“”"]{0,200}Construcci[oó]n[^“”"]{0,200})[”"]/i);
    const contratista = unido.match(/empresa\s+(.{4,80}?),?\s+es (?:adjudicada|la contratista)/i);
    // Mensuales: "Informe Mensual No. 34– enero 2026" da el comentario "Mensual ENERO-26".
    const mes = unido.match(/Informe Mensual No\.?\s*\d+\s*[–-]?\s*(\p{L}+)\s+\d{2}(\d{2})/iu);
    return {
      periodo: periodo ? `${periodo[1]} – ${periodo[2]}`.toUpperCase() : '',
      proyecto: proyecto ? proyecto[1].trim().slice(0, 300) : '',
      contratista: contratista ? contratista[1].trim() : '',
      mes: mes ? `${mes[1].toUpperCase()}-${mes[2]}` : '',
    };
  }

  return { sugerir, seccionDe, datosDelInforme, rangos, frases, tituloResumido, REGLAS };
})();

if (typeof module !== 'undefined') module.exports = Evidencia;
