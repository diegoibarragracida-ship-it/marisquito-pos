// Corte automático diario a las 6:00pm (hora de Ciudad de México).
// No cierra ningún turno de caja (eso necesita que un humano cuente el efectivo
// de verdad) — lo que sí hace es generar un ticket resumen de cómo va el día
// (ventas por método de pago, gastos, utilidad) y mandarlo a la cola de
// impresión, igual que cualquier otro ticket: lo recoge sola la consola de
// Admin o Caja que esté abierta, usando el mismo motor de impresión automática.
//
// Si quieres cambiar la hora, solo edita HORA_CORTE_AUTOMATICO más abajo.

const HORA_CORTE_AUTOMATICO = 21; // 21 = 9:00pm (hora de cierre del negocio). Usa formato 24 horas.
const MINUTO_CORTE_AUTOMATICO = 0;

let ultimaFechaEjecutada = null; // clave "YYYY-MM-DD" (hora México) del último corte ya generado hoy

function horaActualMexico() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const obtener = tipo => partes.find(p => p.type === tipo).value;
  return {
    hora: Number(obtener('hour')),
    minuto: Number(obtener('minute')),
    fechaClave: `${obtener('year')}-${obtener('month')}-${obtener('day')}`
  };
}

async function generarCorteAutomatico(io) {
  const Pedido = require('../models/Pedido');
  const Gasto = require('../models/Gasto');
  const ColaImpresion = require('../models/ColaImpresion');
  const { inicioDiaMexico } = require('./fechasMexico');

  try {
    const inicioDia = inicioDiaMexico();

    const [pedidosDia, gastosDia] = await Promise.all([
      Pedido.find({ estadoCuenta: 'cerrada', updatedAt: { $gte: inicioDia } }),
      Gasto.find({ fecha: { $gte: inicioDia } })
    ]);

    const ventas = { efectivo: 0, tarjeta: 0, total: 0 };
    for (const p of pedidosDia) {
      const metodo = p.metodoPago || 'efectivo';
      if (metodo === 'mixto') {
        ventas.efectivo += p.montoEfectivo || 0;
        ventas.tarjeta += p.montoTarjeta || 0;
      } else if (ventas[metodo] !== undefined) {
        ventas[metodo] += p.total || 0;
      }
      ventas.total += p.total || 0;
    }

    const totalGastos = gastosDia.reduce((acc, g) => acc + g.monto, 0);
    const horaTexto = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit' });
    const fechaTexto = new Date().toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' });

    const html = `
      <h2>EL MARISQUITO</h2>
      <div class="centrado chico">Corte automático — ${fechaTexto}, ${horaTexto}</div>
      <div class="linea-punteada"></div>
      <div class="fila-print"><span>Cuentas cobradas hoy</span><span>${pedidosDia.length}</span></div>
      <div class="fila-print"><span>Efectivo</span><span>$${ventas.efectivo.toFixed(2)}</span></div>
      <div class="fila-print"><span>Tarjeta</span><span>$${ventas.tarjeta.toFixed(2)}</span></div>
      <div class="fila-print total-print"><span>TOTAL VENTAS</span><span>$${ventas.total.toFixed(2)}</span></div>
      <div class="linea-punteada"></div>
      <div class="fila-print"><span>Gastos del día</span><span>$${totalGastos.toFixed(2)}</span></div>
      <div class="fila-print total-print"><span>UTILIDAD BRUTA</span><span>$${(ventas.total - totalGastos).toFixed(2)}</span></div>
      <div class="linea-punteada"></div>
      <div class="centrado chico">Corte de cierre — ${HORA_CORTE_AUTOMATICO}:00</div>
    `;

    const trabajo = await ColaImpresion.create({
      tipo: 'ticket',
      estacion: 'barra',
      html,
      referencia: `Corte automático ${horaTexto}`
    });

    if (io) io.emit('nuevaImpresion', { id: trabajo._id, tipo: 'ticket', estacion: 'barra' });

    console.log(`✅ Corte automático de las ${HORA_CORTE_AUTOMATICO}:00 generado (ventas del día: $${ventas.total.toFixed(2)})`);
  } catch (err) {
    console.error('❌ No se pudo generar el corte automático:', err.message);
  }
}

// Revisa cada minuto si ya es la hora del corte y si hoy todavía no se ha hecho.
function iniciarCorteAutomatico(io) {
  setInterval(() => {
    const { hora, minuto, fechaClave } = horaActualMexico();

    if (hora === HORA_CORTE_AUTOMATICO && minuto === MINUTO_CORTE_AUTOMATICO && ultimaFechaEjecutada !== fechaClave) {
      ultimaFechaEjecutada = fechaClave;
      generarCorteAutomatico(io);
    }
  }, 60 * 1000);

  console.log(`🕕 Corte automático programado todos los días a las ${HORA_CORTE_AUTOMATICO}:00 (hora de México)`);
}

module.exports = { iniciarCorteAutomatico };
