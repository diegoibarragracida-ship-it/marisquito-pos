// Sistema de alertas para "platillo listo": sonido generado (sin archivos de audio
// externos, así no depende de internet) + vibración en dispositivos que la soportan.

function reproducirSonidoListo() {
  try {
    const ContextoAudio = window.AudioContext || window.webkitAudioContext;
    const ctx = new ContextoAudio();
    const notas = [880, 1108]; // dos tonos ascendentes, tipo "ding-ding"

    notas.forEach((frecuencia, i) => {
      const oscilador = ctx.createOscillator();
      const ganancia = ctx.createGain();
      oscilador.type = 'sine';
      oscilador.frequency.value = frecuencia;
      oscilador.connect(ganancia);
      ganancia.connect(ctx.destination);

      const inicio = ctx.currentTime + i * 0.18;
      ganancia.gain.setValueAtTime(0, inicio);
      ganancia.gain.linearRampToValueAtTime(0.25, inicio + 0.02);
      ganancia.gain.exponentialRampToValueAtTime(0.001, inicio + 0.28);

      oscilador.start(inicio);
      oscilador.stop(inicio + 0.3);
    });
  } catch (err) {
    console.warn('No se pudo reproducir el sonido de alerta:', err.message);
  }
}

function vibrarDispositivo() {
  if (navigator.vibrate) {
    navigator.vibrate([180, 90, 180]);
  }
}

function alertarPlatilloListo(mensaje) {
  reproducirSonidoListo();
  vibrarDispositivo();
  if (typeof mostrarToast === 'function') mostrarToast(mensaje);
}
