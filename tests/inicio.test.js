'use strict';
// Lista de avances del inicio y fechas relativas.
const test = require('node:test');
const assert = require('node:assert/strict');
const Avance = require('../src/avance.js');

/** Un localStorage mínimo sobre un Map. */
function almacen(datos) {
  const m = new Map(Object.entries(datos));
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => m.get(k) ?? null };
}
const guardado = (respuestas, extra = {}) => JSON.stringify({ respuestas, ...extra });

test('cada lista ve solo sus avances, aunque el prefijo se parezca', () => {
  const a = almacen({
    'semestrales.borrador:Uno.pdf:10': guardado({ x1: { estado: 'si' } }, { actualizado: 1 }),
    'semestrales.borrador.deia-166-2018:Dos.pdf:20': guardado({ y1: { estado: 'no' } }, { actualizado: 2 }),
    'otra.app:Tres.pdf:30': guardado({ x1: { estado: 'si' } }),
  });
  assert.deepEqual(Avance.listar(a, Avance.PRIMERA_LISTA, ['x1']).map((v) => v.nombre), ['Uno.pdf']);
  assert.deepEqual(Avance.listar(a, 'deia-166-2018', ['y1']).map((v) => v.nombre), ['Dos.pdf']);
});

test('ordena del más reciente al más antiguo y omite los vacíos y los dañados', () => {
  const a = almacen({
    'semestrales.borrador:Viejo.pdf:1': guardado({ x1: { estado: 'si' } }, { actualizado: 100 }),
    'semestrales.borrador:Nuevo.pdf:2': guardado({ x1: { estado: 'na' } }, { actualizado: 900 }),
    'semestrales.borrador:Vacio.pdf:3': guardado({}, { actualizado: 999 }),
    'semestrales.borrador:Roto.pdf:4': '{no es json',
  });
  assert.deepEqual(Avance.listar(a, Avance.PRIMERA_LISTA, ['x1']).map((v) => v.nombre), ['Nuevo.pdf', 'Viejo.pdf']);
});

test('en la mensual el porcentaje de la sección C cuenta como una fila más', () => {
  const a = almacen({ 'semestrales.borrador.mensual-r-pa03-20:M.pdf:5': guardado({ m1: { estado: 'si' } }, { porcentajeC: '80' }) });
  const [m] = Avance.listar(a, Avance.LISTA_MENSUAL, ['m1', 'm2']);
  assert.equal(m.hechas, 2);
  assert.equal(m.total, 3);
});

test('sin almacenamiento devuelve una lista vacía', () => {
  const roto = { get length() { throw new Error('bloqueado'); } };
  assert.deepEqual(Avance.listar(roto, Avance.PRIMERA_LISTA, ['x1']), []);
});

test('fechas relativas en sus cortes', () => {
  const ahora = Date.UTC(2026, 10, 27, 12);
  const hace = (min) => ahora - min * 60000;
  assert.equal(Avance.cuando(0, ahora), 'sin fecha');
  assert.equal(Avance.cuando(hace(5), ahora), 'hace 5 minutos');
  assert.equal(Avance.cuando(ahora + 60000, ahora), 'hace 1 minuto'); // reloj adelantado
  assert.equal(Avance.cuando(hace(60), ahora), 'hace 1 hora');
  assert.equal(Avance.cuando(hace(1440), ahora), 'ayer');
  assert.equal(Avance.cuando(hace(3 * 1440), ahora), 'hace 3 días');
  assert.match(Avance.cuando(hace(40 * 1440), ahora), /2026/);
});
