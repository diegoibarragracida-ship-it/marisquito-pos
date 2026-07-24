const express = require('express');
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
  try {
    const { metodoPago, propina, descuento, promocionId } = req.body; // metodoPago: efectivo | tarjeta | mixto
    const pedido = await Pedido.findById(req.params.pedidoId).populate('items.producto');

    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.estadoCuenta !== 'abierta') {
      return res.status(400).json({ error: 'Esta cuenta ya fue cerrada' });
    }

    const subtotal = pedido.items
      .filter(i => i.estado !== 'cancelado')
      .reduce((acc, item) => acc + item.precioUnitario * item.cantidad, 0);

    let descuentoPromocion = 0;
    let promocionAplicada = null;
    if (promocionId) {
      const promo = await Promocion.findById(promocionId);
      if (promo && promo.activa) {
        descuentoPromocion = promo.tipo === 'porcentaje' ? subtotal * (promo.valor / 100) : promo.valor;
        promocionAplicada = promo.nombre;
      }
    }

    const total = subtotal - descuentoPromocion - (descuento || 0) + (propina || 0);

    pedido.total = total;
    pedido.estadoCuenta = 'cerrada';
    pedido.metodoPago = metodoPago || 'efectivo';
    await pedido.save();

    // Liberar la mesa (si el pedido es "para llevar" no hay mesa que liberar)
    if (pedido.mesa) {
      await Mesa.findByIdAndUpdate(pedido.mesa, { estado: 'libre', meseroActual: null });
    }

    res.json({ pedido, subtotal, descuentoPromocion, promocionAplicada, descuento: descuento || 0, propina: propina || 0, total, metodoPago });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Registrar un pago parcial (para dividir cuenta de verdad, persona por persona)
router.post('/pagos/:pedidoId', verificarToken, permitirRoles('cajero', 'admin'), async (req, res) => {
  try {
    const { monto, metodoPago, persona } = req.body;
    const pedido = await Pedido.findById(req.params.pedidoId).populate('items.producto');
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.estadoCuenta !== 'abierta') {
      return res.status(400).json({ error: 'Esta cuenta ya fue cerrada' });
    }

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
        await Mesa.findByIdAndUpdate(pedido.mesa, { estado: 'libre', meseroActual: null });
      }
    }

    await pedido.save();
    res.json({ pedido, subtotal, totalPagado, restante, cuentaCerrada });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Corte del día: ventas (por método de pago) + gastos de hoy, para el botón de "Corte diario"
router.get('/corte-dia', verificarToken, permitirRoles('cajero', 'admin'), async (req, res) => {
  try {
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);

    const pedidosHoy = await Pedido.find({
      estadoCuenta: 'cerrada',
      updatedAt: { $gte: inicioDia }
    });

    const ventas = { efectivo: 0, tarjeta: 0, mixto: 0, total: 0, numCuentas: pedidosHoy.length };
    for (const p of pedidosHoy) {
      const metodo = p.metodoPago || 'efectivo';
      if (ventas[metodo] !== undefined) ventas[metodo] += p.total;
      ventas.total += p.total;
    }

    const gastosHoy = await Gasto.find({ fecha: { $gte: inicioDia } });
    const totalGastos = gastosHoy.reduce((acc, g) => acc + g.monto, 0);

    res.json({
      fecha: inicioDia,
      ventas,
      gastos: { total: totalGastos, detalle: gastosHoy },
      utilidadBruta: ventas.total - totalGastos
    });
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