'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');
const FichaSemestral = require('../src/ficha.js');
const catalogo = require('../src/catalogo.json');

const ALTO_PAGINA = 1008;
const primerId = catalogo.secciones[0].items[0].id;

const base = () => ({
  proyecto: 'Proyecto de prueba',
  contratista: 'Contratista de prueba',
  periodo: '1 DE ENERO – 30 DE JUNIO',
  revisadoPor: 'Revisor de prueba',
  fecha: '01/07/2026',
  observaciones: ['Observación de prueba.'],
  informeFinal: '',
  respuestas: {},
});

/** Genera la ficha registrando cada texto escrito, con su altura y su página. */
function generarConRegistro(datos, cat = catalogo) {
  const textos = [];
  function Grabador(opciones) {
    const doc = new jsPDF(opciones);
    const original = doc.text.bind(doc);
    doc.text = (texto, x, y, ...resto) => {
      textos.push({ texto: String(texto), y, pagina: doc.getNumberOfPages() });
      return original(texto, x, y, ...resto);
    };
    return doc;
  }
  return { doc: FichaSemestral.generar(Grabador, cat, datos), textos };
}

const unido = (textos) => textos.map((t) => t.texto).join(' ').replace(/\s+/g, ' ');
const todoDentroDeLaHoja = (textos) => textos.every((t) => t.y > 0 && t.y < ALTO_PAGINA);
const secuencia = (n) => Array.from({ length: n }, (_, i) => `T${i}`).join(' ');

test('el catálogo conserva las 63 filas de la lista oficial', () => {
  const total = catalogo.secciones.reduce((n, s) => n + s.items.length, 0);
  assert.equal(total, 63);
  const ids = catalogo.secciones.flatMap((s) => s.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('sale en una sola página de tamaño legal', () => {
  const { doc } = generarConRegistro(base());
  assert.equal(doc.getNumberOfPages(), 1);
  assert.equal(Math.round(doc.internal.pageSize.getWidth()), 612);
  assert.equal(Math.round(doc.internal.pageSize.getHeight()), 1008);
});

test('observaciones largas continúan en otra página con todo el texto y en orden', () => {
  const datos = base();
  const largo = secuencia(3000);
  datos.observaciones = [largo];
  const { doc, textos } = generarConRegistro(datos);
  assert.ok(doc.getNumberOfPages() >= 2);
  // La etiqueta se repite en cada página de continuación, entre los renglones.
  assert.ok(unido(textos.filter((t) => t.texto !== 'Observaciones')).includes(largo));
  assert.ok(todoDentroDeLaHoja(textos));
});

test('el recuadro de cierre salta de página cuando no cabe', () => {
  const datos = base();
  datos.observaciones = [secuencia(420)];
  const { doc, textos } = generarConRegistro(datos);
  // Se registran todos los intentos de maquetación; el último es el documento entregado.
  const etiqueta = textos.filter((t) => t.texto.startsWith('INFORME')).at(-1);
  assert.ok(etiqueta);
  assert.equal(etiqueta.pagina, doc.getNumberOfPages());
  assert.ok(todoDentroDeLaHoja(textos));
});

test('la observación más larga permitida en una fila cabe completa', () => {
  const datos = base();
  const largo = secuencia(5000).slice(0, 1500).replace(/ \S*$/, '');
  datos.respuestas[primerId] = { estado: 'si', obs: largo };
  const { textos } = generarConRegistro(datos);
  assert.ok(unido(textos).includes(largo));
  assert.ok(todoDentroDeLaHoja(textos));
});

test('una observación por encima del límite se rechaza en vez de recortarse', () => {
  const datos = base();
  datos.respuestas[primerId] = { estado: 'si', obs: 'x '.repeat(751) };
  assert.throws(() => generarConRegistro(datos), /F.4.1 Programa de Control de Ruidos.*supera el límite/);
});

test('caracteres que el PDF no puede escribir se rechazan indicando cuáles', () => {
  const datos = base();
  datos.observaciones = ['Texto con 漢 y 😀'];
  assert.throws(() => generarConRegistro(datos), /no admite estos caracteres: 漢 😀/);
});

test('los signos técnicos comunes se convierten y el español se conserva', () => {
  const datos = base();
  datos.observaciones = ['PM ≥ 10 y CO₂ ≤ 5, “señalización” – año'];
  const { textos } = generarConRegistro(datos);
  assert.ok(unido(textos).includes('PM >= 10 y CO2 <= 5, “señalización” – año'));
});

test('datos nulos dan un error claro', () => {
  assert.throws(() => generarConRegistro(null), /datos: se esperaba/);
});

test('N/A va en su propia columna y no en la observación', () => {
  const datos = base();
  datos.respuestas[primerId] = { estado: 'na', obs: '' };
  const { textos } = generarConRegistro(datos);
  // 3 encabezados de sección con columna N/A, más la marca de la fila
  assert.equal(textos.filter((t) => t.texto === 'N/A').length, 4);
  assert.equal(FichaSemestral.textoObservacion({ estado: 'na', obs: 'Sin tala' }), 'Sin tala');
  assert.equal(FichaSemestral.textoObservacion({ estado: 'na', obs: '' }), '');
  assert.equal(FichaSemestral.textoObservacion({ estado: 'si', obs: 'Anexo 30' }), 'Anexo 30');
});

test('la referencia con título y página sale en la observación solo cuando la fila es SI', () => {
  const ref = { titulo: 'Anexo 13: Registro de extintores', pagina: '667' };
  assert.equal(FichaSemestral.textoObservacion({ estado: 'si', obs: '', ref }), 'Anexo 13: Registro de extintores, pág. 667');
  assert.equal(FichaSemestral.textoObservacion({ estado: 'si', obs: 'Vigente', ref }), 'Anexo 13: Registro de extintores, pág. 667 - Vigente');
  assert.equal(FichaSemestral.textoObservacion({ estado: 'no', obs: 'Falta', ref }), 'Falta');
  assert.equal(FichaSemestral.textoObservacion({ estado: 'si', obs: '', ref: { titulo: '', pagina: '12' } }), 'pág. 12');
});

test('la referencia llega al PDF y una página que no es número se muestra tal cual', () => {
  const datos = base();
  const id = catalogo.secciones[0].items[0].id;
  datos.respuestas[id] = { estado: 'si', obs: '', ref: { titulo: 'Matriz del PMA', pagina: '<x>' } };
  const { textos } = generarConRegistro(datos);
  assert.ok(unido(textos).includes('Matriz del PMA'));
  assert.ok(unido(textos).includes('<x>'));
});

test('la fila más larga posible, con referencia, cabe completa', () => {
  const datos = base();
  const id = catalogo.secciones[0].items[0].id;
  const corto = secuencia(90).slice(0, 300).replace(/ \S*$/, '');
  datos.respuestas[id] = { estado: 'si', obs: secuencia(5000).slice(0, 1500).replace(/ \S*$/, ''), ref: { titulo: corto, pagina: '12345' } };
  const { textos } = generarConRegistro(datos);
  assert.ok(todoDentroDeLaHoja(textos));
});

test('con muchas referencias de dos líneas la ficha se compacta y sigue en una hoja', () => {
  const datos = base();
  for (const s of catalogo.secciones) {
    s.items.forEach((item, i) => {
      datos.respuestas[item.id] = s.id === 'anx' && i < 20
        ? { estado: 'si', obs: '', ref: { titulo: 'Anexo 13: Registro de inspección de Extintores', pagina: '665' } }
        : { estado: 'si', obs: '', ref: { titulo: 'Cuerpo del informe', pagina: '18' } };
    });
  }
  const { doc, textos } = generarConRegistro(datos);
  assert.equal(doc.getNumberOfPages(), 1);
  assert.ok(todoDentroDeLaHoja(textos));
});

test('si ni compactando cabe, usa varias hojas sin perder texto', () => {
  const datos = base();
  const largo = secuencia(3000);
  datos.observaciones = [largo];
  const { doc, textos } = generarConRegistro(datos);
  assert.ok(doc.getNumberOfPages() >= 2);
  assert.ok(unido(textos.filter((t) => t.texto !== 'Observaciones')).includes(largo));
});

test('admite varias páginas y varios lugares en la referencia', () => {
  const r = { estado: 'si', obs: '', refs: [{ titulo: 'Anexo 13', pagina: '665, 667' }, { titulo: 'Anexo 40', pagina: '1552-1554' }, { titulo: 'Cuerpo del informe', pagina: '18 y 20' }] };
  assert.equal(FichaSemestral.textoObservacion(r), 'Anexo 13, págs. 665, 667; Anexo 40, págs. 1552-1554; Cuerpo del informe, págs. 18, 20');
  assert.equal(FichaSemestral.textoObservacion({ estado: 'si', obs: '', refs: [{ titulo: 'Anexo 1', pagina: '9' }] }), 'Anexo 1, pág. 9');
});

test('el texto editado a mano reemplaza la referencia armada y llega al PDF', () => {
  const r = { estado: 'si', obs: 'Antes', refs: [{ titulo: 'Anexo 1', pagina: '9' }], texto: 'Texto corregido a mano' };
  assert.equal(FichaSemestral.textoObservacion(r), 'Texto corregido a mano');
  const datos = base();
  datos.respuestas[catalogo.secciones[0].items[0].id] = r;
  const { textos } = generarConRegistro(datos);
  assert.ok(unido(textos).includes('Texto corregido a mano'));
  assert.ok(!unido(textos).includes('Anexo 1, pág. 9'));
});

test('valores de tipo inesperado se ignoran', () => {
  const datos = base();
  datos.proyecto = { toString() { throw new Error('no debe invocarse'); } };
  datos.observaciones = 0;
  datos.respuestas[primerId] = { estado: '<malicioso>', obs: 42 };
  const { doc, textos } = generarConRegistro(datos);
  assert.equal(doc.getNumberOfPages(), 1);
  assert.ok(!textos.some((t) => t.texto.includes('malicioso') || t.texto === '42'));
});

test('la lista de Arraiján - La Chorrera genera su ficha y repite los títulos de columnas en la hoja 2', () => {
  const catalogo166 = require('../src/catalogo-166.json');
  const filas = catalogo166.secciones.flatMap((s) => s.items);
  assert.equal(filas.length, 95);
  assert.equal(new Set(filas.map((i) => i.id)).size, 95);
  const datos = base();
  datos.respuestas['res166-10'] = { estado: 'na', obs: '' };
  const { doc, textos } = generarConRegistro(datos, catalogo166);
  const todo = unido(textos);
  assert.ok(todo.includes('DEIA-IA-166-2018'));
  assert.ok(todo.includes('art.4 (i)'));
  assert.ok(todoDentroDeLaHoja(textos));
  assert.equal(doc.getNumberOfPages(), 2);
  // Último intento de maquetación: la hoja 2 abre con los títulos de la sección en curso.
  const segunda = textos.filter((t) => t.pagina === 2);
  const primeraDeLaHoja2 = segunda.findIndex((t) => t.texto === 'OBSERVACION');
  assert.ok(primeraDeLaHoja2 >= 0);
  assert.ok(segunda.slice(0, primeraDeLaHoja2).every((t) => t.texto !== 'art.4 (z)'));
});

test('los rangos de páginas aceptan guion largo, medio y " a "', () => {
  const { textoPaginas } = FichaSemestral;
  assert.equal(textoPaginas('25 a 30'), 'págs. 25-30');
  assert.equal(textoPaginas('667–670'), 'págs. 667-670');
  assert.equal(textoPaginas('10—12, 40'), 'págs. 10-12, 40');
  assert.equal(textoPaginas('12'), 'pág. 12');
  assert.equal(textoPaginas(''), '');
  // Lo que no es número no desaparece.
  assert.equal(textoPaginas('anexo B'), 'anexo B');
});

test('si una fila no cabe en la página, el error dice cuál es', () => {
  const datos = base();
  const item = catalogo.secciones[0].items[0];
  const grande = { ...catalogo, secciones: [{ ...catalogo.secciones[0], items: [{ ...item, texto: 'palabra '.repeat(6000) }] }] };
  assert.throws(() => FichaSemestral.generar(jsPDF, grande, datos), /La fila «.*palabra palabra.*» de la ficha no cabe en una página/);
});
