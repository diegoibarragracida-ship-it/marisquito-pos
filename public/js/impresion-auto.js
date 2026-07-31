// Motor de impresión automática, reutilizable en cualquier consola (Cocina, Admin, Caja).
// Cada consola que lo incluye y llama iniciarImpresionAutomatica('cocina') (o con un arreglo,
// ej. ['cocina','barra']) se vuelve, ella misma, una estación de impresión: no hace falta
// abrir otra pestaña ni que nadie toque nada, solo dejar la pantalla abierta.
//
// 'cocina' -> lo escucha la consola de Cocina.
// 'barra'  -> comandas de bebidas/cocteles; también las recoge la consola de Cocina
//             (mismo dispositivo/impresora de la cocina), para que el cocinero no tenga
//             que hacer nada aparte.
// 'admin'  -> lo escuchan la consola de Admin Y la de Caja (cualquiera de las 2 que esté
//             abierta la imprime; /impresion/consumir es atómico así que nunca se duplica).
(function () {
  let procesando = false;
  let estacionesActuales = [];

  window.iniciarImpresionAutomatica = function (estacion) {
    estacionesActuales = Array.isArray(estacion) ? estacion : [estacion];
    asegurarZonaImprimible();
    montarIndicador();
    revisarPendientes();
    conectarTiempoRealImpresion();
    setInterval(revisarPendientes, 6000); // respaldo por si el socket se cae
  };

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
      socket.on('nuevaImpresion', () => revisarPendientes());
    } catch (err) {
      console.warn('Socket.io no disponible, la impresión automática seguirá por polling');
    }
  }

  async function revisarPendientes() {
    if (procesando || estacionesActuales.length === 0) return;
    procesando = true;
    try {
      // Se pide de UNO en uno con /consumir (atómico) hasta que ya no haya nada pendiente,
      // recorriendo cada estación que esta consola escucha (ej. admin y luego barra).
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
      if (usaRawBT()) {
        const texto = htmlAtextoPlano(trabajo.html);
        imprimirConRawBT(texto);
        // RawBT no avisa cuando terminó de imprimir. Lo único que sí podemos detectar es
        // que Android nos manda de regreso a esta pestaña después de abrir RawBT (o de que
        // el usuario cierre RawBT) — usamos eso como señal de "ya se disparó" antes de
        // seguir con el siguiente ticket, en vez de solo un tiempo fijo a ciegas.
        await esperarRegresoDeApp();
      } else {
        const zona = document.getElementById('zona-imprimible-auto');
        zona.innerHTML = trabajo.html;
        window.print();
        await esperar(1200);
      }
      marcarEnIndicador(trabajo);
    } catch (err) {
      // Si algo truena al imprimir (RawBT no instalado, error de DOM, etc.), el trabajo
      // YA se había marcado como "impreso" al tomarlo con /consumir — lo regresamos a
      // pendiente para que no se pierda en silencio y alguien lo note/reimprima.
      console.error('No se pudo imprimir, se regresa a la cola:', err.message);
      try { await Api.post(`/impresion/${trabajo._id}/reimprimir`, {}); } catch (e2) { /* si esto también falla, queda visible en el Centro de Impresión como "impreso" para revisarlo a mano */ }
    }
  }

  function esperar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Espera a que la pestaña vuelva a estar visible (el usuario regresó de RawBT), con un
  // tope máximo por si el navegador no dispara el evento (para no trabarse ahí para siempre).
  function esperarRegresoDeApp() {
    return new Promise(resolve => {
      let resuelto = false;
      const terminar = () => {
        if (resuelto) return;
        resuelto = true;
        document.removeEventListener('visibilitychange', onVisible);
        resolve();
      };
      const onVisible = () => { if (document.visibilityState === 'visible') terminar(); };
      document.addEventListener('visibilitychange', onVisible);
      setTimeout(terminar, 4000); // tope de seguridad
    });
  }

  // ---------- RawBT (impresora Bluetooth desde Android) ----------

  const esAndroid = /Android/i.test(navigator.userAgent);

  function claveRawBT() {
    return 'usarRawBT_' + estacionesActuales.join('+');
  }

  function usaRawBT() {
    return esAndroid && localStorage.getItem(claveRawBT()) === '1';
  }

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
        mostrarToast(chk.checked ? 'Este dispositivo imprimirá directo por RawBT' : 'Este dispositivo usará el diálogo normal de impresión');
      });
    }

    document.body.appendChild(cont);
  }

  function marcarEnIndicador(trabajo) {
    const txt = document.getElementById('indicador-impresion-texto');
    if (!txt) return;
    const etiqueta = trabajo.tipo === 'comanda' ? '🍽 Comanda impresa' : '🧾 Ticket impreso';
    txt.textContent = etiqueta;
    setTimeout(() => { txt.textContent = 'Impresión automática activa'; }, 2500);
  }
})();
