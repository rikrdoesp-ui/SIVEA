'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Avance = require('../src/avance.js');

const ids = ['pma-01', 'anx-01'];

test('un avance válido se recupera completo', () => {
  const guardado = {
    datos: { periodo: '1 DE ABRIL – 30 DE SEPTIEMBRE', fecha: '01/10/2026' },
    respuestas: { 'pma-01': { estado: 'si', obs: 'ok', refs: [{ titulo: 'Anexo 1', pagina: '9' }] }, 'anx-01': { estado: 'na', obs: '', texto: 'A mano' } },
    observaciones: 'Gen', informeFinal: '', autollenado: true, verificados: { 3: true }, nombre: 'IS07.pdf', actualizado: 5,
  };
  const a = Avance.normalizar(guardado, ids);
  assert.deepEqual(a.respuestas['pma-01'], { estado: 'si', obs: 'ok', refs: [{ titulo: 'Anexo 1', pagina: '9' }] });
  assert.equal(a.respuestas['anx-01'].texto, 'A mano');
  assert.equal(a.datos.periodo, '1 DE ABRIL – 30 DE SEPTIEMBRE');
  assert.deepEqual(a.verificados, { 3: true });
  assert.equal(a.nombre, 'IS07.pdf');
});

test('un avance dañado no rompe la carga y solo deja lo válido', () => {
  assert.deepEqual(Avance.normalizar(null, ids), Avance.vacio());
  const a = Avance.normalizar({ respuestas: { 'pma-01': { estado: 'quizás', obs: 7, refs: 'x' }, ajeno: { estado: 'si' } }, verificados: { abc: true } }, ids);
  assert.deepEqual(a.respuestas['pma-01'], { estado: '', obs: '', refs: [] });
  assert.ok(!('ajeno' in a.respuestas));
  assert.deepEqual(a.verificados, {});
});

test('la referencia única de borradores antiguos se conserva', () => {
  const a = Avance.normalizar({ respuestas: { 'pma-01': { estado: 'si', obs: '', ref: { titulo: 'Anexo 2', pagina: '4' } } } }, ids);
  assert.deepEqual(a.respuestas['pma-01'].refs, [{ titulo: 'Anexo 2', pagina: '4' }]);
});

test('una copia solo se carga en su propia lista', () => {
  const ficha = { respuestas: { 'pma-01': { estado: 'no', obs: 'Falta' } } };
  assert.equal(Avance.desdeCopia({ app: 'semestrales', ficha }, Avance.PRIMERA_LISTA, ids).respuestas['pma-01'].estado, 'no');
  assert.throws(() => Avance.desdeCopia({ app: 'semestrales', ficha }, 'deia-166-2018', ids), /otra lista/);
  assert.throws(() => Avance.desdeCopia({ app: 'semestrales', lista: 'deia-166-2018', ficha }, Avance.PRIMERA_LISTA, ids), /otra lista/);
  assert.throws(() => Avance.desdeCopia({ app: 'otra' }, Avance.PRIMERA_LISTA, ids), /no es una copia/);
});

test('los campos de la lista mensual se conservan y se validan', () => {
  const idsM = ['mA-01', 'mB-01'];
  const a = Avance.normalizar({
    datos: { contratista: 'Consorcio X', comentario: 'Mensual ENERO-26', frente: 'N/A', fisico: 7, evaluadoPor: 'Ana - Oficial', aprobadoPor: 'Luis - Jefe' },
    respuestas: { 'mA-01': { estado: 'si' } }, porcentajeC: '94', otros: 'Nota',
  }, idsM);
  assert.equal(a.datos.comentario, 'Mensual ENERO-26');
  assert.equal(a.datos.fisico, ''); // no era texto
  assert.equal(a.datos.evaluadoPor, 'Ana - Oficial');
  assert.equal(a.datos.aprobadoPor, 'Luis - Jefe');
  assert.equal(a.porcentajeC, '94');
  assert.equal(a.otros, 'Nota');
  assert.equal(Avance.normalizar({ porcentajeC: 94.5 }, idsM).porcentajeC, '94.5');
  assert.equal(Avance.normalizar({ porcentajeC: '93,5' }, idsM).porcentajeC, '93.5');
  for (const malo of ['150', '-1', 'abc', {}, null, '']) assert.equal(Avance.normalizar({ porcentajeC: malo }, idsM).porcentajeC, '', String(malo));
  assert.equal(Avance.normalizar({ otros: 5 }, idsM).otros, '');
});

test('una copia mensual solo se carga en la lista mensual', () => {
  const ficha = { porcentajeC: '80' };
  assert.equal(Avance.desdeCopia({ app: 'semestrales', lista: Avance.LISTA_MENSUAL, ficha }, Avance.LISTA_MENSUAL, ids).porcentajeC, '80');
  assert.throws(() => Avance.desdeCopia({ app: 'semestrales', lista: Avance.LISTA_MENSUAL, ficha }, Avance.PRIMERA_LISTA, ids), /otra lista/);
});

test('se conserva el verificado de anexos mensuales con letra', () => {
  const a = Avance.normalizar({ verificados: { '9.B': true, '9.B.1': true, 13: true, '9.b': true, x: true } }, ids);
  assert.deepEqual(Object.keys(a.verificados).sort(), ['13', '9.B', '9.B.1']);
});

test('un estado en arreglo y un porcentaje hexadecimal o con exponente se descartan', () => {
  const a = Avance.normalizar({ respuestas: { 'pma-01': { estado: ['si'] } }, porcentajeC: '0x1F' }, ids);
  assert.equal(a.respuestas['pma-01'].estado, '');
  assert.equal(a.porcentajeC, '');
  assert.equal(Avance.normalizar({ porcentajeC: '1e1' }, ids).porcentajeC, '');
  // Copias viejas: valores diminutos escritos con exponente negativo.
  assert.equal(Avance.normalizar({ porcentajeC: '1e-7' }, ids).porcentajeC, '0.0000001');
  assert.equal(Avance.normalizar({ porcentajeC: 1e-7 }, ids).porcentajeC, '0.0000001');
  assert.equal(Avance.normalizar({ porcentajeC: 100 }, ids).porcentajeC, '100');
  assert.equal(Avance.normalizar({ porcentajeC: '100,1' }, ids).porcentajeC, '');
  assert.equal(Avance.normalizar({ porcentajeC: Infinity }, ids).porcentajeC, '');
  assert.equal(Avance.normalizar({ porcentajeC: '94,5' }, ids).porcentajeC, '94.5');
});

test('los topes y campos vienen de las fichas, sin copias propias', () => {
  assert.equal(Avance.MAX_LUGARES, require('../src/ficha.js').MAX_REFERENCIAS);
  for (const c of require('../src/ficha-mensual.js').CAMPOS) assert.ok([...Avance.CAMPOS, ...Avance.CAMPOS_MENSUALES].includes(c), c);
});
