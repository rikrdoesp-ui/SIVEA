'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Puntaje = require('../src/puntaje.js');
const catalogo = require('../src/catalogo-mensual.json');

const ids = (seccion) => catalogo.secciones.find((s) => s.id === seccion).items.map((i) => i.id);
const marcar = (lista, estado) => Object.fromEntries(lista.map((id) => [id, { estado }]));

test('el catálogo mensual tiene 6 + 23 filas y la sección numérica', () => {
  assert.equal(ids('A').length, 6);
  assert.equal(ids('B').length, 23);
  assert.deepEqual(ids('C'), ['mC-01']);
  assert.deepEqual(catalogo.secciones.map((s) => s.peso), [20, 35, 45]);
  const todos = catalogo.secciones.flatMap((s) => s.items.map((i) => i.id));
  assert.equal(new Set(todos).size, todos.length);
});

test('con las respuestas de LVM-2026-01 da 20%, 35%, 42% y 97%', () => {
  const respuestas = { ...marcar(ids('A'), 'si'), ...marcar(ids('B'), 'si'), 'mA-06': { estado: 'na' }, 'mB-10': { estado: 'na' }, 'mB-22': { estado: 'na' } };
  const { secciones, total } = Puntaje.calcular(catalogo, respuestas, '94');
  assert.deepEqual([secciones.A.si, secciones.A.no, secciones.A.na], [5, 0, 1]);
  assert.deepEqual([secciones.B.si, secciones.B.no, secciones.B.na], [21, 0, 2]);
  assert.deepEqual([secciones.A, secciones.B, secciones.C].map((s) => Puntaje.entero(s.puntos)), [20, 35, 42]);
  assert.equal(Puntaje.entero(total), 97);
});

test('un NO baja la sección: 1 NO entre 6 filas de A da 5/6 de 20', () => {
  const respuestas = { ...marcar(ids('A'), 'si'), 'mA-03': { estado: 'no' } };
  const { secciones } = Puntaje.calcular(catalogo, respuestas, '');
  assert.equal(secciones.A.no, 1);
  assert.ok(Math.abs(secciones.A.puntos - (5 / 6) * 20) < 1e-9);
  assert.equal(Puntaje.entero(secciones.A.puntos), 17);
});

test('todo N/A o sin responder vale el peso completo de la sección', () => {
  for (const respuestas of [{}, marcar(ids('A'), 'na'), undefined]) {
    const { secciones } = Puntaje.calcular(catalogo, respuestas, '');
    assert.equal(secciones.A.puntos, 20);
    assert.equal(secciones.B.puntos, 35);
  }
  // N/A no cuenta como cumplido ni como incumplido
  const { secciones } = Puntaje.calcular(catalogo, { ...marcar(ids('B'), 'na'), 'mB-01': { estado: 'no' } }, '');
  assert.equal(secciones.B.puntos, 0);
});

test('la sección C es porcentaje / 100 por 45 y un valor inválido o vacío aporta 0', () => {
  assert.equal(Puntaje.calcular(catalogo, {}, '100').secciones.C.puntos, 45);
  assert.equal(Puntaje.calcular(catalogo, {}, 50).secciones.C.puntos, 22.5);
  assert.equal(Puntaje.calcular(catalogo, {}, '93,5').secciones.C.puntos, 93.5 * 0.45);
  for (const malo of ['', '101', '-3', 'abc', null, undefined]) assert.equal(Puntaje.calcular(catalogo, {}, malo).secciones.C.puntos, 0, String(malo));
  assert.equal(Puntaje.calcular(catalogo, {}, '0').total, 55);
});

test('el redondeo es como el del Excel: mitades hacia arriba', () => {
  assert.equal(Puntaje.entero(42.5), 43);
  assert.equal(Puntaje.entero(42.3), 42);
  assert.equal(Puntaje.entero(97.3), 97);
  assert.equal(Puntaje.entero(2.4999999999999996), 3); // error de coma flotante de un 2,5
});

test('porcentaje acepta número, texto y coma decimal, y rechaza lo demás', () => {
  assert.equal(Puntaje.porcentaje('94'), 94);
  assert.equal(Puntaje.porcentaje(' 93,5 '), 93.5);
  assert.equal(Puntaje.porcentaje(0), 0);
  assert.equal(Puntaje.porcentaje('100.1'), null);
  assert.equal(Puntaje.porcentaje('1e2x'), null);
  assert.equal(Puntaje.porcentaje(''), null);
});

test('porcentaje en blanco o con formatos raros no vale 0 sino nada', () => {
  for (const v of [' ', [], '0x1F', '1e1', '-3']) assert.equal(Puntaje.porcentaje(v), null);
  assert.equal(Puntaje.porcentaje('94,5'), 94.5);
});
