// Motor de impresión automática, reutilizable en cualquier consola (Cocina, Admin, Caja).
// Cada consola que lo incluye y llama iniciarImpresionAutomatica('cocina') (o con un arreglo,
// ej. ['cocina','barra']) se vuelve, ella misma, una estación de impresión: no hace falta
// abrir otra pestaña, solo dejar la pantalla abierta.
//
// 'cocina' -> lo escucha la consola de Cocina.
// 'barra'  -> comandas de bebidas/cocteles, las recoge la consola de Barra (o quien la escuche).
// 'admin'  -> lo escuchan la consola de Admin Y la de Caja (cualquiera de las 2 que esté
//             abierta la imprime; /impresion/consumir es atómico así que nunca se duplica).
//
// ---------------------------------------------------------------------------------------
// IMPORTANTE sobre RawBT (impresora Bluetooth desde Android):
// Android/Chrome bloquea SILENCIOSAMENTE que una página abra otra app (como RawBT) si la
// orden de abrirla no viene de un toque directo del usuario (esto es una regla de seguridad
// del propio navegador, no algo que este código pueda evitar). Por eso, cuando la comanda
// llega sola en segundo plano (por socket), no podemos disparar RawBT sin que nadie toque
// nada: Chrome lo bloquea y el ticket se pierde en silencio si no se maneja con cuidado.
//
// La solución: en vez de intentar imprimir en automático y fallar en silencio, en cuanto
// llega una comanda mostramos un aviso GRANDE e imposible de ignorar ("Nueva comanda —
// toca aquí para imprimir"), con sonido y vibración. Ese toque SÍ cuenta como gesto real
// del usuario, así que RawBT se abre sin problema. Es 1 solo toque en la pantalla (no hay
// que buscar ningún botón de "Imprimir" en cada comanda ni confirmar nada en un diálogo).
//
// Si esta consola NO usa RawBT (por ejemplo, imprime con window.print() en una compu con
// Chrome en modo kiosk-printing), sí es 100% automática sin ningún toque, porque esa
// restricción de "gesto del usuario" solo aplica a abrir apps externas por Android Intent,
// no a imprimir directo a una impresora normal.
// ---------------------------------------------------------------------------------------
(function () {
  let procesando = false;
  let estacionesActuales = [];
  let requiereToqueForzado = false; // true = mostrar el botón de "toca para imprimir" aunque este dispositivo no use RawBT

  window.iniciarImpresionAutomatica = function (estacion, opciones) {
    estacionesActuales = Array.isArray(estacion) ? estacion : [estacion];
    requiereToqueForzado = !!(opciones && opciones.requiereToque);
    asegurarZonaImprimible();
    montarIndicador();
    conectarTiempoRealImpresion();

    if (modoBoton()) {
      revisarPendientesBoton();
      setInterval(revisarPendientesBoton, 6000); // respaldo por si el socket se cae
    } else {
      revisarPendientes();
      setInterval(revisarPendientes, 6000); // respaldo por si el socket se cae
    }
  };

  // true si esta pantalla debe esperar un toque real antes de imprimir: ya sea porque
  // usa RawBT (Bluetooth, siempre necesita un gesto) o porque se le pidió explícitamente
  // con { requiereToque: true } (ej. Admin/Caja, para no imprimir en automático comandas
  // que le tocan a otra estación y quedarse con la decisión de "sí, imprímela aquí").
  function modoBoton() {
    return usaRawBT() || requiereToqueForzado;
  }

  function asegurarZonaImprimible() {
    if (document.getElementById('zona-imprimible-auto')) return;
    const zona = document.createElement('div');
    zona.className = 'zona-imprimible';
    zona.id = 'zona-imprimible-auto';
    document.body.appendChild(zona);
  }

  function conectarTiempoRealImpresion() {
    try {
      const socket = io();
      socket.on('nuevaImpresion', () => {
        if (modoBoton()) revisarPendientesBoton();
        else revisarPendientes();
      });
    } catch (err) {
      console.warn('Socket.io no disponible, la impresión automática seguirá por polling');
    }
  }

  // ---------- Flujo normal (window.print / kiosk-printing): sí puede ser 100% automático ----------

  async function revisarPendientes() {
    if (procesando || estacionesActuales.length === 0) return;
    procesando = true;
    try {
      for (const estacion of estacionesActuales) {
        let trabajo = await Api.get(`/impresion/consumir?estacion=${estacion}`);
        while (trabajo) {
          await imprimirTrabajo(trabajo);
          trabajo = await Api.get(`/impresion/consumir?estacion=${estacion}`);
        }
      }
    } catch (err) {
      console.error('Error revisando cola de impresión:', err.message);
    } finally {
      procesando = false;
    }
  }

  async function imprimirTrabajo(trabajo) {
    try {
      const zona = document.getElementById('zona-imprimible-auto');
      zona.innerHTML = trabajo.html;
      window.print();
      await esperar(1200);
      marcarEnIndicador(trabajo);
    } catch (err) {
      console.error('No se pudo imprimir, se regresa a la cola:', err.message);
      try { await Api.post(`/impresion/${trabajo._id}/reimprimir`, {}); } catch (e2) { /* queda visible en el Centro de Impresión */ }
    }
  }

  function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ---------- Flujo RawBT: necesita 1 toque real para poder abrir la app ----------

  // Solo CONSULTA si hay algo pendiente (no lo marca como impreso). Así, si nadie ha
  // tocado el aviso todavía, el trabajo se queda honestamente como "pendiente" en vez de
  // perderse marcado como impreso sin haberse impreso de verdad (o robárselo en silencio
  // a otra pantalla que también podía imprimirlo, ej. Admin robándole una comanda a Barra).
  async function revisarPendientesBoton() {
    if (procesando || estacionesActuales.length === 0) return;
    procesando = true;
    try {
      let totalPendientes = 0;
      for (const estacion of estacionesActuales) {
        const pendientes = await Api.get(`/impresion/pendientes?estacion=${estacion}`);
        totalPendientes += (pendientes || []).length;
      }
      if (totalPendientes > 0) mostrarAvisoRawBT(totalPendientes);
      else ocultarAvisoRawBT();
    } catch (err) {
      console.error('Error revisando cola de impresión:', err.message);
    } finally {
      procesando = false;
    }
  }

  // Esto SÍ corre dentro del manejador de clic del aviso (gesto real del usuario). Si el
  // dispositivo usa RawBT, dispara el intent (necesita ese gesto para que Chrome no lo
  // bloquee). Si no usa RawBT pero de todas formas está en modo botón (ej. Admin/Caja,
  // para no robarle en silencio una comanda a otra pantalla), imprime normal con
  // window.print() apenas se toca, en vez de hacerlo solo automáticamente.
  async function imprimirTodoPendienteConGesto() {
    if (procesando) return;
    procesando = true;
    try {
      for (const estacion of estacionesActuales) {
        let trabajo = await Api.get(`/impresion/consumir?estacion=${estacion}`);
        while (trabajo) {
          if (usaRawBT()) {
            const texto = htmlAtextoPlano(trabajo.html);
            imprimirConRawBT(texto);
            marcarEnIndicador(trabajo);
            await esperar(700); // pequeña pausa para no mandar dos intents encimados
          } else {
            await imprimirTrabajo(trabajo);
          }
          trabajo = await Api.get(`/impresion/consumir?estacion=${estacion}`);
        }
      }
      ocultarAvisoRawBT();
    } catch (err) {
      console.error('Error imprimiendo:', err.message);
      mostrarToast('No se pudo imprimir, se reintentará', true);
    } finally {
      procesando = false;
    }
  }

  // ---------- "2x1": aprovechar un clic que el cocinero YA iba a dar ----------
  // En vez de pedirle un toque aparte (la franja roja), cualquier pantalla puede llamar a
  // esto dentro del manejador de OTRO botón que el cocinero de cualquier forma tiene que
  // tocar (ej. "Empezar a preparar", "Marcar listo"). Ese clic cuenta como gesto real, así
  // que aprovechamos justo esa interacción para imprimir lo pendiente sin pedir nada extra.
  // Si esta consola no usa RawBT, no hace nada (el flujo normal ya es 100% automático solo).
  window.aprovecharClicParaImprimir = function () {
    if (!modoBoton()) return;
    imprimirTodoPendienteConGesto();
  };

  function htmlAtextoPlano(html) {
    const conLineas = html.replace(/<div class="linea-punteada"[^>]*>\s*<\/div>/g, '--------------------------------');
    const contenedor = document.createElement('div');
    contenedor.innerHTML = conLineas;
    const lineas = [];
    contenedor.childNodes.forEach(nodo => {
      const texto = (nodo.textContent || '').replace(/\s+/g, ' ').trim();
      if (texto) lineas.push(texto);
    });
    return lineas.join('\n') + '\n\n\n';
  }

  function imprimirConRawBT(texto) {
    const sufijo = '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
    window.location.href = 'intent:' + encodeURI(texto) + sufijo;
  }

  // ---------- Aviso grande de "toca para imprimir" (RawBT) ----------

  let intervaloInsistencia = null;
  let wakeLock = null;

  function mostrarAvisoRawBT(cantidad) {
    let aviso = document.getElementById('aviso-tocar-imprimir');
    if (aviso) {
      aviso.querySelector('#texto-aviso-tocar').textContent = mensajeAviso(cantidad);
      return;
    }

    aviso = document.createElement('button');
    aviso.id = 'aviso-tocar-imprimir';
    aviso.style.cssText = 'position:fixed; top:0; left:0; right:0; width:100%; border:none; cursor:pointer; background:#c0392b; color:#fff; padding:16px; font-size:1rem; font-weight:700; text-align:center; z-index:700; box-shadow:0 3px 10px rgba(0,0,0,.25); animation:parpadeoAvisoImprimir 1s infinite;';
    aviso.innerHTML = `🖨️ <span id="texto-aviso-tocar">${mensajeAviso(cantidad)}</span>`;

    if (!document.getElementById('estilo-parpadeo-aviso')) {
      const estilo = document.createElement('style');
      estilo.id = 'estilo-parpadeo-aviso';
      estilo.textContent = '@keyframes parpadeoAvisoImprimir { 0%,100% { opacity:1; } 50% { opacity:0.72; } }';
      document.head.appendChild(estilo);
    }

    aviso.addEventListener('click', () => {
      aviso.disabled = true;
      aviso.querySelector('#texto-aviso-tocar').textContent = 'Imprimiendo…';
      imprimirTodoPendienteConGesto().finally(() => { aviso.disabled = false; });
    });

    document.body.appendChild(aviso);
    pedirPantallaDespierta();

    // El cocinero no siempre está viendo la tablet, así que un solo "bip" no basta:
    // repetimos sonido + vibración cada 4s mientras el aviso siga sin tocarse.
    sonarAvisoUnaVez();
    if (!intervaloInsistencia) {
      intervaloInsistencia = setInterval(sonarAvisoUnaVez, 4000);
    }
  }

  function mensajeAviso(cantidad) {
    return cantidad === 1 ? 'Nueva comanda — TOCA AQUÍ para imprimir' : `${cantidad} comandas esperando — TOCA AQUÍ para imprimir`;
  }

  function ocultarAvisoRawBT() {
    const aviso = document.getElementById('aviso-tocar-imprimir');
    if (aviso) aviso.remove();
    if (intervaloInsistencia) {
      clearInterval(intervaloInsistencia);
      intervaloInsistencia = null;
    }
    liberarPantallaDespierta();
  }

  function sonarAvisoUnaVez() {
    try {
      if (navigator.vibrate) navigator.vibrate([250, 120, 250, 120, 250]);
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Dos tonos (como un timbre de cocina) en vez de un solo bip, para que se note más.
      [880, 660].forEach((frecuencia, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = frecuencia;
        gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.22);
        osc.start(ctx.currentTime + i * 0.22);
        osc.stop(ctx.currentTime + i * 0.22 + 0.2);
      });
    } catch (err) { /* si el navegador bloquea el audio sin interacción previa, no pasa nada grave */ }
  }

  // Intenta que la pantalla no se apague/bloquee mientras hay una comanda esperando,
  // para que el aviso rojo se siga viendo aunque nadie haya tocado la tablet en un rato.
  // Si el navegador no lo soporta o lo bloquea, simplemente no hace nada (no truena).
  async function pedirPantallaDespierta() {
    try {
      if (wakeLock || !('wakeLock' in navigator)) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (err) { /* algunos navegadores solo lo permiten justo después de un toque; no pasa nada */ }
  }

  function liberarPantallaDespierta() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  // ---------- RawBT: activar/desactivar en este dispositivo ----------

  const esAndroid = /Android/i.test(navigator.userAgent);

  function claveRawBT() {
    return 'usarRawBT_' + estacionesActuales.join('+');
  }

  function usaRawBT() {
    return esAndroid && localStorage.getItem(claveRawBT()) === '1';
  }

  // ---------- Indicador visual pequeño (estado + configurar Bluetooth) ----------

  function montarIndicador() {
    if (document.getElementById('indicador-impresion-auto')) return;

    const cont = document.createElement('div');
    cont.id = 'indicador-impresion-auto';
    cont.style.cssText = 'position:fixed; bottom:14px; right:14px; background:var(--blanco,#fff); box-shadow:var(--sombra,0 2px 10px rgba(0,0,0,.12)); border-radius:10px; padding:8px 12px; font-size:0.72rem; z-index:500; display:flex; align-items:center; gap:8px; opacity:0.9;';
    cont.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;background:#2e7d5b;display:inline-block;"></span>
      <span id="indicador-impresion-texto">Impresión automática activa</span>
    `;

    if (esAndroid) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex; align-items:center; gap:4px; cursor:pointer; margin-left:6px; border-left:1px solid #ddd; padding-left:8px;';
      label.innerHTML = `<input type="checkbox" id="chk-rawbt-auto" style="width:auto;"> RawBT`;
      cont.appendChild(label);
      const chk = label.querySelector('#chk-rawbt-auto');
      chk.checked = localStorage.getItem(claveRawBT()) === '1';
      chk.addEventListener('change', () => {
        localStorage.setItem(claveRawBT(), chk.checked ? '1' : '0');
        mostrarToast(chk.checked ? 'Este dispositivo imprimirá por RawBT (toca el aviso rojo cuando llegue una comanda)' : 'Este dispositivo usará el diálogo normal de impresión');
        actualizarAvisoRawBTFaltante();
        location.reload(); // reinicia el motor con el modo correcto (RawBT vs normal)
      });
    }

    document.body.appendChild(cont);
    if (esAndroid) actualizarAvisoRawBTFaltante();
  }

  // Aviso (independiente del rojo de "toca para imprimir") que recuerda activar la
  // casilla RawBT la primera vez que se abre esta pantalla en un Android sin configurar.
  function actualizarAvisoRawBTFaltante() {
    const activo = localStorage.getItem(claveRawBT()) === '1';
    let aviso = document.getElementById('aviso-rawbt-pendiente');

    if (activo) {
      if (aviso) aviso.remove();
      return;
    }
    if (aviso) return;

    aviso = document.createElement('div');
    aviso.id = 'aviso-rawbt-pendiente';
    aviso.style.cssText = 'position:fixed; top:0; left:0; right:0; background:#fdf1d6; color:#7a4a00; padding:10px 16px; font-size:0.8rem; text-align:center; z-index:600; box-shadow:0 2px 8px rgba(0,0,0,.08);';
    aviso.innerHTML = `
      ⚠️ Falta activar la impresión por RawBT en este dispositivo — marca la casilla
      <strong>"RawBT"</strong> abajo a la derecha (una sola vez).
      <button id="btn-cerrar-aviso-rawbt" style="margin-left:10px; border:none; background:transparent; color:#7a4a00; text-decoration:underline; cursor:pointer; font-size:0.78rem;">Entendido</button>
    `;
    document.body.appendChild(aviso);
    document.getElementById('btn-cerrar-aviso-rawbt').addEventListener('click', () => aviso.remove());
  }

  function marcarEnIndicador(trabajo) {
    const txt = document.getElementById('indicador-impresion-texto');
    if (!txt) return;
    const etiqueta = trabajo.tipo === 'comanda' ? '🍽 Comanda impresa' : '🧾 Ticket impreso';
    txt.textContent = etiqueta;
    setTimeout(() => { txt.textContent = 'Impresión automática activa'; }, 2500);
  }
})();