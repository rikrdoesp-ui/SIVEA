'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detectar, tieneCuerpo, textoDePagina } = require('../src/indice.js');

const trozo = (str, x, y, width, hasEOL = false) => ({
  str, width, height: 10, hasEOL, transform: [10, 0, 0, 10, x, y],
});

test('no parte números ni palabras divididos en trozos contiguos', () => {
  const items = [trozo('Anexo No. 2', 0, 100, 50), trozo('5: Permisos', 50, 100, 50)];
  assert.equal(textoDePagina(items), 'Anexo No. 25: Permisos');
});

test('separa trozos con hueco visible o en otra línea', () => {
  assert.equal(textoDePagina([trozo('Celda', 0, 100, 20), trozo('Vecina', 40, 100, 20)]), 'Celda Vecina');
  assert.equal(textoDePagina([trozo('Arriba', 0, 100, 20), trozo('Abajo', 0, 80, 20)]), 'Arriba Abajo');
  assert.equal(textoDePagina([trozo('Fin', 0, 100, 20, true), trozo('Sigue', 20, 100, 20)]), 'Fin Sigue');
});

const pie = (n) => `I10-07 v.3 108-133-26-030-S702-v0 Página ${n} `;

test('une correctamente el texto rotado 90 grados', () => {
  const rotado = (str, y, width) => ({ str, width, height: 10, hasEOL: false, transform: [0, 10, -10, 0, 100, y] });
  assert.equal(textoDePagina([rotado('Anexo No. 2', 0, 50), rotado('5: Permisos', 50, 50)]), 'Anexo No. 25: Permisos');
});

test('ignora trozos incompletos sin interrumpir la lectura', () => {
  assert.equal(textoDePagina([{ str: 'sin posición' }, trozo('Válido', 0, 100, 20), { type: 'marca' }]), 'Válido');
});

test('una lista de anexos en una página corta no es una carátula', () => {
  assert.deepEqual(detectar(['Anexo No. 1: Planos Anexo No. 2: Fotos Anexo No. 3: Otros']), []);
});

test('un número repetido conserva solo su primera aparición', () => {
  const anexos = detectar([`${pie(1)}Anexo No. 4: Registro`, `${pie(2)}Anexo No. 4: Registro (continuación)`]);
  assert.deepEqual(anexos.map((a) => a.pagina), [1]);
});

test('acepta variantes habituales del encabezado', () => {
  const titulos = ['Anexo N° 5: Uno', 'Anexo Nº 6: Dos', 'Anexo 7: Tres', 'Anexo No. 8 - Cuatro'];
  assert.deepEqual(detectar(titulos).map((a) => a.numero), [5, 6, 7, 8]);
});

test('detecta carátulas con y sin espacio tras "No."', () => {
  const anexos = detectar([
    `${pie(1)}Anexo No. 1: Vistas Fotográficas`,
    `${pie(2)}Anexo No.17: Cartel Informativo`,
  ]);
  assert.deepEqual(anexos.map((a) => [a.numero, a.pagina]), [[1, 1], [17, 2]]);
  assert.equal(anexos[0].titulo, 'Vistas Fotográficas');
});

test('no confunde una cita a un anexo en una página con texto', () => {
  const cuerpo = `${pie(5)}Ver Anexo No. 30: Porcentaje de avance. ${'texto del informe '.repeat(40)}`;
  const inicioLargo = `Anexo No. 8: ${'texto del informe '.repeat(40)}`;
  assert.deepEqual(detectar([cuerpo, inicioLargo]), []);
});

test('marca los anexos que no aplican en el periodo', () => {
  const [a] = detectar([`${pie(9)}Anexo No. 39: Plan de Reforestación (NO APLICA PARA ESTE PERIODO)`]);
  assert.equal(a.noAplica, true);
});

test('una página con solo el pie cuenta como sin texto', () => {
  assert.equal(tieneCuerpo(pie(3)), false);
  assert.equal(tieneCuerpo(`${pie(3)}${'contenido '.repeat(40)}`), true);
});

test('reconoce carátulas mensuales "ANEXO 9.X" bajo el encabezado repetido', () => {
  const enc = '“Diseño y Construcción del Colector Principal del Río Matasnillo” Informe Mensual No. 34 – enero 2026 917 ';
  const textos = [
    `${enc}En el periodo se realizó la limpieza, ver ANEXO 9.B para los registros. ${'x '.repeat(200)}`,
    `${enc}9.9 ANEXOS ANEXO 9.A. REGISTRO FOTOGRÁFICO Registro Fotográfico ${'foto '.repeat(400)}`,
    `${enc}ANEXO 9.B. DISPOSICIÓN DE RESIDUOS Y RECICLAJE`,
    '“Diseño y Construcción…” Informe Mensual No.34 Enero 2026 918 ANEXO 9.B.1 RECOLECCIÓN DE RESIDUOS SÓLIDOS Y PELIGROSOS',
    `${enc}ANEXO 9.C PERMISOS AMBIENTALES ANEXO 9.C.1. PERMISOS DE INDEMNIZACIÓN`,
  ];
  const anexos = detectar(textos);
  assert.deepEqual(anexos.map((a) => [a.numero, a.pagina]), [['9.A', 2], ['9.B', 3], ['9.B.1', 4], ['9.C', 5]]);
  assert.equal(anexos[3].titulo, 'PERMISOS AMBIENTALES');
  assert.ok(anexos[0].titulo.length <= 91);
  assert.equal(tieneCuerpo(`${enc}POZO CI-4`), false);
});

test('carátula "9.9 ANEXOS ANEXO 9.A" sin número impreso, y una lista de anexos no cuenta como carátula', () => {
  const enc = '“Proyecto X Construcción” Informe Mensual No. 34– enero 2026 ';
  const anexos = detectar([
    `${enc}ANEXO 9.A: Actas ANEXO 9.B: Permisos ANEXO 9.C: Otros`,
    `${enc}9.9 ANEXOS ANEXO 9.A: Actas de reunión`,
  ]);
  assert.deepEqual(anexos.map((a) => [a.numero, a.pagina]), [['9.A', 2]]);
});
