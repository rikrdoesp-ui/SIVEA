'use strict';
/* global Lector */
/**
 * Muestra todas las hojas de un anexo en miniatura, con lupa al pasar el cursor.
 * Solo se dibujan las que están a la vista, para no agotar la memoria.
 */
const Mosaico = (() => {
  const SIMULTANEAS = 2;
  const ANCHO_PX = 720; // resolución suficiente para que la lupa deje leer la letra a mano

  let ui = null;
  let observador = null;
  let abierto = null;
  let activas = 0;
  let cola = [];

  const crear = (etiqueta, clase, texto) => {
    const el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
  };

  function cancelar(hoja) {
    if (hoja.trabajo) hoja.trabajo.cancelar();
    hoja.trabajo = null;
    cola = cola.filter((h) => h !== hoja);
  }

  function procesar() {
    while (activas < SIMULTANEAS && cola.length) {
      const hoja = cola.shift();
      const lienzo = document.createElement('canvas');
      const trabajo = Lector.miniatura(lienzo, hoja.pagina, ANCHO_PX, hoja.giro);
      hoja.trabajo = trabajo;
      activas += 1;
      trabajo.promise
        .then((dibujada) => {
          if (dibujada && hoja.trabajo === trabajo) hoja.marco.replaceChildren(lienzo);
        })
        .catch((e) => console.warn(`No se pudo mostrar la hoja ${hoja.pagina}`, e))
        .finally(() => {
          if (hoja.trabajo === trabajo) hoja.trabajo = null;
          activas -= 1;
          procesar();
        });
    }
  }

  function encolar(hoja) {
    if (!cola.includes(hoja)) cola.push(hoja);
    procesar();
  }

  function redibujar(hoja) {
    cancelar(hoja);
    hoja.marco.replaceChildren();
    if (hoja.visible) encolar(hoja);
  }

  function crearHoja(pagina, opciones) {
    const hoja = { pagina, giro: 0, visible: false, trabajo: null };
    const celda = crear('div', 'celda');
    hoja.marco = crear('button', 'marco');
    hoja.marco.type = 'button';
    hoja.marco.setAttribute('aria-label', `Abrir la página ${pagina}`);
    hoja.marco.addEventListener('click', () => opciones.alElegirPagina(pagina));
    hoja.marco.addEventListener('pointermove', (e) => {
      const lienzo = hoja.marco.firstChild;
      if (!lienzo) return;
      const r = hoja.marco.getBoundingClientRect();
      lienzo.style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    });
    const pie = crear('div', 'pie-celda');
    pie.append(crear('span', '', `Página ${pagina}`));
    const girar = crear('button', 'girar', 'Girar');
    girar.type = 'button';
    girar.setAttribute('aria-label', `Girar la página ${pagina}`);
    girar.addEventListener('click', () => {
      hoja.giro = (hoja.giro + 90) % 360;
      redibujar(hoja);
    });
    pie.append(girar);
    celda.append(hoja.marco, pie);
    celda.hojaDatos = hoja;
    return celda;
  }

  function alCruzar(entradas) {
    for (const entrada of entradas) {
      const hoja = entrada.target.hojaDatos;
      hoja.visible = entrada.isIntersecting;
      if (hoja.visible) {
        if (!hoja.marco.firstChild && !hoja.trabajo) encolar(hoja);
      } else {
        cancelar(hoja);
        hoja.marco.replaceChildren();
      }
    }
  }

  function pintarVerificado(activo) {
    ui.verificar.setAttribute('aria-pressed', String(activo));
    ui.verificar.textContent = activo ? 'Verificado' : 'Marcar como verificado';
  }

  function cerrar() {
    if (!abierto) return;
    observador.disconnect();
    cola = [];
    for (const celda of ui.rejilla.children) cancelar(celda.hojaDatos);
    ui.rejilla.replaceChildren();
    ui.mosaico.hidden = true;
    ui.visor.hidden = false;
    abierto = null;
  }

  /** opciones: { verificado, alVerificar(valor), alElegirPagina(pagina), enfocarPagina } */
  function abrir(anexo, opciones) {
    cerrar();
    abierto = { anexo, opciones, verificado: Boolean(opciones.verificado) };
    ui.titulo.textContent = `Anexo ${anexo.numero}: ${anexo.titulo}`;
    ui.detalle.textContent = `${anexo.hojas} hojas, ${anexo.escaneadas} escaneadas. Pasa el cursor sobre una hoja para ampliarla.`;
    pintarVerificado(abierto.verificado);
    ui.visor.hidden = true;
    ui.mosaico.hidden = false;
    observador = new IntersectionObserver(alCruzar, { root: ui.rejilla, rootMargin: '500px 0px' });
    let destino = null;
    for (let p = anexo.desde; p <= anexo.hasta; p += 1) {
      const celda = crearHoja(p, opciones);
      ui.rejilla.append(celda);
      observador.observe(celda);
      if (p === opciones.enfocarPagina) destino = celda;
    }
    ui.rejilla.scrollTop = 0;
    if (destino) destino.scrollIntoView({ block: 'center' });
  }

  function iniciar(elementos) {
    ui = elementos;
    ui.cerrar.addEventListener('click', cerrar);
    ui.girar.addEventListener('click', () => {
      for (const celda of ui.rejilla.children) {
        const hoja = celda.hojaDatos;
        hoja.giro = (hoja.giro + 90) % 360;
        redibujar(hoja);
      }
    });
    ui.verificar.addEventListener('click', () => {
      if (!abierto) return;
      abierto.verificado = !abierto.verificado;
      pintarVerificado(abierto.verificado);
      abierto.opciones.alVerificar(abierto.verificado);
    });
  }

  return { iniciar, abrir, cerrar };
})();
