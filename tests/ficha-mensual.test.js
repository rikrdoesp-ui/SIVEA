'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');
const FichaMensual = require('../src/ficha-mensual.js');
const catalogo = require('../src/catalogo-mensual.json');

const ANCHO = 595.2;
const ALTO = 841.68;
const items = (s) => catalogo.secciones.find((x) => x.id === s).items.map((i) => i.id);

const base = () => ({
  contratista: 'Consorcio de prueba',
  fecha: '22/04/2026',
  proyecto: 'Proyecto de prueba',
  comentario: 'Mensual ENERO-26',
  frente: 'N/A',
  fisico: 'N/A',
  porcentajeC: '94',
  otros: '',
  evaluadoPor: 'Revisor - Oficial',
  aprobadoPor: 'Jefa - Supervisora',
  respuestas: {},
});

/** Genera el PDF registrando textos, líneas del guion y checks. */
function generarConRegistro(datos) {
  const reg = { textos: [], guiones: 0, checks: 0 };
  function Grabador(opciones) {
    const doc = new jsPDF(opciones);
    const texto = doc.text.bind(doc);
    const linea = doc.line.bind(doc);
    const lineas = doc.lines.bind(doc);
    doc.text = (t, x, y, ...r) => { reg.textos.push({ texto: String(t), x, y, pagina: doc.getNumberOfPages() }); return texto(t, x, y, ...r); };
    doc.line = (x1, y1, x2, y2, ...r) => { if (y1 === y2 && Math.abs(x2 - x1) === 5) reg.guiones += 1; return linea(x1, y1, x2, y2, ...r); };
    doc.lines = (...a) => { if (a[0].length === 2 && a[0][0][0] === 2.2) reg.checks += 1; return lineas(...a); }; // solo el trazo del check
    return doc;
  }
  return { doc: FichaMensual.generar(Grabador, catalogo, datos), ...reg, reg };
}

const unido = (textos) => textos.map((t) => t.texto).join(' ').replace(/\s+/g, ' ');
const dentroDeLaHoja = (textos) => textos.every((t) => t.y > 0 && t.y < ALTO && t.x > 0 && t.x < ANCHO);

test('sale en A4 vertical, con el encabezado y los textos de la lista', () => {
  const { doc, reg } = generarConRegistro(base());
  assert.equal(Math.round(doc.internal.pageSize.getWidth() * 10) / 10, ANCHO);
  assert.equal(Math.round(doc.internal.pageSize.getHeight() * 100) / 100, ALTO);
  const todo = unido(reg.textos);
  for (const t of ['PROCEDIMIENTO ESPECIFICO SOCIO AMBIENTAL', 'Lista de Verificación de la Gestión Ambiental Mensual Contratista', 'Código: R-PA03-20', 'Edición: 0', 'Vigencia: 2025',
    'Tipo de Verificación', 'Mensual ENERO-26', 'Puntos a verificar', 'Observaciones', 'Asistencia a reuniones de seguimiento con UCP.',
    'Porcentaje de cumplimiento ambiental mensual', 'Otros :', 'Evaluado por:', 'Aprobado por:', 'Revisor - Oficial']) {
    assert.ok(todo.includes(t), t);
  }
  assert.ok(dentroDeLaHoja(reg.textos));
});

test('con las respuestas de LVM-2026-01 muestra 5/0/1, 21/0/2 y 20%, 35%, 42%, 97%', () => {
  const datos = base();
  for (const id of [...items('A'), ...items('B')]) datos.respuestas[id] = { estado: 'si', obs: '' };
  for (const id of ['mA-06', 'mB-10', 'mB-22']) datos.respuestas[id] = { estado: 'na', obs: '' };
  const { doc, reg } = generarConRegistro(datos);
  const t = reg.textos.map((x) => x.texto);
  for (const esperado of ['20%', '35%', '42%', '97%', '94%', 'Cumplimiento A (ponderación a 20%)', 'Cumplimiento B (ponderación a 35%)', 'Cumplimiento C (ponderación a 45%)', 'Cumplimiento mensual']) {
    assert.ok(t.includes(esperado), esperado);
  }
  assert.ok(['5', '0', '1', '21', '2'].every((c) => t.includes(c)));
  assert.equal(doc.getNumberOfPages(), 2);
  // N/A lleva un guion; SI lleva un check (más el del "Tipo de verificación")
  assert.equal(reg.guiones, 3);
  assert.equal(reg.checks, 1 + 5 + 21);
  // Los textos de las marcas SI/NO/N/A de las filas no se escriben: solo hay dibujos
  assert.equal(t.filter((x) => x === 'SI').length, 1); // solo el título de la columna en A
});

test('NO lleva check en su columna y N/A, guion; sin respuesta no se dibuja nada', () => {
  const datos = base();
  datos.respuestas['mA-01'] = { estado: 'no', obs: '' };
  datos.respuestas['mA-02'] = { estado: 'na', obs: '' };
  const { reg } = generarConRegistro(datos);
  assert.equal(reg.checks, 2);
  assert.equal(reg.guiones, 1);
  assert.ok(reg.textos.some((t) => t.texto === '77%')); // A = 0/1 de 20, B completa (35) y C 42,3
});

test('las observaciones salen con la referencia, o con el texto editado a mano', () => {
  const datos = base();
  datos.respuestas['mA-01'] = { estado: 'si', obs: 'Vigente', refs: [{ titulo: 'Anexo 9.E Actas', pagina: '12' }] };
  datos.respuestas['mA-02'] = { estado: 'si', obs: 'Antes', refs: [{ titulo: 'Anexo 1', pagina: '9' }], texto: 'Texto corregido a mano' };
  const todo = unido(generarConRegistro(datos).reg.textos);
  assert.ok(todo.includes('Anexo 9.E Actas, pág. 12 - Vigente'));
  assert.ok(todo.includes('Texto corregido a mano'));
  assert.ok(!todo.includes('Anexo 1, pág. 9'));
});

test('una observación larga cabe completa y nada queda fuera de la hoja', () => {
  const datos = base();
  const largo = Array.from({ length: 400 }, (_, i) => `T${i}`).join(' ').slice(0, 1500).replace(/ \S*$/, '');
  for (const id of items('B')) datos.respuestas[id] = { estado: 'si', obs: largo };
  const { doc, reg } = generarConRegistro(datos);
  assert.ok(doc.getNumberOfPages() >= 3);
  assert.ok(dentroDeLaHoja(reg.textos));
  assert.ok(unido(reg.textos).includes(largo));
});

test('Otros con más de cinco renglones agrega renglones y no se recorta', () => {
  const datos = base();
  datos.otros = Array.from({ length: 300 }, (_, i) => `P${i}`).join(' ');
  const { reg } = generarConRegistro(datos);
  assert.ok(unido(reg.textos).includes(datos.otros));
  assert.ok(dentroDeLaHoja(reg.textos));
});

test('datos inválidos se rechazan en vez de recortarse', () => {
  const con = (cambios) => () => generarConRegistro({ ...base(), ...cambios });
  assert.throws(con({ porcentajeC: '150' }), /Porcentaje de cumplimiento \(C\)/);
  assert.throws(con({ porcentajeC: 'abc' }), /Porcentaje/);
  assert.throws(con({ contratista: 'Texto con 漢' }), /contratista: el PDF no admite estos caracteres: 漢/);
  assert.throws(con({ proyecto: 'x'.repeat(301) }), /proyecto: supera el límite/);
  assert.throws(con({ otros: 'x'.repeat(2001) }), /Otros: supera el límite/);
  assert.throws(con({ respuestas: { 'mA-01': { estado: 'si', obs: 'x '.repeat(751) } } }), /Observación de «A.1»: supera el límite/);
  assert.throws(() => FichaMensual.generar(jsPDF, catalogo, null), /datos: se esperaba/);
});

test('porcentaje vacío no escribe 0% en la fila C y valores de tipo inesperado se ignoran', () => {
  const datos = { ...base(), porcentajeC: '', proyecto: { toString() { throw new Error('no debe invocarse'); } } };
  datos.respuestas['mA-01'] = { estado: '<malicioso>', obs: 42 };
  const { reg } = generarConRegistro(datos);
  assert.ok(!reg.textos.some((t) => t.texto.includes('malicioso')));
  assert.equal(reg.checks, 1);
});

test('el comentario se propone con el mes de la fecha', () => {
  assert.equal(FichaMensual.comentarioDeFecha('22/04/2026'), 'Mensual ABRIL-26');
  assert.equal(FichaMensual.comentarioDeFecha('01/12/2027'), 'Mensual DICIEMBRE-27');
  assert.equal(FichaMensual.comentarioDeFecha('22/13/2026'), '');
  assert.equal(FichaMensual.comentarioDeFecha(''), '');
});
