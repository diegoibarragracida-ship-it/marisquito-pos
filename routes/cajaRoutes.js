const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Pedido = require('../models/Pedido');
const Producto = require('../models/Producto');
const Mesa = require('../models/Mesa');
const CorteCaja = require('../models/CorteCaja');
const Promocion = require('../models/Promocion');
const Gasto = require('../models/Gasto');
const { verificarToken, permitirRoles } = require('../middleware/auth');
const { inicioDiaMexico, claveDiaMexico } = require('../utils/fechasMexico');

// Abrir turno de caja
router.post('/turno/abrir', verificarToken, permitirRoles('cajero', 'admin'), async (req, res) => {
  const { efectivoInicial } = req.body;
  const corte = await CorteCaja.create({ cajero: req.usuario.id, efectivoInicial });
  res.status(201).json(corte);
});

// Vista previa de división de cuenta (no cierra el pedido, solo calcula)
// modo: 'partes_iguales' (requiere numPersonas) | 'por_producto' (agrupa por item asignado a cada persona)
router.post('/dividir/:pedidoId', verificarToken, permitirRoles('cajero', 'admin'), async (req, res) => {
  try {
    const { modo, numPersonas, asignaciones } = req.body;
    // asignaciones (para 'por_producto'): [{ persona: 'Persona 1', itemIds: ['...','...'] }, ...]

    const pedido = await Pedido.findById(req.params.pedidoId).populate('items.producto');
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    const itemsActivos = pedido.items.filter(i => i.estado !== 'cancelado');
    const subtotal = itemsActivos.reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0);

    if (modo === 'partes_iguales') {
      if (!numPersonas || numPersonas < 1) {
        return res.status(400).json({ error: 'numPersonas debe ser mayor a 0' });
      }
      const porPersona = subtotal / numPersonas;
      return res.json({
        modo,
        subtotal,
        numPersonas,
        montoPorPersona: Number(porPersona.toFixed(2))
      });
    }

    if (modo === 'por_producto') {
      if (!Array.isArray(asignaciones) || asignaciones.length === 0) {
        return res.status(400).json({ error: 'Debes enviar las asignaciones por persona' });
      }

      const resultado = asignaciones.map(a => {
        const itemsDePersona = itemsActivos.filter(i => a.itemIds.includes(String(i._id)));
        const totalPersona = itemsDePersona.reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0);
        return { persona: a.persona, total: totalPersona, items: itemsDePersona };
      });

      return res.json({ modo, subtotal, division: resultado });
    }

    res.status(400).json({ error: 'modo debe ser "partes_iguales" o "por_producto"' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cerrar cuenta de una mesa (cobrar)
router.post('/cobrar/:pedidoId', verificarToken, permitirRoles('cajero', 'admin'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { metodoPago, propina, descuento, promocionId, montoEfectivo, montoTarjeta } = req.body; // metodoPago: efectivo | tarjeta | mixto
    let resultado;

    await session.withTransaction(async () => {
      const pedido = await Pedido.findById(req.params.pedidoId).populate('items.producto').session(session);

      if (!pedido) throw new Error('Pedido no encontrado');
      if (pedido.estadoCuenta !== 'abierta') throw new Error('Esta cuenta ya fue cerrada');

      const subtotal = pedido.items
        .filter(i => i.estado !== 'cancelado')
        .reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0);

      let descuentoPromocion = 0;
      let promocionAplicada = null;
      if (promocionId) {
        const promo = await Promocion.findById(promocionId).session(session);
        if (promo && promo.activa) {
          descuentoPromocion = promo.tipo === 'porcentaje' ? subtotal * (promo.valor / 100) : promo.valor;
          promocionAplicada = promo.nombre;
        }
      }

      const total = subtotal - descuentoPromocion - (descuento || 0) + (propina || 0);

      if (metodoPago === 'mixto') {
        const efectivo = Number(montoEfectivo) || 0;
        const tarjeta = Number(montoTarjeta) || 0;
        if (Math.abs(efectivo + tarjeta - total) > 0.01) {
          throw new Error(`El desglose (efectivo $${efectivo.toFixed(2)} + tarjeta $${tarjeta.toFixed(2)}) no cuadra con el total $${total.toFixed(2)}`);
        }
        pedido.montoEfectivo = efectivo;
        pedido.montoTarjeta = tarjeta;
      }

      pedido.total = total;
      pedido.estadoCuenta = 'cerrada';
      pedido.metodoPago = metodoPago || 'efectivo';
      await pedido.save({ session });

      // Liberar la mesa (si el pedido es "para llevar" no hay mesa que liberar).
      // Va en la MISMA transacción que cerrar el pedido: o pasan los dos juntos, o
      // ninguno — así nunca se queda una mesa "colgada" (cuenta cerrada pero mesa
      // sin liberar) si algo interrumpe la conexión a la mitad.
      if (pedido.mesa) {
        const idsALiberar = [pedido.mesa, ...pedido.mesasAdicionales];
        await Mesa.updateMany({ _id: { $in: idsALiberar } }, { estado: 'libre', meseroActual: null }, { session });
      }

      resultado = { pedido, subtotal, descuentoPromocion, promocionAplicada, descuento: descuento || 0, propina: propina || 0, total, metodoPago };
    });

    res.json(resultado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
});

// Registrar un pago parcial (para dividir cuenta de verdad, persona por persona)
router.post('/pagos/:pedidoId', verificarToken, permitirRoles('cajero', 'admin'), async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { monto, metodoPago, persona } = req.body;
    let resultado;

    await session.withTransaction(async () => {
      const pedido = await Pedido.findById(req.params.pedidoId).populate('items.producto').session(session);
      if (!pedido) throw new Error('Pedido no encontrado');
      if (pedido.estadoCuenta !== 'abierta') throw new Error('Esta cuenta ya fue cerrada');

      pedido.pagos.push({ monto, metodoPago, persona });

      const subtotal = pedido.items
        .filter(i => i.estado !== 'cancelado')
        .reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0);
      const totalPagado = pedido.pagos.reduce((acc, p) => acc + p.monto, 0);
      const restante = Number((subtotal - totalPagado).toFixed(2));

      let cuentaCerrada = false;
      if (restante <= 0) {
        pedido.total = totalPagado;
        pedido.estadoCuenta = 'cerrada';
        const metodosUsados = [...new Set(pedido.pagos.map(p => p.metodoPago))];
        pedido.metodoPago = metodosUsados.length > 1 ? 'mixto' : (metodosUsados[0] || 'efectivo');
        // Suma real por método (para que el corte del día cuadre bien aunque la
        // cuenta se haya pagado dividida entre efectivo y tarjeta).
        pedido.montoEfectivo = pedido.pagos.filter(p => p.metodoPago === 'efectivo').reduce((a, p) => a + p.monto, 0);
        pedido.montoTarjeta = pedido.pagos.filter(p => p.metodoPago === 'tarjeta').reduce((a, p) => a + p.monto, 0);
        cuentaCerrada = true;
        if (pedido.mesa) {
          const idsALiberar = [pedido.mesa, ...pedido.mesasAdicionales];
          await Mesa.updateMany({ _id: { $in: idsALiberar } }, { estado: 'libre', meseroActual: null }, { session });
        }
      }

      await pedido.save({ session });
      resultado = { pedido, subtotal, totalPagado, restante, cuentaCerrada };
    });

    res.json(resultado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
});

// Corte del día: ventas (por método de pago) + gastos de hoy + detalle de cada venta
// Corte de un día específico (por defecto hoy): ventas por método de pago + gastos +
// el detalle completo de cada cuenta (mesero, hora, qué pidió cada mesa, notas).
// ?fecha=YYYY-MM-DD para consultar cualquier día — así "Ventas por día" puede abrir
// el detalle de cualquier fecha con un clic, no solo la de hoy.
router.get('/corte-dia', verificarToken, permitirRoles('cajero', 'admin'), async (req, res) => {
  try {
    const fechaBase = req.query.fecha ? new Date(req.query.fecha + 'T12:00:00') : new Date();
    const inicioDia = inicioDiaMexico(fechaBase);
    const finDia = new Date(inicioDia.getTime() + 24 * 3600 * 1000);

    const pedidosDia = await Pedido.find({
      estadoCuenta: 'cerrada',
      updatedAt: { $gte: inicioDia, $lt: finDia }
    }).populate('mesero', 'nombre').populate('mesa', 'numero').populate('items.producto', 'nombre').sort('updatedAt');

    const ventas = { efectivo: 0, tarjeta: 0, mixto: 0, total: 0, numCuentas: pedidosDia.length };
    for (const p of pedidosDia) {
      const metodo = p.metodoPago || 'efectivo';
      if (metodo === 'mixto') {
        ventas.efectivo += p.montoEfectivo || 0;
        ventas.tarjeta += p.montoTarjeta || 0;
      } else if (ventas[metodo] !== undefined) {
        ventas[metodo] += p.total;
      }
      ventas.total += p.total;
    }

    // Una línea por cada venta cobrada ese día, con hora, quién la levantó, qué se
    // pidió en esa mesa/orden (para "para llevar" sin mesa se marca así) y su nota.
    const detalleVentas = pedidosDia.map(p => ({
      hora: p.updatedAt,
      mesero: p.mesero ? p.mesero.nombre : 'Sin mesero',
      referencia: p.mesa ? `Mesa ${p.mesa.numero}` : `Para llevar${p.clienteLlevar ? ' — ' + p.clienteLlevar : ''}`,
      metodoPago: p.metodoPago || 'efectivo',
      total: p.total || 0,
      notaGeneral: p.notaGeneral || '',
      items: p.items.filter(i => i.estado !== 'cancelado').map(i => ({
        nombre: i.producto ? i.producto.nombre : 'Producto',
        cantidad: i.cantidad,
        varianteNombre: i.varianteNombre || '',
        notas: i.notas || ''
      }))
    }));

    const gastosDia = await Gasto.find({ fecha: { $gte: inicioDia, $lt: finDia } });
    const totalGastos = gastosDia.reduce((acc, g) => acc + g.monto, 0);
    const gastosFijos = gastosDia.filter(g => g.tipo === 'fijo').reduce((acc, g) => acc + g.monto, 0);
    const gastosVariables = totalGastos - gastosFijos;

    res.json({
      fecha: claveDiaMexico(inicioDia),
      ventas,
      detalleVentas,
      gastos: { total: totalGastos, fijos: gastosFijos, variables: gastosVariables, detalle: gastosDia },
      utilidadBruta: ventas.total - totalGastos
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Historial de cortes, un renglón por día (incluye los días sin ninguna venta como $0).
// Empieza en el día de HOY y se va llenando solo, día tras día, según pasa el tiempo —
// no requiere ninguna acción manual, es puro cálculo sobre lo que ya se fue cobrando.
router.get('/corte-historial', verificarToken, permitirRoles('cajero', 'admin'), async (req, res) => {
  try {
    const dias = Math.min(Number(req.query.dias) || 30, 90);
    const inicioRango = inicioDiaMexico();
    inicioRango.setUTCDate(inicioRango.getUTCDate() - (dias - 1));

    const [pedidos, gastos] = await Promise.all([
      Pedido.find({ estadoCuenta: 'cerrada', updatedAt: { $gte: inicioRango } }),
      Gasto.find({ fecha: { $gte: inicioRango } })
    ]);

    // Arma un renglón vacío para cada día del rango, del más viejo al más nuevo
    const porDia = {};
    for (let i = 0; i < dias; i++) {
      const d = new Date(inicioRango.getTime() + i * 24 * 3600 * 1000);
      const clave = claveDiaMexico(d);
      porDia[clave] = {
        fecha: clave,
        numCuentas: 0,
        ventas: { efectivo: 0, tarjeta: 0, mixto: 0, total: 0 },
        gastosFijos: 0,
        gastosVariables: 0,
        utilidadBruta: 0
      };
    }

    for (const p of pedidos) {
      const clave = claveDiaMexico(p.updatedAt);
      if (!porDia[clave]) continue;
      const metodo = p.metodoPago || 'efectivo';
      porDia[clave].numCuentas += 1;
      if (metodo === 'mixto') {
        porDia[clave].ventas.efectivo += p.montoEfectivo || 0;
        porDia[clave].ventas.tarjeta += p.montoTarjeta || 0;
      } else if (porDia[clave].ventas[metodo] !== undefined) {
        porDia[clave].ventas[metodo] += p.total || 0;
      }
      porDia[clave].ventas.total += p.total || 0;
    }

    for (const g of gastos) {
      const clave = claveDiaMexico(g.fecha);
      if (!porDia[clave]) continue;
      if (g.tipo === 'fijo') porDia[clave].gastosFijos += g.monto;
      else porDia[clave].gastosVariables += g.monto;
    }

    const resultado = Object.values(porDia).sort((a, b) => a.fecha.localeCompare(b.fecha));
    for (const dia of resultado) {
      dia.utilidadBruta = dia.ventas.total - dia.gastosFijos - dia.gastosVariables;
    }

    res.json(resultado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cerrar turno de caja (corte)
router.patch('/turno/:id/cerrar', verificarToken, permitirRoles('cajero', 'admin'), async (req, res) => {
  try {
    const { efectivoFinal } = req.body;
    const corte = await CorteCaja.findByIdAndUpdate(
      req.params.id,
      { efectivoFinal, estado: 'cerrado', fechaCierre: new Date() },
      { new: true }
    );
    res.json(corte);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;