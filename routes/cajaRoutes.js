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
    const { metodoPago, propina, descuento, promocionId } = req.body; // metodoPago: efectivo | tarjeta | mixto
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

      pedido.total = total;
      pedido.estadoCuenta = 'cerrada';
      pedido.metodoPago = metodoPago || 'efectivo';
      await pedido.save({ session });

      // Liberar la mesa (si el pedido es "para llevar" no hay mesa que liberar).
      // Va en la MISMA transacción que cerrar el pedido: o pasan los dos juntos, o
      // ninguno — así nunca se queda una mesa "colgada" (cuenta cerrada pero mesa
      // sin liberar) si algo interrumpe la conexión a la mitad.
      if (pedido.mesa) {
        await Mesa.findByIdAndUpdate(pedido.mesa, { estado: 'libre', meseroActual: null }, { session });
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
        cuentaCerrada = true;
        if (pedido.mesa) {
          await Mesa.findByIdAndUpdate(pedido.mesa, { estado: 'libre', meseroActual: null }, { session });
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
// (hora y quién la cobró/atendió), para el botón de "Corte diario"
router.get('/corte-dia', verificarToken, permitirRoles('cajero', 'admin'), async (req, res) => {
  try {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);

    const pedidosHoy = await Pedido.find({
      estadoCuenta: 'cerrada',
      updatedAt: { $gte: inicioDia }
    }).populate('mesero', 'nombre').populate('mesa', 'numero').sort('updatedAt');

    const ventas = { efectivo: 0, tarjeta: 0, mixto: 0, total: 0, numCuentas: pedidosHoy.length };
    for (const p of pedidosHoy) {
      const metodo = p.metodoPago || 'efectivo';
      if (ventas[metodo] !== undefined) ventas[metodo] += p.total;
      ventas.total += p.total;
    }

    // Una línea por cada venta cobrada hoy, con la hora exacta y quién la levantó
    // (el mesero que tomó la orden; si fue "para llevar" sin mesero se marca así).
    const detalleVentas = pedidosHoy.map(p => ({
      hora: p.updatedAt,
      mesero: p.mesero ? p.mesero.nombre : 'Sin mesero',
      referencia: p.mesa ? `Mesa ${p.mesa.numero}` : `Para llevar${p.clienteLlevar ? ' — ' + p.clienteLlevar : ''}`,
      metodoPago: p.metodoPago || 'efectivo',
      total: p.total || 0
    }));

    const gastosHoy = await Gasto.find({ fecha: { $gte: inicioDia } });
    const totalGastos = gastosHoy.reduce((acc, g) => acc + g.monto, 0);
    const gastosFijos = gastosHoy.filter(g => g.tipo === 'fijo').reduce((acc, g) => acc + g.monto, 0);
    const gastosVariables = totalGastos - gastosFijos;

    res.json({
      fecha: inicioDia,
      ventas,
      detalleVentas,
      gastos: { total: totalGastos, fijos: gastosFijos, variables: gastosVariables, detalle: gastosHoy },
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
    const inicioRango = new Date();
    inicioRango.setHours(0, 0, 0, 0);
    inicioRango.setDate(inicioRango.getDate() - (dias - 1));

    const [pedidos, gastos] = await Promise.all([
      Pedido.find({ estadoCuenta: 'cerrada', updatedAt: { $gte: inicioRango } }),
      Gasto.find({ fecha: { $gte: inicioRango } })
    ]);

    // Arma un renglón vacío para cada día del rango, del más viejo al más nuevo
    const porDia = {};
    for (let i = 0; i < dias; i++) {
      const d = new Date(inicioRango);
      d.setDate(d.getDate() + i);
      const clave = d.toISOString().slice(0, 10);
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
      const clave = p.updatedAt.toISOString().slice(0, 10);
      if (!porDia[clave]) continue;
      const metodo = p.metodoPago || 'efectivo';
      porDia[clave].numCuentas += 1;
      if (porDia[clave].ventas[metodo] !== undefined) porDia[clave].ventas[metodo] += p.total || 0;
      porDia[clave].ventas.total += p.total || 0;
    }

    for (const g of gastos) {
      const clave = new Date(g.fecha).toISOString().slice(0, 10);
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