'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Evidencia = require('../src/evidencia.js');
const catalogo = require('../src/catalogo.json');

const ids = catalogo.secciones.flatMap((s) => s.items.map((i) => i.id));
const anexo = (numero, titulo, pagina, noAplica = false) => ({ numero, titulo, pagina, noAplica });

test('calcula hojas y escaneadas de cada anexo sin contar la carátula', () => {
  const textos = ['cuerpo', 'carátula 1', 'con texto', 'x', 'carátula 2', 'x'];
  const r = Evidencia.rangos([anexo(1, 'A', 2), anexo(2, 'B', 5)], textos, (t) => t === 'con texto');
  assert.deepEqual(r.map((a) => [a.desde, a.hasta, a.hojas, a.escaneadas]), [[3, 4, 2, 1], [6, 6, 1, 1]]);
});

test('un anexo que solo tiene carátula no tiene hojas', () => {
  const r = Evidencia.rangos([anexo(1, 'A', 1), anexo(2, 'B', 2)], ['c1', 'c2'], () => true);
  assert.equal(r[0].hojas, 0);
  assert.equal(r[1].hojas, 0);
});

test('sin evidencia propone frases para Observaciones sin el paréntesis del requisito', () => {
  const f = Evidencia.frases('anx-03', 'Registro de mantenimiento (fechas estén dentro del periodo)', { anexos: [], paginas: [] }, '');
  assert.equal(f.generales.length, 2);
  assert.ok(f.generales[0].includes('Informe Semestral: Registro de mantenimiento.'));
  assert.ok(!f.generales.join().includes('fechas estén'));
});

test('con evidencia solo propone frases para la fila, salvo que se marque NO', () => {
  const ev = { anexos: [anexo(3, 'A', 5)], paginas: [] };
  assert.deepEqual(Evidencia.frases('anx-03', 'Registro', ev, 'si').generales, []);
  assert.equal(Evidencia.frases('anx-03', 'Registro', ev, 'no').generales.length, 2);
});

test('resume el título de un anexo sin las colas del periodo', () => {
  assert.equal(Evidencia.tituloResumido(anexo(13, 'Registro de inspección de Extintores para este periodo', 1)), 'Anexo 13: Registro de inspección de Extintores');
  assert.equal(Evidencia.tituloResumido(anexo(16, 'Certificados de Fumigación vigentes para este periodo', 1)), 'Anexo 16: Certificados de Fumigación');
  assert.equal(Evidencia.tituloResumido(anexo(30, 'Porcentaje de avance del Proyecto al finalizar este periodo', 1)), 'Anexo 30: Porcentaje de avance del Proyecto');
  assert.equal(Evidencia.tituloResumido(anexo(2, 'Informes de Resultados de los Monitoreos Ambientales de este periodo.', 1)), 'Anexo 2: Informes de Resultados de los Monitoreos Ambientales');
  assert.equal(Evidencia.tituloResumido(anexo(39, 'Implementación del Plan de Reforestación (NO APLICA PARA ESTE PERIODO)', 1)), 'Anexo 39: Implementación del Plan de Reforestación');
  assert.equal(Evidencia.tituloResumido(anexo(1, 'Vistas Fotográficas', 1)), 'Anexo 1: Vistas Fotográficas');
});

test('un título muy largo se corta entre palabras', () => {
  const t = Evidencia.tituloResumido(anexo(5, 'Resolución DRPM-IE-142-2023 que otorga el permiso para la remoción de 0.04 Ha de gramínea (Indemnización ecológica).', 1));
  assert.ok(t.length <= 69);
  assert.match(t, /^Anexo 5: Resolución DRPM-IE-142-2023 que otorga .*\S…$/);
});

test('una fila marcada SI nunca propone frases de ausencia', () => {
  assert.deepEqual(Evidencia.frases('anx-16', 'Monitoreos', { anexos: [], paginas: [] }, 'si').generales, []);
});

test('si el informe marca el anexo como no aplicable lo ofrece primero', () => {
  const ev = { anexos: [anexo(7, 'Poda NO APLICA', 5, true)], paginas: [] };
  assert.match(Evidencia.frases('anx-06', 'Permiso', ev, '').fila[0], /no aplica/);
});

test('encuentra el periodo aunque la portada sea una imagen', () => {
  const d = Evidencia.datosDelInforme(['', 'índice', 'más', 'tabla', 'Fase de construcción: 1 de abril de 2025 – 30 de septiembre de 2025 1. Introducción']);
  assert.equal(d.periodo, '1 DE ABRIL DE 2025 – 30 DE SEPTIEMBRE DE 2025');
});

test('los 63 requisitos tienen regla de búsqueda', () => {
  assert.deepEqual(ids.filter((id) => !Evidencia.REGLAS[id]), []);
});

test('la lista de químicos no se confunde con inspecciones ambientales', () => {
  const r = Evidencia.sugerir(['anx-05'], [], [anexo(31, 'Lista de Verificación de químicos', 10)]);
  assert.deepEqual(r['anx-05'].anexos, []);
});

test('el registro de fauna peligrosa no cuenta como residuos peligrosos', () => {
  const indice = [anexo(18, 'Registro de Fauna silvestre, doméstica y peligrosas', 5), anexo(26, 'Certificado de Recolección de Residuos (No Peligrosos y Peligrosos)', 9)];
  assert.deepEqual(Evidencia.sugerir(['anx-08'], [], indice)['anx-08'].anexos.map((a) => a.numero), [26]);
});

test('los programas se buscan en el cuerpo y no en anexos ni en el índice', () => {
  const textos = ['CUADRO DE CONTENIDO Programa de Calidad del Aire', 'Programa de calidad del aire y más', 'texto', 'Programa de calidad del aire en un anexo'];
  const r = Evidencia.sugerir(['pma-02'], textos, [anexo(1, 'Fotos', 3)]);
  assert.deepEqual(r['pma-02'].paginas, [2]);
});

test('el acápite 1 no coincide con el acápite 10', () => {
  const textos = ['Artículos, acápites acápite 10 otra medida', 'Artículos, acápites acápite 1 medida'];
  const r = Evidencia.sugerir(['res-01'], textos, []);
  assert.deepEqual(r['res-01'].paginas, [2]);
});

test('extrae periodo, proyecto y contratista del inicio del informe', () => {
  const d = Evidencia.datosDelInforme([
    '(DISEÑO Y CONSTRUCCIÓN DEL COLECTOR) Período del Informe: 1 DE ABRIL DE 2026– 30 DE SEPTIEMBRE DE 2026',
    'la empresa Consorcio BRD Matasnillo, es adjudicada para',
  ]);
  assert.equal(d.periodo, '1 DE ABRIL DE 2026 – 30 DE SEPTIEMBRE DE 2026');
  assert.equal(d.proyecto, 'DISEÑO Y CONSTRUCCIÓN DEL COLECTOR');
  assert.equal(d.contratista, 'Consorcio BRD Matasnillo');
});

test('lee proyecto, contratista y mes de un informe mensual', () => {
  const textos = ['“Diseño y Construcción del Colector Principal del Río Matasnillo” Informe Mensual No. 34– enero 2026 733 La empresa Consorcio BRD MATASNILLO, S.A., es la contratista del proyecto “Diseño y Construcción del Colector Principal del Río Matasnillo”'];
  const d = Evidencia.datosDelInforme(textos);
  assert.equal(d.mes, 'ENERO-26');
  assert.equal(d.contratista, 'Consorcio BRD MATASNILLO, S.A.');
  assert.equal(d.proyecto, 'Diseño y Construcción del Colector Principal del Río Matasnillo');
});

// Las filas pma166-/res166- esperan un informe de Arraiján para calibrarlas.
test('cada ítem de los tres catálogos tiene regla de evidencia, salvo las de la lista 166', () => {
  for (const nombre of ['catalogo', 'catalogo-166', 'catalogo-mensual']) {
    const cat = require(`../src/${nombre}.json`);
    const sinRegla = cat.secciones.flatMap((s) => s.items).map((i) => i.id).filter((id) => !Evidencia.REGLAS[id] && !/^(pma|res)166-/.test(id));
    assert.deepEqual(sinRegla, [], nombre);
  }
});

test('una fila sin regla se marca y no ofrece frases de ausencia', () => {
  const r = Evidencia.sugerir(['pma166-01', 'pma-01'], ['texto'], []);
  assert.equal(r['pma166-01'].sinRegla, true);
  assert.equal(r['pma-01'].sinRegla, false);
  assert.deepEqual(Evidencia.frases('pma166-01', 'Programa X', r['pma166-01'], 'no').generales, []);
  assert.deepEqual(Evidencia.frases('pma166-01', 'Programa X', r['pma166-01'], '').generales, []);
  assert.equal(Evidencia.frases('pma-01', 'Programa X', r['pma-01'], 'no').generales.length, 2);
});

test('cada página del cuerpo trae el título de su sección', () => {
  const textos = [
    'Introducción 9.3 AVANCES DE LA EJECUCIÓN DEL PLAN DE GESTIÓN AMBIENTAL A continuación se describe.',
    'Durante el periodo se realizaron capacitaciones. Cuadro 9.8: Capacitaciones realizadas durante el mes de enero 2026 Fecha Tema Asistentes',
    '9.3.2 AVANCE IMPLEMENTACION PLAN EDUCACION AMBIENTAL • PLAN DE EDUCACIÓN AMBIENTAL EN COLEGIOS Durante el periodo evaluado se continuaron las coordinaciones.',
    'texto sin títulos donde se menciona el plan de educación ambiental',
  ];
  const t = (p, re) => Evidencia.seccionDe(textos, p, re);
  assert.equal(t(3, /plan de educaci[oó]n ambiental/i), '9.3.2 AVANCE IMPLEMENTACION PLAN EDUCACION AMBIENTAL');
  assert.equal(t(2, /capacitaci/i), 'Cuadro 9.8: Capacitaciones realizadas durante el mes de enero 2026');
  assert.equal(t(4, /plan de educaci[oó]n ambiental/i), '9.3.2 AVANCE IMPLEMENTACION PLAN EDUCACION AMBIENTAL');
  assert.equal(t(1, /avances/i), '9.3 AVANCES DE LA EJECUCIÓN DEL PLAN DE GESTIÓN AMBIENTAL');
});
