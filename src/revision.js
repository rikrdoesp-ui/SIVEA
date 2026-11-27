'use strict';
/* global Avance, Recursos, Lector, Mosaico, Evidencia, FichaSemestral, FichaMensual, PuntajeMensual, LOGO_PROGRAMA, jspdf, IndiceAnexos */
(async () => {
  const $ = (id) => document.getElementById(id);
  const crear = (etiqueta, clase, texto) => {
    const el = document.createElement(etiqueta);
    if (clase) el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
  };

  // Cada lista de verificación es un catálogo; cambiar de lista recarga la página.
  const { CAMPOS, ESTADOS, MAX_LUGARES, PRIMERA_LISTA, LISTA_MENSUAL, vacio } = Avance;
  const FICHAS = { [PRIMERA_LISTA]: 'catalogo', 'deia-166-2018': 'catalogo-166', [LISTA_MENSUAL]: 'catalogo-mensual' };
  const CLAVE_FICHA = 'semestrales.ficha';
  let fichaElegida = PRIMERA_LISTA;
  try {
    const guardada = localStorage.getItem(CLAVE_FICHA);
    if (Object.hasOwn(FICHAS, guardada)) fichaElegida = guardada;
  } catch { /* sin almacenamiento: primera ficha */ }
  const catalogo = JSON.parse(await Recursos.texto(FICHAS[fichaElegida]));
  const PREFIJO = Avance.prefijoDe(fichaElegida);
  const mensual = fichaElegida === LISTA_MENSUAL;
  const requisitos = catalogo.secciones.flatMap((s) => s.items);
  // La sección numérica de la lista mensual (C) no se marca SI/NO/N/A: no cuenta como fila.
  const ids = catalogo.secciones.filter((s) => !s.numerico).flatMap((s) => s.items).map((r) => r.id);
  const TOTAL = ids.length + (mensual ? 1 : 0);
  const CLAVE_FIRMAS = 'semestrales.firmas';
  // Sin nombres en el código publicado: la primera vez se escriben y luego se recuerdan en el equipo.
  const FIRMAS_POR_DEFECTO = { evaluadoPor: '', aprobadoPor: '' };
  const CAMPOS_MENSUAL = FichaMensual.CAMPOS; // una sola lista: la que usa el PDF
  const totales = {};
  const normalizar = (guardado) => Avance.normalizar(guardado, ids);

  const porId = new Map(requisitos.map((r) => [r.id, r]));
  const CLAVE_FRASES = 'semestrales.frases';
  const MAX_FRASES = 40;
  const MAX_LARGO_FRASE = 300;
  let ficha = vacio();
  let clave = null;
  let nombreArchivo = '';
  let evidencias = null;
  let seleccionado = null;
  let paginasUltimaFicha = 0;
  let fichaPendiente = null;
  let avisoRecuperado = '';
  let anexosInforme = [];
  let ultimoAnexo = null;
  let ultimaHoja = null;
  const filas = new Map();

  /** Día/mes/año, como en la ficha oficial. */
  function fechaDeHoy() {
    const hoy = new Date();
    const dos = (n) => String(n).padStart(2, '0');
    return `${dos(hoy.getDate())}/${dos(hoy.getMonth() + 1)}/${hoy.getFullYear()}`;
  }

  /** El selector usa año-mes-día; la ficha, día/mes/año. */
  function fechaParaSelector(fecha) {
    const f = FichaMensual.partesDeFecha(fecha);
    const dos = (n) => String(n).padStart(2, '0');
    return f ? `${f.anio}-${dos(f.mes)}-${dos(f.dia)}` : '';
  }

  function fechaDeSelector(valor) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  // --- Guardado local por informe ---------------------------------------------------
  function guardar() {
    if (!clave) return;
    ficha.nombre = nombreArchivo;
    ficha.actualizado = Date.now();
    try {
      localStorage.setItem(clave, JSON.stringify(ficha));
    } catch {
      avisar('No se pudieron guardar las respuestas en este equipo. Genera la ficha antes de cerrar esta página.', true);
    }
  }

  function recuperar() {
    try {
      return normalizar(JSON.parse(localStorage.getItem(clave)));
    } catch {
      return vacio();
    }
  }

  const contarHechas = (f) => Avance.contarHechas(f, ids, mensual);

  /** Los avances de la lista abierta guardados en este navegador. */
  function avancesGuardados() {
    try { return Avance.listar(localStorage, fichaElegida, ids); } catch { return []; }
  }

  const ACCIONES_DE_AVANCE = ['generar', 'reiniciar', 'siguiente-pendiente', 'guardar-copia', 'cargar-copia'];

  /** Deja abierto el avance elegido en el inicio: se puede marcar, copiar o generar la ficha sin el PDF. */
  function abrirAvanceGuardado(llave) {
    const elegido = avancesGuardados().find((a) => a.llave === llave);
    if (!elegido) return;
    ficha = elegido.ficha;
    clave = elegido.llave;
    nombreArchivo = elegido.nombre;
    for (const boton of ACCIONES_DE_AVANCE) $(boton).disabled = false;
    bloquearHoja(false);
    ponerNombre(elegido.nombre);
    $('vacio-titulo').textContent = `Elige ${elegido.nombre} para ver la evidencia`;
    pintarFicha();
    avisar(`Seguimos con ${elegido.nombre}: ${elegido.hechas} de ${TOTAL} revisados. Puedes marcar ya; elige el mismo PDF para ver la evidencia.`);
  }

  // El título deja ver el nombre completo cuando la barra lo recorta.
  function ponerNombre(nombre) {
    $('nombre-informe').textContent = nombre;
    $('nombre-informe').title = nombre;
  }

  function guardarCopia() {
    const contenido = JSON.stringify({ app: 'semestrales', lista: fichaElegida, nombre: nombreArchivo, ficha });
    const url = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
    const enlace = crear('a');
    enlace.href = url;
    enlace.download = `Avance - ${nombreArchivo.replace(/\.pdf$/i, '')}.json`;
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    avisar('Copia guardada en tu carpeta de descargas.');
  }

  async function cargarCopia(archivo) {
    try {
      if (archivo.size > 2e6) throw new Error('archivo demasiado grande');
      const datos = JSON.parse(await archivo.text());
      const copia = Avance.desdeCopia(datos, fichaElegida, ids);
      if (contarHechas(ficha) && !window.confirm('Se reemplazarán las respuestas actuales de este informe por las de la copia. ¿Continuar?')) return;
      ficha = copia;
      guardar();
      pintarFicha();
      const aviso = datos.nombre && datos.nombre !== nombreArchivo ? ` Esa copia era de ${datos.nombre}.` : '';
      avisar(`Copia cargada: ${contarHechas(ficha)} de ${TOTAL} revisados.${aviso}`);
    } catch (e) {
      avisar(`No se pudo cargar la copia: ${e.message}.`, true);
    }
  }

  const respuesta = (id) => {
    if (!ficha.respuestas[id]) ficha.respuestas[id] = { estado: '', obs: '' };
    return ficha.respuestas[id];
  };

  // --- Ficha -------------------------------------------------------------------------
  function actualizarFila(id) {
    const { fila, botones, obs } = filas.get(id);
    const r = respuesta(id);
    for (const [e, boton] of Object.entries(botones)) boton.setAttribute('aria-pressed', String(r.estado === e));
    if (document.activeElement !== obs) obs.value = FichaSemestral.textoObservacion(r);
    if (id === seleccionado) $('detalle-manual').hidden = typeof r.texto !== 'string';
    fila.classList.toggle('respondida', Boolean(r.estado));
  }

  function actualizarAvance() {
    const hechas = contarHechas(ficha);
    $('avance').textContent = `${hechas} de ${TOTAL} revisados`;
    $('avance-barra').style.width = `${(hechas / TOTAL) * 100}%`;
    if (mensual) pintarTotales();
  }

  /** Lo escrito en la columna manda. Vaciarla borra también las referencias y la observación. */
  function editarColumna(id, valor) {
    const r = respuesta(id);
    if (valor.trim()) {
      r.texto = valor;
    } else {
      delete r.texto;
      r.obs = '';
      r.refs = [];
      if (id === seleccionado) pintarDetalle(id);
    }
    actualizarFila(id);
    guardar();
  }

  const nombreFila = (id) => porId.get(id).codigo || porId.get(id).texto.slice(0, 60);

  function responder(id, estado) {
    const r = respuesta(id);
    r.estado = r.estado === estado ? '' : estado;
    actualizarFila(id);
    actualizarAvance();
    guardar();
    if (id === seleccionado) pintarDetalle(id);
    avisar(`${nombreFila(id)}: ${r.estado ? `marcado ${ESTADOS[r.estado]}` : 'sin marca'}`);
  }

  // --- Referencia de dónde se confirma un SI -----------------------------------------
  function lugares(id) {
    const r = respuesta(id);
    if (!r.refs || !r.refs.length) r.refs = [{ titulo: '', pagina: '' }];
    return r.refs;
  }

  const sumarPagina = (paginas, pagina) => {
    const presentes = paginas.split(/[\s,;]+/).filter(Boolean);
    return presentes.includes(pagina) ? paginas : [...presentes, pagina].join(', ');
  };

  // Sin informe ni avance abierto no se marca la ficha, pero se puede recorrer:
  // se bloquea su contenido y no la hoja, que es la que se desplaza.
  let hojaBloqueada = false;
  function bloquearHoja(bloquear) {
    hojaBloqueada = bloquear;
    const hoja = $('hoja');
    for (const hijo of hoja.children) hijo.inert = bloquear;
    if (bloquear) {
      hoja.tabIndex = 0;
      hoja.setAttribute('role', 'region');
      hoja.setAttribute('aria-label', 'Ficha, se activa al elegir el informe');
    } else {
      hoja.removeAttribute('tabindex');
      hoja.removeAttribute('role');
      hoja.removeAttribute('aria-label');
    }
  }

  /** Sin PDF abierto no hay página que tomar. */
  function hayInforme() {
    if (Lector.estado().etapa === 'listo') return true;
    avisar('Abre el informe para tomar la página.', true);
    return false;
  }

  function refrescarReferencia(id) {
    pintarReferencia(id);
    actualizarFila(id);
    guardar();
  }

  function campoReferencia(etiqueta, valor, alCambiar, opciones = {}) {
    const caja = crear('div');
    const entrada = crear('input');
    entrada.id = `ref-${etiqueta}-${opciones.indice}`;
    entrada.value = valor;
    entrada.maxLength = opciones.largo;
    if (opciones.ayuda) entrada.title = opciones.ayuda;
    entrada.addEventListener('input', () => alCambiar(entrada.value));
    const rotulo = crear('label', '', opciones.rotulo);
    rotulo.htmlFor = entrada.id;
    caja.append(rotulo, entrada);
    return caja;
  }

  /** Al repintar el panel de detalle el control con foco se destruye: se devuelve el foco al equivalente. */
  function conservarFoco(pintar) {
    const detalle = $('detalle');
    const antes = document.activeElement;
    if (!detalle.contains(antes)) { pintar(); return; }
    const controles = () => [...detalle.querySelectorAll('button, input, textarea')];
    const indice = controles().indexOf(antes);
    pintar();
    if (antes.isConnected && !antes.disabled) return;
    const nuevo = controles()[indice];
    const destino = nuevo && !nuevo.disabled ? nuevo : $('detalle-obs');
    destino.focus({ preventScroll: true });
  }

  const pintarReferencia = (id) => conservarFoco(() => pintarReferenciaDe(id));
  const pintarFrases = (id) => conservarFoco(() => pintarFrasesDe(id));
  const pintarDetalle = (id) => conservarFoco(() => pintarDetalleDe(id));

  function pintarReferenciaDe(id) {
    const r = respuesta(id);
    $('detalle-referencia').hidden = r.estado !== 'si';
    const lista = $('ref-lista');
    lista.replaceChildren();
    if (r.estado !== 'si') return;
    lugares(id).forEach((lugar, indice) => {
      const fila = crear('div', 'campos-ref');
      const actualizar = (campo) => (valor) => { lugar[campo] = valor; delete r.texto; actualizarFila(id); guardar(); };
      fila.append(
        campoReferencia('titulo', lugar.titulo, actualizar('titulo'), { indice, rotulo: 'Título', largo: 300 }),
        campoReferencia('pagina', lugar.pagina, actualizar('pagina'), { indice, rotulo: 'Páginas', largo: 60, ayuda: 'Una o varias: 667, 702 o 667-670' }),
      );
      const actual = crear('button', 'pagina-actual', 'Página actual');
      actual.type = 'button';
      actual.addEventListener('click', () => {
        if (!hayInforme()) return;
        lugar.pagina = sumarPagina(lugar.pagina, String(Lector.pagina()));
        delete r.texto;
        refrescarReferencia(id);
        avisar(`Página ${Lector.pagina()} agregada a la referencia.`);
      });
      const quitar = crear('button', 'quitar', '×');
      quitar.type = 'button';
      quitar.setAttribute('aria-label', 'Quitar este lugar');
      quitar.addEventListener('click', () => {
        r.refs.splice(indice, 1);
        delete r.texto;
        refrescarReferencia(id);
      });
      fila.append(actual, quitar);
      lista.append(fila);
    });
    $('ref-agregar').disabled = lugares(id).length >= MAX_LUGARES;
  }

  /** Si el título ya está, suma la página; si no, ocupa un lugar vacío o agrega otro. */
  function usarReferencia(id, titulo, pagina) {
    delete respuesta(id).texto;
    const lista = lugares(id);
    const mismo = lista.find((l) => l.titulo === titulo);
    if (mismo) mismo.pagina = sumarPagina(mismo.pagina, pagina);
    else {
      const libre = lista.find((l) => !l.titulo && !l.pagina);
      if (libre) Object.assign(libre, { titulo, pagina });
      else if (lista.length < MAX_LUGARES) lista.push({ titulo, pagina });
      else { avisar(`Cada fila admite hasta ${MAX_LUGARES} lugares.`, true); return; }
    }
    refrescarReferencia(id);
    avisar(`Referencia agregada: ${titulo}, pág. ${pagina}.`);
  }

  // --- Frases para las observaciones -------------------------------------------------
  function frasesPropias() {
    try {
      const lista = JSON.parse(localStorage.getItem(CLAVE_FRASES));
      return Array.isArray(lista) ? lista.filter((f) => typeof f === 'string' && f.trim()).slice(0, MAX_FRASES) : [];
    } catch {
      return [];
    }
  }

  function guardarFrasesPropias(lista) {
    try {
      localStorage.setItem(CLAVE_FRASES, JSON.stringify(lista));
      return true;
    } catch {
      avisar('No se pudo guardar la frase en este equipo.', true);
      return false;
    }
  }

  /** La frase cuenta como puesta solo si está completa, no como parte de otro texto. */
  const tieneFrase = (texto, frase) => ` - ${texto.replace(/\n/g, ' - ')} - `.includes(` - ${frase} - `);

  function agregarAFila(id, frase) {
    const r = respuesta(id);
    if (typeof r.texto === 'string') { // la columna fue editada: la frase se suma a ese texto
      if (tieneFrase(r.texto, frase)) return;
      const editado = `${r.texto} - ${frase}`;
      if (editado.length > 2000) { avisar('La observación de esta fila ya está en su límite de 2000 caracteres.', true); return; }
      r.texto = editado;
      actualizarFila(id);
      guardar();
      pintarFrases(id);
      avisar('Frase agregada a la fila.');
      return;
    }
    if (tieneFrase(r.obs, frase)) return;
    const nuevo = r.obs ? `${r.obs} - ${frase}` : frase;
    if (nuevo.length > 1500) { avisar('La observación de esta fila ya está en su límite de 1500 caracteres.', true); return; }
    r.obs = nuevo;
    $('detalle-obs').value = r.obs;
    actualizarFila(id);
    guardar();
    pintarFrases(id);
    avisar('Frase agregada a la fila.');
  }

  function agregarAObservaciones(id, frase) {
    if (tieneFrase(ficha.observaciones, frase)) return;
    const nuevo = ficha.observaciones ? `${ficha.observaciones}\n${frase}` : frase;
    if (nuevo.length > 20000) { avisar('El recuadro de Observaciones ya está en su límite.', true); return; }
    ficha.observaciones = nuevo;
    $('observaciones').value = nuevo;
    guardar();
    pintarFrases(id);
    avisar('Frase agregada al recuadro de Observaciones, al final de la ficha.');
  }

  function botonFrase(texto, usada, alPulsar, clase = '') {
    const boton = crear('button', `frase ${clase}`, texto);
    boton.type = 'button';
    boton.disabled = usada;
    boton.addEventListener('click', alPulsar);
    return boton;
  }

  function pintarFrasesDe(id) {
    const caja = $('detalle-frases');
    caja.replaceChildren();
    const r = respuesta(id);
    const ev = evidencias && evidencias[id];
    if (!ev) return;
    const { fila, generales } = Evidencia.frases(id, porId.get(id).texto, ev, r.estado);
    if (generales.length && !mensual) { // esas frases hablan del informe semestral
      const grupo = crear('div', 'grupo-frases');
      grupo.append(crear('span', 'nota', 'Agregar a Observaciones:'));
      for (const f of generales) grupo.append(botonFrase(f, tieneFrase(ficha.observaciones, f), () => agregarAObservaciones(id, f), 'larga'));
      caja.append(grupo);
    }
    const grupoFila = crear('div', 'grupo-frases');
    grupoFila.append(crear('span', 'nota', 'Agregar a esta fila:'));
    const textoFila = typeof r.texto === 'string' ? r.texto : r.obs;
    for (const f of fila) grupoFila.append(botonFrase(f, tieneFrase(textoFila, f), () => agregarAFila(id, f)));
    caja.append(grupoFila);
    const propias = frasesPropias();
    if (propias.length) {
      const grupo = crear('div', 'grupo-frases');
      grupo.append(crear('span', 'nota', 'Mis frases:'));
      propias.forEach((f, i) => {
        grupo.append(botonFrase(f, tieneFrase(textoFila, f), () => agregarAFila(id, f)));
        const quitar = crear('button', 'quitar', '×');
        quitar.type = 'button';
        quitar.setAttribute('aria-label', `Quitar la frase: ${f}`);
        quitar.addEventListener('click', () => {
          guardarFrasesPropias(propias.filter((_, j) => j !== i));
          pintarFrases(id);
        });
        grupo.append(quitar);
      });
      caja.append(grupo);
    }
  }

  function guardarFrase() {
    const texto = $('detalle-obs').value.trim();
    if (!texto) { avisar('Escribe primero la observación que quieres guardar.', true); return; }
    if (texto.length > MAX_LARGO_FRASE) { avisar(`Las frases guardadas admiten hasta ${MAX_LARGO_FRASE} caracteres.`, true); return; }
    const propias = frasesPropias();
    if (propias.length >= MAX_FRASES) { avisar(`Ya tienes ${MAX_FRASES} frases. Quita alguna para guardar otra.`, true); return; }
    if (!propias.includes(texto) && !guardarFrasesPropias([...propias, texto])) return;
    if (seleccionado) pintarFrases(seleccionado);
    avisar('Frase guardada. Aparece en "Mis frases" en todas las filas.');
  }

  // --- Hojas de los anexos -----------------------------------------------------------
  function avisarVerificacion(sinLeer = 0) {
    const pendientes = anexosInforme.filter((a) => a.escaneadas > 0 && !a.noAplica && !ficha.verificados[a.numero]).length;
    const recuperado = avisoRecuperado;
    avisoRecuperado = '';
    const base = recuperado + (pendientes
      ? `Quedan ${pendientes} anexos con hojas escaneadas por verificar. Ábrelos con "Ver hojas" en cada fila.`
      : 'Todos los anexos con hojas escaneadas están verificados.');
    avisar(sinLeer ? `${base} ${sinLeer} páginas no se pudieron leer.` : base);
  }


  function abrirHojas(anexo, enfocarPagina) {
    ultimoAnexo = anexo;
    $('volver-mosaico').hidden = true;
    Mosaico.abrir(anexo, {
      verificado: ficha.verificados[anexo.numero],
      enfocarPagina,
      alVerificar(valor) {
        if (valor) ficha.verificados[anexo.numero] = true;
        else delete ficha.verificados[anexo.numero];
        guardar();
        avisarVerificacion();
        if (seleccionado) pintarDetalle(seleccionado);
      },
      alElegirPagina(pagina) {
        Mosaico.cerrar();
        ultimaHoja = pagina;
        $('volver-mosaico').hidden = false;
        Lector.irA(pagina);
      },
    });
  }

  function citar(id, anexo) {
    const r = respuesta(id);
    const cita = `Anexo ${anexo.numero}`;
    // "Anexo 9.B" no debe darse por citado cuando ya está "Anexo 9.B.1".
    if (new RegExp(`\\b${cita.replace(/\./g, '\\.')}(?!\\w|\\.\\w)`).test(r.obs)) return;
    const nuevo = r.obs ? `${r.obs} - ${cita}` : cita;
    if (nuevo.length > 1500) { avisar('La observación de esta fila ya está en su límite de 1500 caracteres.', true); return; }
    r.obs = nuevo;
    delete r.texto;
    $('detalle-obs').value = r.obs;
    actualizarFila(id);
    guardar();
    avisar(`${cita} citado en la observación.`);
  }

  function paginaInicial(ev) {
    if (!ev) return null;
    const anexo = ev.anexos.find((a) => !a.noAplica) || ev.anexos[0];
    return anexo ? anexo.pagina : ev.paginas[0] || null;
  }

  function pintarDetalleDe(id) {
    const ev = evidencias && evidencias[id];
    const lista = $('detalle-evidencia');
    lista.replaceChildren();
    $('detalle-obs').value = respuesta(id).obs;
    pintarFrases(id);
    pintarReferencia(id);
    $('detalle-manual').hidden = typeof respuesta(id).texto !== 'string';
    const esSi = respuesta(id).estado === 'si';
    if (!ev) {
      lista.append(crear('p', 'nota', 'Elige el informe para ver dónde está la evidencia.'));
      return;
    }
    for (const a of ev.anexos) {
      const linea = crear('div', a.noAplica ? 'evidencia no-aplica' : 'evidencia');
      const ir = crear('button', 'ir', `Anexo ${a.numero}: ${a.titulo}`);
      ir.type = 'button';
      ir.addEventListener('click', () => Lector.irA(a.pagina));
      const cita = crear('button', 'citar', esSi ? 'Usar' : 'Citar');
      cita.type = 'button';
      cita.setAttribute('aria-label', esSi ? `Usar el anexo ${a.numero} como referencia` : `Citar anexo ${a.numero} en la observación`);
      cita.addEventListener('click', () => {
        if (esSi) usarReferencia(id, Evidencia.tituloResumido(a), String(a.pagina));
        else citar(id, a);
      });
      linea.append(ir, crear('span', 'pag', ficha.verificados[a.numero] ? `pág. ${a.pagina}, verificado` : `pág. ${a.pagina}`));
      if (a.hojas > 0) {
        const hojas = crear('button', 'citar', `Ver hojas (${a.hojas})`);
        hojas.type = 'button';
        hojas.addEventListener('click', () => abrirHojas(a));
        linea.append(hojas);
      } else {
        linea.append(crear('span'));
      }
      linea.append(cita);
      lista.append(linea);
    }
    // Páginas del cuerpo con el título de su sección: se citan igual que un anexo.
    for (const { pagina: p, titulo } of ev.secciones) {
      const linea = crear('div', 'evidencia');
      const ir = crear('button', 'ir', titulo);
      ir.type = 'button';
      ir.addEventListener('click', () => Lector.irA(p));
      const cita = crear('button', 'citar', esSi ? 'Usar' : 'Citar');
      cita.type = 'button';
      cita.setAttribute('aria-label', esSi ? `Usar ${titulo}, página ${p}, como referencia` : `Citar ${titulo}, página ${p}, en la observación`);
      cita.addEventListener('click', () => {
        if (esSi) usarReferencia(id, titulo, String(p));
        else agregarAFila(id, `${titulo}, pág. ${p}`);
      });
      linea.append(ir, crear('span', 'pag', `pág. ${p}`), crear('span'), cita);
      lista.append(linea);
    }
    if (ev.paginas.length && esSi) {
      const linea = crear('div', 'paginas');
      const usar = crear('button', 'citar', 'Usar la página que estoy viendo');
      usar.type = 'button';
      usar.addEventListener('click', () => { if (hayInforme()) usarReferencia(id, 'Cuerpo del informe', String(Lector.pagina())); });
      linea.append(usar);
      lista.append(linea);
    }
    if (ev.sinRegla) {
      lista.append(crear('p', 'nota', 'Esta fila no tiene búsqueda automática: revísala en el informe.'));
    } else if (!ev.anexos.length && !ev.paginas.length) {
      lista.append(crear('p', 'nota', 'No se encontró en el texto del informe ni en los títulos de sus anexos. Si puede estar en una hoja escaneada, ábrela desde "Ir a un anexo".'));
    }
  }

  function seleccionar(id, opciones = {}) {
    if (seleccionado !== id) {
      Mosaico.cerrar();
      $('volver-mosaico').hidden = true;
    }
    if (seleccionado) filas.get(seleccionado).fila.classList.remove('activa');
    seleccionado = id;
    const { fila } = filas.get(id);
    fila.classList.add('activa');
    fila.after($('detalle'));
    $('detalle').hidden = false;
    pintarDetalle(id);
    // Primero el panel y luego la fila: quedan visibles los dos, también al final de la hoja.
    $('detalle').scrollIntoView({ block: 'nearest' });
    fila.scrollIntoView({ block: 'nearest' });
    const pagina = paginaInicial(evidencias && evidencias[id]);
    if (pagina && !opciones.sinSaltar) Lector.irA(pagina);
    if (opciones.enfocar) fila.querySelector('.requisito').focus({ preventScroll: true });
  }

  function moverSeleccion(delta) {
    const i = seleccionado ? ids.indexOf(seleccionado) : -1;
    const siguiente = ids[Math.min(ids.length - 1, Math.max(0, i + delta))];
    seleccionar(siguiente, { enfocar: true });
  }

  function construirFicha() {
    const contenedor = $('secciones');
    for (const seccion of catalogo.secciones) {
      // Cada sección es su propio bloque: así su encabezado fijo no se acumula con el anterior.
      const bloque = crear('div');
      contenedor.append(bloque);
      if (seccion.columnas || mensual) {
        const cabecera = crear('div', 'fila cabecera');
        const titulo = crear('div', 'titulo-seccion', seccion.titulo);
        titulo.setAttribute('role', 'heading');
        titulo.setAttribute('aria-level', '2');
        cabecera.append(titulo);
        for (const t of ['SI', 'NO', 'N/A']) cabecera.append(crear('div', 'col', seccion.numerico ? '' : t));
        cabecera.append(crear('div', 'col-obs', seccion.numerico ? '' : 'OBSERVACION'));
        bloque.append(cabecera);
      }
      if (seccion.numerico) {
        bloque.append(filaPorcentaje(seccion.items[0]));
        bloque.append(filaTotal(seccion.id));
        continue;
      }
      for (const item of seccion.items) {
        const fila = crear('div', seccion.columnas || mensual ? 'fila' : 'fila resaltada');
        const texto = crear('button', 'requisito');
        texto.type = 'button';
        if (seccion.conCodigo) texto.append(crear('span', 'codigo', item.codigo));
        texto.append(crear('span', 'texto', item.texto));
        texto.addEventListener('click', () => seleccionar(item.id));
        fila.append(texto);
        const botones = {};
        for (const [estado, etiqueta] of Object.entries(ESTADOS)) {
          const boton = crear('button', `marca ${estado}`, etiqueta);
          boton.type = 'button';
          boton.setAttribute('aria-pressed', 'false');
          boton.setAttribute('aria-label', `${etiqueta}: ${item.texto}`);
          boton.addEventListener('click', () => { if (seleccionado !== item.id) seleccionar(item.id); responder(item.id, estado); });
          botones[estado] = boton;
          fila.append(boton);
        }
        const obs = crear('textarea', 'obs');
        obs.rows = 1;
        obs.maxLength = 2000;
        obs.setAttribute('aria-label', `Observación: ${item.texto}`);
        obs.addEventListener('focus', () => { if (seleccionado !== item.id) seleccionar(item.id, { sinSaltar: true }); });
        obs.addEventListener('input', () => editarColumna(item.id, obs.value));
        obs.addEventListener('blur', () => actualizarFila(item.id));
        fila.append(obs);
        bloque.append(fila);
        filas.set(item.id, { fila, botones, obs });
      }
      if (mensual) bloque.append(filaTotal(seccion.id));
    }
    if (mensual) contenedor.append(filaTotal('total'));
  }

  // --- Lista mensual: puntaje ponderado ----------------------------------------------
  /** Fila de totales: conteos SI / NO / N/A y el puntaje ponderado, como en el Excel. */
  function filaTotal(id) {
    const fila = crear('div', 'fila total');
    const celdas = [crear('div', 'titulo-seccion', 'Total:'), crear('div', 'col'), crear('div', 'col'), crear('div', 'col'), crear('div', 'col-obs')];
    celdas.forEach((c) => fila.append(c));
    totales[id] = { si: celdas[1], no: celdas[2], na: celdas[3], rotulo: celdas[4] };
    return fila;
  }

  function filaPorcentaje(item) {
    const fila = crear('div', 'fila');
    const caja = crear('div', 'pct-c');
    const entrada = crear('input');
    entrada.id = 'm-porcentajeC';
    entrada.type = 'number';
    entrada.min = '0';
    entrada.max = '100';
    entrada.step = 'any';
    entrada.setAttribute('aria-label', `${item.texto} (0 a 100)`);
    entrada.addEventListener('input', () => {
      const n = PuntajeMensual.porcentaje(entrada.value);
      const invalido = entrada.value !== '' && n === null;
      entrada.setAttribute('aria-invalid', String(invalido));
      // Sin notación exponencial (1e-7): la ficha y el puntaje esperan decimales.
      ficha.porcentajeC = n === null ? '' : PuntajeMensual.aTexto(n);
      if (invalido) avisar('El porcentaje debe ser un número de 0 a 100.', true);
      actualizarAvance();
      guardar();
    });
    caja.append(entrada, crear('span', '', '%'));
    fila.append(crear('div', 'texto-fijo', item.texto), caja, crear('div'));
    return fila;
  }

  function pintarTotales() {
    const { secciones, total } = PuntajeMensual.calcular(catalogo, ficha.respuestas, ficha.porcentajeC);
    for (const s of catalogo.secciones) {
      const c = secciones[s.id];
      const t = totales[s.id];
      if (!s.numerico) for (const e of ['si', 'no', 'na']) t[e].textContent = String(c[e]);
      t.rotulo.textContent = `${PuntajeMensual.entero(c.puntos)}%  Cumplimiento ${s.id} (ponderación a ${s.peso}%)`;
    }
    totales.total.rotulo.textContent = `${PuntajeMensual.entero(total)}%  Cumplimiento mensual`;
  }

  function firmasRecordadas() {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_FIRMAS)) || {};
      return Object.fromEntries(Object.entries(FIRMAS_POR_DEFECTO).map(([k, v]) => [k, typeof g[k] === 'string' && g[k].trim() ? g[k] : v]));
    } catch {
      return { ...FIRMAS_POR_DEFECTO };
    }
  }

  function recordarFirmas() {
    try {
      localStorage.setItem(CLAVE_FIRMAS, JSON.stringify({ evaluadoPor: ficha.datos.evaluadoPor, aprobadoPor: ficha.datos.aprobadoPor }));
    } catch { /* sin almacenamiento: se usan los valores por defecto */ }
  }

  /** Comentario "Mensual ENERO-26" desde el mes de la fecha, mientras esté vacío o sea el que se propuso antes. */
  function proponerComentario(fechaAnterior = '') {
    const actual = ficha.datos.comentario;
    if (actual && actual !== FichaMensual.comentarioDeFecha(fechaAnterior)) return;
    ficha.datos.comentario = FichaMensual.comentarioDeFecha(ficha.datos.fecha) || actual;
  }

  function pintarFicha() {
    for (const c of CAMPOS) $(`dato-${c}`).value = c === 'fecha' ? fechaParaSelector(ficha.datos.fecha) : ficha.datos[c] || '';
    $('observaciones').value = ficha.observaciones;
    $('informe-final').value = ficha.informeFinal;
    if (mensual) {
      for (const c of CAMPOS_MENSUAL) $(`m-${c}`).value = c === 'fecha' ? fechaParaSelector(ficha.datos.fecha) : ficha.datos[c] || '';
      $('m-otros').value = ficha.otros;
      $('m-porcentajeC').value = ficha.porcentajeC;
    }
    ids.forEach(actualizarFila);
    actualizarAvance();
    if (seleccionado) pintarDetalle(seleccionado);
  }

  // --- Informe -----------------------------------------------------------------------
  const avisar = (texto, error = false) => {
    $('estado').textContent = texto;
    $('estado').classList.toggle('error', error);
  };

  function poblarAnexos(anexos) {
    const selector = $('ir-anexo');
    selector.replaceChildren(crear('option', '', 'Ir a un anexo'));
    selector.firstChild.value = '';
    for (const a of anexos) {
      const opcion = crear('option', '', `${a.numero}. ${a.titulo}`);
      opcion.value = String(a.pagina);
      selector.append(opcion);
    }
    selector.disabled = !anexos.length;
  }

  Lector.iniciar(
    { lienzo: $('lienzo'), capa: $('capa-texto'), visor: $('visor'), pagina: $('pagina'), total: $('total') },
    {
      estado: avisar,
      progreso(fraccion, texto) {
        $('lectura-barra').style.width = `${fraccion * 100}%`;
        avisar(texto);
      },
      error(mensaje) {
        $('archivo').value = '';
        $('lectura-barra').style.width = '0';
        $('vacio').hidden = false;
        $('lienzo').hidden = true;
        avisar(mensaje, true);
      },
      listo({ textos, anexos: indice, avisoDibujo, sinLeer }) {
        const anexos = Evidencia.rangos(indice, textos, IndiceAnexos.tieneCuerpo);
        anexosInforme = anexos;
        evidencias = Evidencia.sugerir(ids, textos, anexos);
        const hallados = Evidencia.datosDelInforme(textos);
        if (!mensual && !ficha.datos.periodo && hallados.periodo) ficha.datos.periodo = hallados.periodo; // siempre, si está vacío
        if (!ficha.autollenado) { // solo la primera vez: respeta lo que luego se borre a mano
          for (const c of ['proyecto', 'contratista']) {
            if (!ficha.datos[c] && hallados[c]) ficha.datos[c] = hallados[c];
          }
          if (!ficha.datos.fecha) ficha.datos.fecha = fechaDeHoy();
          if (mensual) {
            for (const [c, v] of Object.entries({ frente: 'N/A', fisico: 'N/A', ...firmasRecordadas() })) if (!ficha.datos[c]) ficha.datos[c] = v;
            // El mes del informe manda; si no se encuentra, se propone desde la fecha.
            if (hallados.mes && !ficha.datos.comentario) ficha.datos.comentario = `Mensual ${hallados.mes}`;
            else proponerComentario();
          }
          ficha.autollenado = true;
        }
        guardar();
        pintarFicha();
        poblarAnexos(anexos);
        $('lectura-barra').style.width = '0';
        if (avisoDibujo) avisar(avisoDibujo);
        else avisarVerificacion(sinLeer);
        if (!seleccionado) siguientePendiente();
        revisarListaDelInforme(textos);
      },
    },
  );

  // --- Elección de la lista: se confirma en cada sesión, antes de elegir el informe ---
  const CLAVE_CONFIRMADA = 'semestrales.listaConfirmada';
  const CLAVE_REABRIR = 'semestrales.reabrirInforme';
  const CLAVE_CONTINUAR = 'semestrales.continuar';
  const LISTAS = {
    [PRIMERA_LISTA]: 'Semestral · Ciudad y Bahía',
    'deia-166-2018': 'Semestral · Arraiján - La Chorrera',
    [LISTA_MENSUAL]: 'Mensual del contratista',
  };
  const nombreLista = (id) => LISTAS[id] || id;
  const sesion = {
    leer: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
    poner: (k, v) => { try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch { /* sin almacenamiento de sesión */ } },
  };

  function listaConfirmada() {
    try {
      return sessionStorage.getItem(CLAVE_CONFIRMADA) === fichaElegida;
    } catch {
      return true; // sin almacenamiento de sesión no se bloquea el uso
    }
  }

  // --- Inicio: qué hacer y qué quedó a medias en las tres listas ---
  const cuando = (ms) => Avance.cuando(ms);
  const SVG = 'http://www.w3.org/2000/svg';
  function icono(d) {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.classList.add('ico');
    const trazo = document.createElementNS(SVG, 'path');
    trazo.setAttribute('d', d);
    svg.append(trazo);
    return svg;
  }
  const TRAZO_PAPELERA = 'M4 7h16M10 11v6M14 11v6M6 7l1 12a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4L18 7M9 7V4.5h6V7';
  const TRAZO_FLECHA = 'M5 12h14M13 6l6 6-6 6';
  const TRAZO_CHECK = 'M5 12.5l4.5 4.5L19 7.5';

  async function avancesDeTodasLasListas() {
    const todos = [];
    for (const [lista, recurso] of Object.entries(FICHAS)) {
      try {
        const cat = lista === fichaElegida ? catalogo : JSON.parse(await Recursos.texto(recurso));
        const idsLista = cat.secciones.filter((s) => !s.numerico).flatMap((s) => s.items).map((r) => r.id);
        todos.push(...Avance.listar(localStorage, lista, idsLista));
      } catch { /* esa lista no se pudo leer: sus avances no se muestran */ }
    }
    return todos.sort((x, y) => y.ficha.actualizado - x.ficha.actualizado);
  }

  /** Lleva a la lista elegida; si es otra, recarga la página con ella. */
  function entrar(lista, llave) {
    sesion.poner(CLAVE_CONFIRMADA, lista);
    sesion.poner(CLAVE_CONTINUAR, llave);
    if (lista !== fichaElegida) {
      try {
        localStorage.setItem(CLAVE_FICHA, lista);
      } catch {
        avisar('No se pudo cambiar de lista: este navegador no permite guardar datos.', true);
        return;
      }
      window.location.reload();
      return;
    }
    const desdeInicio = !$('lobby').hidden;
    $('lobby').hidden = true;
    $('app').inert = false;
    $('vacio-lista').textContent = nombreLista(fichaElegida);
    if (llave) abrirAvanceGuardado(llave);
    if (desdeInicio) $('archivo').focus(); // lo siguiente es elegir el PDF
  }

  async function mostrarInicio() {
    $('app').inert = true;
    $('lobby').hidden = false;
    const avances = await avancesDeTodasLasListas();
    $('lobby-vacio').hidden = avances.length > 0;
    $('lobby-cuenta').textContent = avances.length ? String(avances.length) : '';
    $('lobby-avances').replaceChildren(...avances.map((a) => {
      const item = crear('li', 'lobby-avance');
      item.dataset.lista = a.lista;
      const seguir = crear('button', 'lobby-seguir');
      seguir.type = 'button';
      const pct = Math.round((a.hechas / a.total) * 100);
      const completo = a.hechas >= a.total;
      const anillo = crear('span', completo ? 'anillo completo' : 'anillo');
      anillo.setAttribute('aria-hidden', 'true');
      anillo.style.setProperty('--p', String(pct));
      anillo.append(completo ? icono(TRAZO_CHECK) : crear('span', '', `${pct}%`));
      const cuerpo = crear('span', 'cuerpo');
      const detalle = crear('span', 'detalle');
      detalle.append(
        crear('span', 'chip', nombreLista(a.lista).replace('Semestral · ', '')),
        crear('span', '', completo ? 'Lista para generar la ficha' : `${a.hechas} de ${a.total} revisados`),
        crear('span', 'fecha', cuando(a.ficha.actualizado)),
      );
      const titulo = crear('strong', '', a.nombre);
      titulo.title = a.nombre;
      cuerpo.append(titulo, detalle);
      const ir = crear('span', 'cta', 'Continuar');
      ir.append(icono(TRAZO_FLECHA));
      seguir.append(anillo, cuerpo, ir);
      seguir.addEventListener('click', () => entrar(a.lista, a.llave));
      const borrar = crear('button', 'lobby-borrar');
      borrar.type = 'button';
      borrar.append(icono(TRAZO_PAPELERA));
      borrar.title = 'Borrar este avance';
      borrar.setAttribute('aria-label', `Borrar el avance de ${a.nombre}`);
      borrar.addEventListener('click', () => {
        if (!window.confirm(`¿Borrar el avance de ${a.nombre} (${nombreLista(a.lista)})? No se puede deshacer.`)) return;
        try { localStorage.removeItem(a.llave); } catch { /* no se pudo borrar */ }
        mostrarInicio().then(() => document.querySelector('.opcion-lista').focus());
      });
      item.append(seguir, borrar);
      return item;
    }));
  }

  function irAlInicio() {
    if (Lector.estado().etapa === 'listo' && !window.confirm('Se cerrará el informe abierto. Tu avance queda guardado. ¿Ir al inicio?')) return;
    sesion.poner(CLAVE_CONFIRMADA, null);
    sesion.poner(CLAVE_CONTINUAR, null);
    window.location.reload();
  }

  /** Si el informe parece de otra lista, lo dice y ofrece cambiar. */
  function revisarListaDelInforme(textos) {
    const probable = Evidencia.listaProbable(textos);
    if (!probable || probable === fichaElegida) return;
    const otra = nombreLista(probable);
    const actual = nombreLista(fichaElegida);
    if (window.confirm(`Este informe parece de la lista «${otra}», pero estás revisando con «${actual}».\n\n¿Cambiar a «${otra}»? Después vuelve a elegir el mismo informe.`)) {
      try { sessionStorage.setItem(CLAVE_REABRIR, '1'); } catch { /* solo es un aviso */ }
      entrar(probable, null);
    } else {
      avisar(`Ojo: este informe parece de la lista «${otra}» y estás usando «${actual}».`, true);
    }
  }

  function siguientePendiente() {
    const inicio = seleccionado ? ids.indexOf(seleccionado) + 1 : 0;
    const orden = [...ids.slice(inicio), ...ids.slice(0, inicio)];
    const pendiente = orden.find((id) => !respuesta(id).estado);
    if (pendiente) seleccionar(pendiente, { enfocar: true });
    else if (mensual && ficha.porcentajeC === '') { $('m-porcentajeC').focus(); avisar('Falta el porcentaje de cumplimiento de la sección C.'); }
    else avisar(`Ya revisaste las ${TOTAL} filas. Puedes generar la ficha.`);
  }

  function abrirInforme(archivo) {
    if (!listaConfirmada()) {
      $('archivo').value = '';
      mostrarInicio();
      return;
    }
    $('etiqueta-archivo').textContent = 'Cambiar informe';
    for (const boton of ACCIONES_DE_AVANCE) $(boton).disabled = false;
    nombreArchivo = archivo.name;
    clave = `${PREFIJO}:${archivo.name}:${archivo.size}`;
    sesion.poner(CLAVE_CONTINUAR, clave);
    ficha = recuperar();
    const recuperadas = contarHechas(ficha);
    avisoRecuperado = recuperadas ? `Se recuperó tu avance: ${recuperadas} de ${TOTAL} revisados. ` : '';
    evidencias = null;
    anexosInforme = [];
    ultimoAnexo = null;
    Mosaico.cerrar();
    $('volver-mosaico').hidden = true;
    bloquearHoja(false);
    $('controles').inert = false;
    ponerNombre(archivo.name);
    $('vacio').hidden = true;
    $('lienzo').hidden = false;
    pintarFicha();
    Lector.abrir(archivo);
  }

  // --- Generar la ficha --------------------------------------------------------------
  function descargar(doc) {
    const url = URL.createObjectURL(doc.output('blob'));
    const enlace = crear('a');
    enlace.href = url;
    enlace.download = FichaMensual.nombreSeguro($('vp-nombre').value, nombrePropuesto());
    enlace.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function generar() {
    try {
      const datos = mensual
        ? { ...ficha.datos, respuestas: ficha.respuestas, porcentajeC: ficha.porcentajeC, otros: ficha.otros }
        : { ...ficha.datos, respuestas: ficha.respuestas, observaciones: ficha.observaciones, informeFinal: ficha.informeFinal };
      const doc = (mensual ? FichaMensual : FichaSemestral).generar(jspdf.jsPDF, catalogo, datos, LOGO_PROGRAMA);
      fichaPendiente = doc;
      paginasUltimaFicha = doc.getNumberOfPages();
      mostrarVistaPrevia(doc);
    } catch (e) {
      avisar(`No se generó la ficha. ${e.message}`, true);
    }
  }

  // "LVS del EsIA Matasnillo.pdf" o "LVM Matasnillo 07-26.pdf"; el revisor lo puede corregir en la vista previa.
  const nombrePropuesto = () => FichaMensual.nombreDeArchivo({ mensual, ...ficha.datos });

  function mostrarVistaPrevia(doc) {
    $('vp-nombre').value = nombrePropuesto();
    const faltan = ids.filter((id) => !respuesta(id).estado).length + (mensual && ficha.porcentajeC === '' ? 1 : 0);
    const hojas = doc.getNumberOfPages();
    const resumen = `${hojas === 1 ? '1 hoja' : `${hojas} hojas`}${faltan ? `, ${faltan} filas sin responder` : ''}.`;
    $('vp-estado').textContent = resumen;
    const contenedor = $('vp-paginas');
    contenedor.replaceChildren(crear('p', 'nota', 'Preparando la vista previa…'));
    $('vista-previa').showModal();
    Lector.previsualizar(new Uint8Array(doc.output('arraybuffer')), contenedor, Math.min(contenedor.clientWidth - 28, 900))
      .catch((e) => {
        console.warn('No se pudo mostrar la vista previa', e);
        contenedor.replaceChildren(crear('p', 'nota', 'No se pudo mostrar la vista previa, pero la ficha se puede descargar.'));
      });
  }

  // --- Eventos -----------------------------------------------------------------------
  function eventos() {
    $('archivo').addEventListener('change', () => {
      const archivo = $('archivo').files && $('archivo').files[0];
      if (archivo) abrirInforme(archivo);
    });
    for (const c of CAMPOS) {
      $(`dato-${c}`).addEventListener('input', (e) => {
        ficha.datos[c] = c === 'fecha' ? fechaDeSelector(e.target.value) : e.target.value;
        guardar();
      });
    }
    for (const c of CAMPOS_MENSUAL) {
      $(`m-${c}`).addEventListener('input', (e) => {
        if (c === 'fecha') {
          const anterior = ficha.datos.fecha;
          ficha.datos.fecha = fechaDeSelector(e.target.value);
          proponerComentario(anterior);
          $('m-comentario').value = ficha.datos.comentario;
        } else {
          ficha.datos[c] = e.target.value;
        }
        if (c === 'evaluadoPor' || c === 'aprobadoPor') recordarFirmas();
        guardar();
      });
    }
    $('m-otros').addEventListener('input', (e) => { ficha.otros = e.target.value; guardar(); });
    $('m-fecha').addEventListener('click', () => {
      try { $('m-fecha').showPicker(); } catch { /* el navegador ya muestra su propio control */ }
    });
    $('observaciones').addEventListener('input', (e) => { ficha.observaciones = e.target.value; guardar(); });
    $('informe-final').addEventListener('input', (e) => { ficha.informeFinal = e.target.value; guardar(); });
    $('detalle-obs').addEventListener('input', (e) => {
      if (!seleccionado) return;
      respuesta(seleccionado).obs = e.target.value;
      delete respuesta(seleccionado).texto;
      actualizarFila(seleccionado);
      guardar();
    });
    $('guardar-frase').addEventListener('click', guardarFrase);
    // El menú "Más opciones" se cierra al elegir una acción o con Escape.
    // El foco salió del menú con el teclado: se cierra (sin relatedTarget no hay a dónde fue; eso lo cubre pointerdown).
    $('mas').addEventListener('focusout', (e) => { if ($('mas').open && e.relatedTarget && !$('mas').contains(e.relatedTarget)) $('mas').open = false; });
    $('mas').addEventListener('click', (e) => { if (e.target.closest('.menu-mas button')) $('mas').open = false; });
    // Un clic fuera del menú lo cierra, también sobre la hoja inactiva o una opción deshabilitada.
    document.addEventListener('pointerdown', (e) => { if ($('mas').open && !e.target.closest('.menu-mas button:enabled, #mas > summary')) $('mas').open = false; });
    $('hoja').parentElement.addEventListener('pointerdown', (e) => {
      // El contenido inerte no recibe el clic: llega a la hoja o al contenedor, así que se mira la posición.
      const r = $('hoja').getBoundingClientRect();
      const sobreHoja = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (hojaBloqueada && sobreHoja) avisar('Primero elige el informe en PDF; después podrás marcar la ficha.', true);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && $('mas').open) { $('mas').open = false; $('mas').querySelector('summary').focus(); } });
    $('guardar-copia').addEventListener('click', guardarCopia);
    $('cargar-copia').addEventListener('click', () => $('archivo-copia').click());
    $('archivo-copia').addEventListener('change', (e) => {
      const archivo = e.target.files && e.target.files[0];
      e.target.value = '';
      if (archivo) cargarCopia(archivo);
    });
    $('ref-agregar').addEventListener('click', () => {
      if (!seleccionado) return;
      const lista = lugares(seleccionado);
      if (lista.length < MAX_LUGARES) lista.push({ titulo: '', pagina: '' });
      refrescarReferencia(seleccionado);
    });
    $('dato-fecha').addEventListener('click', () => {
      try { $('dato-fecha').showPicker(); } catch { /* el navegador ya muestra su propio control */ }
    });
    $('vista-previa').addEventListener('close', () => $('vp-paginas').replaceChildren()); // libera los lienzos
    $('vp-volver').addEventListener('click', () => $('vista-previa').close());
    $('vp-descargar').addEventListener('click', () => {
      if (!fichaPendiente) return;
      descargar(fichaPendiente);
      $('vista-previa').close();
      avisar('Ficha descargada.');
    });
    $('girar').addEventListener('click', () => Lector.girar());
    $('volver-mosaico').addEventListener('click', () => { if (ultimoAnexo) abrirHojas(ultimoAnexo, ultimaHoja); });
    $('generar').addEventListener('click', generar);
    $('siguiente-pendiente').addEventListener('click', siguientePendiente);
    // Soltar un archivo fuera de la app haría que el navegador la abandonara.
    window.addEventListener('dragover', (e) => { e.preventDefault(); $('app').classList.add('soltando'); });
    window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) $('app').classList.remove('soltando'); });
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      $('app').classList.remove('soltando');
      const archivo = e.dataTransfer && e.dataTransfer.files[0];
      if (!archivo) return;
      if (/\.pdf$/i.test(archivo.name)) abrirInforme(archivo);
      else avisar('Ese archivo no es un PDF. Suelta el informe en formato PDF.', true);
    });
    $('reiniciar').addEventListener('click', () => {
      if (!clave || !window.confirm('Se borrarán las respuestas y observaciones de este informe. Los datos del encabezado se conservan. ¿Continuar?')) return;
      ficha = { ...vacio(), datos: ficha.datos, autollenado: ficha.autollenado };
      guardar();
      pintarFicha();
      avisar('Respuestas borradas. Los datos del encabezado se conservan.');
    });
    $('previa').addEventListener('click', () => Lector.irA(Lector.pagina() - 1));
    $('siguiente').addEventListener('click', () => Lector.irA(Lector.pagina() + 1));
    $('pagina').addEventListener('change', (e) => Lector.irA(e.target.value));
    $('zoom-menos').addEventListener('click', () => Lector.cambiarZoom('menos'));
    $('zoom-mas').addEventListener('click', () => Lector.cambiarZoom('mas'));
    $('zoom-ajustar').addEventListener('click', () => Lector.cambiarZoom('ajustar'));
    $('ir-anexo').addEventListener('change', (e) => {
      if (e.target.value) Lector.irA(e.target.value);
      e.target.value = '';
    });
    document.addEventListener('keydown', (e) => {
      if ($('vista-previa').open || !clave || e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      // 2.1.4: los atajos solo actúan con el foco en la fila (no en otros botones ni en el visor).
      const filaConFoco = e.target.closest && e.target.closest('.fila');
      if (!filaConFoco) return;
      const otraFila = filaConFoco && seleccionado && filaConFoco !== filas.get(seleccionado).fila;
      const estado = { s: 'si', n: 'no', a: 'na' }[e.key.toLowerCase()];
      if (estado && seleccionado) {
        if (!otraFila && !e.repeat) responder(seleccionado, estado);
        return;
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); moverSeleccion(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); moverSeleccion(-1); }
    });
  }

  Mosaico.iniciar({
    mosaico: $('mosaico'),
    visor: $('visor'),
    rejilla: $('rejilla'),
    titulo: $('mosaico-titulo'),
    detalle: $('mosaico-detalle'),
    verificar: $('mosaico-verificar'),
    girar: $('mosaico-girar'),
    cerrar: $('mosaico-cerrar'),
  });
  try { indexedDB.deleteDatabase('semestrales-ocr'); } catch { /* restos de una versión anterior */ }
  $('logo').src = LOGO_PROGRAMA;
  $('logo-m').src = LOGO_PROGRAMA;
  for (const id of ['cab-semestral', 'cierre-semestral']) $(id).hidden = mensual;
  for (const id of ['cab-mensual', 'cierre-mensual']) $(id).hidden = !mensual;
  $('titulo-lista').textContent = catalogo.encabezado.titulo;
  $('ir-inicio').title = `Volver al inicio. Lista actual: ${nombreLista(fichaElegida)}`;
  $('app').dataset.lista = fichaElegida;
  $('chip-lista').textContent = nombreLista(fichaElegida).replace('Semestral · ', '');
  $('ir-inicio').addEventListener('click', irAlInicio);
  for (const boton of document.querySelectorAll('.opcion-lista')) boton.addEventListener('click', () => entrar(boton.dataset.lista, null));
  construirFicha();
  bloquearHoja(true);
  eventos();
  if (listaConfirmada()) entrar(fichaElegida, sesion.leer(CLAVE_CONTINUAR));
  else await mostrarInicio();
  pintarFicha();
  try {
    if (sessionStorage.getItem(CLAVE_REABRIR) === '1') {
      sessionStorage.removeItem(CLAVE_REABRIR);
      avisar(`Cambiaste a la lista ${nombreLista(fichaElegida)}. Vuelve a elegir el mismo informe.`);
    }
  } catch { /* solo es un aviso */ }

  if (new URLSearchParams(window.location.search).has('depurar')) {
    Object.defineProperty(window, 'revision', { get: () => ({ lector: Lector.estado(), evidencias, ficha, paginasUltimaFicha }) });
  }
})().catch((e) => {
  const estado = document.getElementById('estado');
  estado.textContent = `La página no pudo iniciar: ${e.message}`;
  estado.classList.add('error');
});
