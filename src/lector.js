'use strict';
/* global Recursos, IndiceAnexos */
/** Abre un PDF muy grande desde el disco sin cargarlo completo en memoria. */
const Lector = (() => {
  const MAX_LADO_LIENZO = 8192;
  const MAX_AREA_LIENZO = 32e6;
  // Hay escaneos reales de 134 Mpx. Por encima de este tope pdf.js omite la imagen sin avisar.
  const MAX_PIXELES_IMAGEN = 6e8;
  const ZOOM = { minimo: 0.5, maximo: 4, paso: 1.25 };

  let pdfjs = null;
  let ui = null;
  let avisos = null;
  let doc = null;
  let tareaCarga = null;
  let sesion = 0;
  let paginaActual = 1;
  let zoom = 1;
  let giro = 0;
  const usosMiniatura = new Map();
  let tareaRender = null;
  let tareaTexto = null;
  let colaRender = Promise.resolve();
  let errorDibujo = null;
  let estado = { etapa: 'inicial' };

  /** Entrega al worker los decodificadores desde memoria, sin ninguna petición. */
  class DatosEmbebidos {
    async fetch({ kind, filename }) {
      if (kind !== 'wasmUrl') throw new Error(`Recurso no incluido: ${filename}`);
      return Recursos.bytes(filename);
    }
  }

  async function cargarBiblioteca() {
    if (pdfjs) return;
    const modulo = await import(await Recursos.urlDeModulo('pdf'));
    modulo.GlobalWorkerOptions.workerSrc = await Recursos.urlDeModulo('worker');
    pdfjs = modulo;
  }

  function crearTransporte(archivo, alFallar) {
    class TransporteArchivo extends pdfjs.PDFDataRangeTransport {
      activo = true;

      requestDataRange(inicio, fin) {
        archivo.slice(inicio, fin).arrayBuffer()
          .then((b) => { if (this.activo) this.onDataRange(inicio, new Uint8Array(b)); })
          .catch((e) => { if (this.activo) alFallar(e); });
      }

      abort() {
        this.activo = false;
      }
    }
    return new TransporteArchivo(archivo.size, null);
  }

  function mensajeDeError(e) {
    const nombre = e && e.name;
    if (nombre === 'PasswordException') return 'El PDF está protegido con contraseña. Pide una copia sin protección.';
    if (nombre === 'InvalidPDFException') return 'El archivo está dañado o no es un PDF válido.';
    if (nombre === 'NotReadableError' || nombre === 'NotFoundError') {
      return 'El archivo cambió o ya no está disponible en el disco. Si está en OneDrive, márcalo para mantenerlo en este equipo.';
    }
    return `No se pudo leer el archivo: ${e && e.message ? e.message : e}`;
  }

  function fallar(e) {
    if (estado.etapa === 'error') return;
    estado.etapa = 'error';
    estado.error = String(e && e.message ? e.message : e);
    avisos.error(mensajeDeError(e));
  }

  function limpiarVista() {
    ui.total.textContent = '–';
    ui.pagina.value = '1';
    ui.lienzo.width = 0;
    ui.lienzo.height = 0;
    capaTexto().replaceChildren();
  }

  // Mejor pasar `capa` explícita; nextElementSibling queda como respaldo.
  const capaTexto = () => ui.capa || ui.lienzo.nextElementSibling;

  function cancelarTexto() {
    if (tareaTexto) tareaTexto.cancel();
    tareaTexto = null;
  }

  /** Capa de texto seleccionable sobre el lienzo. Nunca falla: sin ella el informe se ve igual. */
  async function dibujarTexto(pagina, rotation, escalaCss) {
    cancelarTexto();
    const capa = capaTexto();
    capa.replaceChildren();
    capa.style.setProperty('--total-scale-factor', String(escalaCss));
    capa.style.setProperty('--scale-round-x', '1px');
    capa.style.setProperty('--scale-round-y', '1px');
    const tarea = new pdfjs.TextLayer({
      textContentSource: pagina.streamTextContent(),
      container: capa,
      viewport: pagina.getViewport({ scale: escalaCss, rotation }),
    });
    tareaTexto = tarea;
    try {
      await tarea.render();
    } catch (e) {
      if (e.name !== 'AbortException') console.warn('No se pudo armar el texto seleccionable', e);
    } finally {
      if (tareaTexto === tarea) tareaTexto = null;
    }
  }

  async function dibujarPagina(documento, pedida) {
    const vigente = () => documento === doc && pedida === paginaActual;
    if (!vigente()) return;
    // Con el mosaico a la vista el visor está oculto y no tiene tamaño: no hay nada que dibujar.
    if (ui.visor.clientWidth === 0) return;
    const pagina = await documento.getPage(pedida);
    if (!vigente()) return;
    const rotation = (pagina.rotate + giro) % 360;
    const base = pagina.getViewport({ scale: 1, rotation });
    if (!(base.width > 0 && base.height > 0)) throw new Error('la página no tiene tamaño válido');
    // Con zoom 1 se ve la página completa, sin desplazarse.
    const ajuste = Math.min(ui.visor.clientWidth - 24, ((ui.visor.clientHeight - 16) * base.width) / base.height);
    const cssAncho = Math.max(240, ajuste) * zoom;
    const ppp = Math.min(window.devicePixelRatio || 1, 2);
    const escala = Math.min(
      (cssAncho / base.width) * ppp,
      MAX_LADO_LIENZO / base.width,
      MAX_LADO_LIENZO / base.height,
      Math.sqrt(MAX_AREA_LIENZO / (base.width * base.height)),
    );
    const vista = pagina.getViewport({ scale: escala, rotation });
    ui.lienzo.width = Math.floor(vista.width);
    ui.lienzo.height = Math.floor(vista.height);
    ui.lienzo.style.width = `${Math.floor(cssAncho)}px`;
    const tarea = pagina.render({ canvas: ui.lienzo, viewport: vista });
    tareaRender = tarea;
    const texto = dibujarTexto(pagina, rotation, cssAncho / base.width);
    try {
      await Promise.all([tarea.promise, texto]);
      errorDibujo = null;
      estado.ultimaDibujada = pedida;
    } catch (e) {
      if (e.name !== 'RenderingCancelledException') throw e;
    } finally {
      if (tareaRender === tarea) tareaRender = null;
      // La capa de texto sigue leyendo la página: se espera a que acabe antes de limpiarla.
      await texto;
      pagina.cleanup();
    }
  }

  async function irA(numero) {
    if (!doc) return;
    const entero = Math.trunc(Number(numero)) || 1;
    const nueva = Math.min(Math.max(1, entero), doc.numPages);
    if (nueva !== paginaActual) giro = 0;
    paginaActual = nueva;
    ui.pagina.value = String(paginaActual);
    const pedida = paginaActual;
    const documento = doc;
    if (tareaRender) tareaRender.cancel();
    cancelarTexto();
    colaRender = colaRender.catch(() => {}).then(() => dibujarPagina(documento, pedida)).catch((e) => {
      if (documento !== doc) return;
      errorDibujo = `No se pudo mostrar la página ${pedida}. El resto del informe sigue disponible.`;
      avisos.estado(errorDibujo);
      console.warn(errorDibujo, e);
    });
    await colaRender;
    ui.visor.scrollTop = 0;
  }

  async function leerTextos(actual, documento) {
    const textos = new Array(documento.numPages);
    estado.sinLeer = 0;
    for (let i = 1; i <= documento.numPages; i += 1) {
      if (actual !== sesion || estado.etapa === 'error') return null;
      try {
        const pagina = await documento.getPage(i);
        const contenido = await pagina.getTextContent();
        textos[i - 1] = IndiceAnexos.textoDePagina(contenido.items);
        pagina.cleanup();
      } catch (e) {
        // Una página dañada no debe tumbar la revisión del resto del informe.
        if (actual !== sesion || estado.etapa === 'error') return null;
        textos[i - 1] = '';
        estado.sinLeer += 1;
        console.warn(`No se pudo leer el texto de la página ${i}`, e);
      }
      if (i % 10 === 0 || i === documento.numPages) {
        avisos.progreso(i / documento.numPages, `Leyendo la página ${i} de ${documento.numPages}`);
      }
    }
    return textos;
  }

  async function cerrarDocumento() {
    const anterior = tareaCarga;
    tareaCarga = null;
    doc = null;
    if (tareaRender) tareaRender.cancel();
    tareaRender = null;
    cancelarTexto();
    if (anterior) {
      try {
        await anterior.destroy();
      } catch (e) {
        console.warn('No se pudo cerrar el informe anterior', e);
      }
    }
    await colaRender.catch(() => {});
  }

  async function abortar(e) {
    fallar(e);
    await cerrarDocumento();
    limpiarVista();
  }

  async function abrir(archivo) {
    sesion += 1;
    const actual = sesion;
    estado = { etapa: 'abriendo', archivoBytes: archivo.size };
    errorDibujo = null;
    zoom = 1;
    giro = 0;
    paginaActual = 1;
    avisos.progreso(0, 'Abriendo el informe');
    await cerrarDocumento();
    if (actual !== sesion) return;
    limpiarVista();

    try {
      if (archivo.size === 0) throw Object.assign(new Error('archivo vacío'), { name: 'InvalidPDFException' });
      await cargarBiblioteca();
      if (actual !== sesion) return;
      const t0 = performance.now();
      tareaCarga = pdfjs.getDocument({
        range: crearTransporte(archivo, (e) => { if (actual === sesion) abortar(e); }),
        rangeChunkSize: 1 << 18,
        disableAutoFetch: true,
        disableStream: true,
        enableXfa: false,
        isEvalSupported: false,
        maxImageSize: MAX_PIXELES_IMAGEN,
        verbosity: pdfjs.VerbosityLevel.ERRORS,
        BinaryDataFactory: DatosEmbebidos,
        useWorkerFetch: false,
        wasmUrl: new URL('wasm/', document.baseURI).href,
      });
      const documento = await tareaCarga.promise;
      if (actual !== sesion) return;
      doc = documento;
      ui.total.textContent = String(doc.numPages);
      ui.pagina.max = String(doc.numPages);
      Object.assign(estado, { etapa: 'leyendo', paginas: doc.numPages, msApertura: Math.round(performance.now() - t0) });
      await irA(1);
      if (actual !== sesion) return;

      const t1 = performance.now();
      const textos = await leerTextos(actual, documento);
      if (!textos || actual !== sesion) return;
      const anexos = IndiceAnexos.detectar(textos);
      const conTexto = textos.filter(IndiceAnexos.tieneCuerpo).length;
      Object.assign(estado, { etapa: 'listo', msTexto: Math.round(performance.now() - t1), conTexto, anexos });
      avisos.listo({ textos, anexos, conTexto, paginas: documento.numPages, avisoDibujo: errorDibujo, sinLeer: estado.sinLeer });
    } catch (e) {
      if (actual === sesion) await abortar(e);
    }
  }

  let sesionPrevia = 0;
  /** Dibuja un PDF ya generado (la ficha) dentro de un contenedor, página por página. */
  async function previsualizar(bytes, contenedor, anchoCss) {
    sesionPrevia += 1;
    const miSesion = sesionPrevia;
    await cargarBiblioteca();
    const tarea = pdfjs.getDocument({
      data: bytes,
      enableXfa: false,
      isEvalSupported: false,
      verbosity: pdfjs.VerbosityLevel.ERRORS,
      BinaryDataFactory: DatosEmbebidos,
      useWorkerFetch: false,
      wasmUrl: new URL('wasm/', document.baseURI).href,
    });
    try {
      const documento = await tarea.promise;
      if (miSesion !== sesionPrevia) return;
      const ppp = Math.min(window.devicePixelRatio || 1, 2);
      contenedor.replaceChildren();
      for (let n = 1; n <= documento.numPages && miSesion === sesionPrevia; n += 1) {
        const pagina = await documento.getPage(n);
        if (miSesion !== sesionPrevia) { pagina.cleanup(); break; }
        const vista = pagina.getViewport({ scale: (anchoCss * ppp) / pagina.getViewport({ scale: 1 }).width });
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.floor(vista.width);
        lienzo.height = Math.floor(vista.height);
        lienzo.style.width = `${Math.floor(anchoCss)}px`;
        lienzo.setAttribute('role', 'img');
        lienzo.setAttribute('aria-label', `Página ${n} de la ficha`);
        contenedor.append(lienzo);
        await pagina.render({ canvas: lienzo, viewport: vista }).promise;
        pagina.cleanup();
      }
    } finally {
      await tarea.destroy();
    }
  }

  function girar() {
    giro = (giro + 90) % 360;
    return irA(paginaActual);
  }

  /** Dibuja una página en un lienzo aparte. Resuelve true si llegó a dibujarse. */
  function miniatura(lienzo, numero, anchoPx, giroHoja = 0) {
    const documento = doc;
    let tarea = null;
    let cancelado = false;
    const promise = (async () => {
      if (!documento) return false;
      // Limpiar una página mientras otro dibujo la usa deja ese dibujo en blanco.
      usosMiniatura.set(numero, (usosMiniatura.get(numero) || 0) + 1);
      let pagina = null;
      try {
        pagina = await documento.getPage(numero);
        if (cancelado) return false;
        const rotation = (pagina.rotate + giroHoja) % 360;
        const base = pagina.getViewport({ scale: 1, rotation });
        if (!(base.width > 0 && base.height > 0)) return false;
        const escala = Math.min(anchoPx / base.width, MAX_LADO_LIENZO / base.height);
        const vista = pagina.getViewport({ scale: escala, rotation });
        lienzo.width = Math.floor(vista.width);
        lienzo.height = Math.floor(vista.height);
        tarea = pagina.render({ canvas: lienzo, viewport: vista });
        await tarea.promise;
        return !cancelado;
      } catch (e) {
        if (e.name === 'RenderingCancelledException') return false;
        throw e;
      } finally {
        const restantes = usosMiniatura.get(numero) - 1;
        if (restantes > 0) usosMiniatura.set(numero, restantes);
        else {
          usosMiniatura.delete(numero);
          if (pagina) pagina.cleanup();
        }
      }
    })();
    return { promise, cancelar() { cancelado = true; if (tarea) tarea.cancel(); } };
  }

  function cambiarZoom(accion) {
    if (accion === 'ajustar') zoom = 1;
    else if (accion === 'mas') zoom = Math.min(ZOOM.maximo, zoom * ZOOM.paso);
    else zoom = Math.max(ZOOM.minimo, zoom / ZOOM.paso);
    return irA(paginaActual);
  }

  function iniciar(elementos, callbacks) {
    ui = elementos;
    avisos = callbacks;
    let espera = 0;
    window.addEventListener('resize', () => {
      clearTimeout(espera);
      espera = setTimeout(() => { if (doc) irA(paginaActual); }, 200);
    });
  }

  return { iniciar, abrir, irA, girar, miniatura, previsualizar, cambiarZoom, pagina: () => paginaActual, estado: () => estado };
})();
