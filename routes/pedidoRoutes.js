const express = require('express');
const router = express.Router();
const Pedido = require('../models/Pedido');
const Mesa = require('../models/Mesa');
const Producto = require('../models/Producto');
const { descontarStockPorVenta, revertirStockPorCancelacion } = require('../controllers/inventarioController');
const { verificarToken } = require('../middleware/auth');

// Crear un nuevo pedido para una mesa (al sentar clientes)
router.post('/', verificarToken, async (req, res) => {
  try {
    const { mesaId } = req.body;

    const mesa = await Mesa.findById(mesaId);
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

    const pedidoExistente = await Pedido.findOne({ mesa: mesaId, estadoCuenta: 'abierta' });
    if (pedidoExistente) {
      return res.status(400).json({ error: 'Ya existe un pedido abierto para esta mesa', pedido: pedidoExistente });
    }

    const pedido = await Pedido.create({ tipo: 'mesa', mesa: mesaId, mesero: req.usuario.id, items: [] });

    mesa.estado = 'ocupada';
    mesa.meseroActual = req.usuario.id;
    await mesa.save();

    res.status(201).json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Crear un pedido "para llevar" (sin mesa) — clienteLlevar es opcional (nombre/referencia)
router.post('/llevar', verificarToken, async (req, res) => {
  try {
    const { clienteLlevar } = req.body;
    const pedido = await Pedido.create({
      tipo: 'para_llevar',
      mesero: req.usuario.id,
      clienteLlevar: (clienteLlevar || '').trim(),
      items: []
    });
    res.status(201).json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Listar todas las cuentas abiertas (para que Caja vea qué mesas puede cobrar)
router.get('/', verificarToken, async (req, res) => {
  try {
    const pedidos = await Pedido.find({ estadoCuenta: 'abierta' })
      .populate('items.producto', 'nombre precio')
      .populate('mesero', 'nombre')
      .populate('mesa', 'numero estado')
      .sort('-createdAt');

    res.json(pedidos);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ver el pedido abierto actual de una mesa
router.get('/mesa/:mesaId/actual', verificarToken, async (req, res) => {
  try {
    const pedido = await Pedido.findOne({ mesa: req.params.mesaId, estadoCuenta: 'abierta' })
      .populate('items.producto', 'nombre precio')
      .populate('mesero', 'nombre')
      .populate('mesa', 'numero');

    if (!pedido) return res.status(404).json({ error: 'No hay pedido abierto para esta mesa' });

    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Listar pedidos "para llevar" abiertos (no están ligados a ninguna mesa)
router.get('/llevar/activos', verificarToken, async (req, res) => {
  try {
    const pedidos = await Pedido.find({ tipo: 'para_llevar', estadoCuenta: 'abierta' })
      .populate('items.producto', 'nombre precio')
      .populate('mesero', 'nombre')
      .sort('-createdAt');

    res.json(pedidos);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Historial de ventas del turno del mesero autenticado
// (debe ir ANTES de /:pedidoId para que Express no interprete "mesero" como un id)
router.get('/mesero/historial', verificarToken, async (req, res) => {
  try {
    const pedidos = await Pedido.find({ mesero: req.usuario.id })
      .populate('mesa', 'numero')
      .populate('items.producto', 'nombre precio')
      .sort('-createdAt');

    res.json(pedidos);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ver un pedido completo por su id
router.get('/:pedidoId', verificarToken, async (req, res) => {
  try {
    const pedido = await Pedido.findById(req.params.pedidoId)
      .populate('items.producto', 'nombre precio categoria')
      .populate('mesero', 'nombre')
      .populate('mesa', 'numero');

    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Mesero agrega un producto a un pedido/mesa y se descuenta el stock automáticamente
router.post('/:pedidoId/items', verificarToken, async (req, res) => {
  try {
    const { productoId, cantidad, notas, varianteNombre } = req.body;
    const pedido = await Pedido.findById(req.params.pedidoId);

    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.estadoCuenta !== 'abierta') {
      return res.status(400).json({ error: 'Esta cuenta ya está cerrada' });
    }

    const producto = await Producto.findById(productoId);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    let precioUnitario = producto.precio;
    if (producto.variantes && producto.variantes.length > 0) {
      const variante = producto.variantes.find(v => v.nombre === varianteNombre);
      if (!variante) {
        return res.status(400).json({ error: 'Este producto requiere elegir un tamaño (Chico/Mediano/Bola)' });
      }
      precioUnitario = variante.precio;
    }

    await descontarStockPorVenta(productoId, cantidad, varianteNombre || '');

    pedido.items.push({
      producto: productoId,
      varianteNombre: varianteNombre || '',
      precioUnitario,
      cantidad,
      notas,
      estado: 'pendiente'
    });
    await pedido.save();

    const io = req.app.get('io');
    if (io) io.emit('nuevoItemPedido', { pedidoId: pedido._id, mesa: pedido.mesa });

    res.status(201).json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Editar la nota general de la mesa (ej. "cliente alérgico a mariscos", "cumpleaños")
router.patch('/:pedidoId/nota', verificarToken, async (req, res) => {
  try {
    const pedido = await Pedido.findByIdAndUpdate(
      req.params.pedidoId,
      { notaGeneral: req.body.notaGeneral || '' },
      { new: true }
    );
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Editar el nombre/referencia del cliente en un pedido "para llevar"
router.patch('/:pedidoId/cliente-llevar', verificarToken, async (req, res) => {
  try {
    const pedido = await Pedido.findByIdAndUpdate(
      req.params.pedidoId,
      { clienteLlevar: (req.body.clienteLlevar || '').trim() },
      { new: true }
    );
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Cancelar un item del pedido → repone el stock consumido
router.patch('/:pedidoId/items/:itemId/cancelar', verificarToken, async (req, res) => {
  try {
    const pedido = await Pedido.findById(req.params.pedidoId);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    const item = pedido.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item no encontrado' });

    await revertirStockPorCancelacion(item.producto, item.cantidad, item.varianteNombre || '');
    item.estado = 'cancelado';
    await pedido.save();

    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
