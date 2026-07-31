const express = require('express');
const router = express.Router();
const Pedido = require('../models/Pedido');
const { verificarToken, permitirRoles } = require('../middleware/auth');
const { esDeCocina } = require('../utils/estaciones');

// Ver todos los platillos (NO bebidas/cocteles, esos son de Barra) pendientes/en
// preparación, agrupados por mesa.
router.get('/comandas', verificarToken, permitirRoles('cocina', 'admin'), async (req, res) => {
  const pedidos = await Pedido.find({ estadoCuenta: 'abierta' })
    .populate('mesa', 'numero')
    .populate({
      path: 'items.producto',
      select: 'nombre categoria estacion',
      populate: { path: 'categoria', select: 'estacion' }
    });

  const comandas = pedidos.map(p => ({
    pedidoId: p._id,
    mesa: p.mesa ? p.mesa.numero : null,
    paraLlevar: p.tipo === 'para_llevar',
    clienteLlevar: p.clienteLlevar,
    notaGeneral: p.notaGeneral,
    items: p.items.filter(i => ['pendiente', 'preparando'].includes(i.estado) && esDeCocina(i))
  })).filter(c => c.items.length > 0);

  res.json(comandas);
});

// Actualizar estado de un item (pendiente -> preparando -> listo)
router.patch('/pedidos/:pedidoId/items/:itemId/estado', verificarToken, permitirRoles('cocina', 'admin'), async (req, res) => {
  try {
    const { estado } = req.body; // 'preparando' | 'listo'
    const pedido = await Pedido.findById(req.params.pedidoId).populate('mesa', 'numero').populate('items.producto', 'nombre');
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    const item = pedido.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item no encontrado' });

    item.estado = estado;
    await pedido.save();

    // Aquí se emite el evento en tiempo real para avisar al mesero
    const io = req.app.get('io');
    if (io) {
      io.emit('itemActualizado', {
        pedidoId: pedido._id,
        mesaId: pedido.mesa ? pedido.mesa._id : null,
        mesaNumero: pedido.mesa ? pedido.mesa.numero : null,
        paraLlevar: pedido.tipo === 'para_llevar',
        itemId: item._id,
        nombreProducto: item.producto ? item.producto.nombre : 'Producto',
        estado: item.estado
      });
    }

    res.json(item);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;