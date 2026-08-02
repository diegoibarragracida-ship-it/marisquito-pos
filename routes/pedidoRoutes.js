const express = require('express');
const router = express.Router();
const Pedido = require('../models/Pedido');
const Mesa = require('../models/Mesa');
const Producto = require('../models/Producto');
const ColaImpresion = require('../models/ColaImpresion');
const Usuario = require('../models/Usuario');
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
      .populate('mesa', 'numero estado');

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
      .populate('mesa', 'numero estado');

    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Mesero agrega un producto a un pedido/mesa y se descuenta el stock automáticamente
// (uso puntual / un solo producto — no imprime solo. Para tomar la orden normal
// desde la pantalla de mesero se usa /items/lote, que manda todo junto y sí imprime).
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

// El mesero arma varios productos en su pantalla y los manda TODOS JUNTOS al darle
// "Enviar orden". Aquí se guardan todos de una vez y se imprime UNA sola comanda
// por estación (cocina / barra) con todo lo nuevo — no una impresión por producto.
router.post('/:pedidoId/items/lote', verificarToken, async (req, res) => {
  try {
    const { items } = req.body; // [{ productoId, cantidad, notas, varianteNombre }, ...]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No hay productos para enviar' });
    }

    const pedido = await Pedido.findById(req.params.pedidoId);
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    if (pedido.estadoCuenta !== 'abierta') {
      return res.status(400).json({ error: 'Esta cuenta ya está cerrada' });
    }

    const porEstacion = { cocina: [], barra: [] };

    for (const linea of items) {
      const { productoId, notas, varianteNombre } = linea;
      const cantidad = Number(linea.cantidad) || 1;

      const producto = await Producto.findById(productoId).populate('categoria');
      if (!producto) continue; // producto ya no existe, lo saltamos sin tumbar todo el envío

      let precioUnitario = producto.precio;
      if (producto.variantes && producto.variantes.length > 0) {
        const variante = producto.variantes.find(v => v.nombre === varianteNombre);
        if (!variante) {
          return res.status(400).json({ error: `"${producto.nombre}" requiere elegir un tamaño` });
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

      const estacion = producto.estacion || (producto.categoria && producto.categoria.estacion) || 'cocina';
      porEstacion[estacion].push({ nombre: producto.nombre, varianteNombre, cantidad, notas });
    }

    await pedido.save();

    const io = req.app.get('io');
    if (io) io.emit('nuevoItemPedido', { pedidoId: pedido._id, mesa: pedido.mesa });

    // Una comanda por estación con TODO lo que se acaba de mandar (no una por producto)
    try {
      let encabezado;
      if (pedido.tipo === 'mesa') {
        const mesaDoc = await Mesa.findById(pedido.mesa);
        encabezado = `MESA ${mesaDoc ? mesaDoc.numero : ''}`;
      } else {
        encabezado = `PARA LLEVAR${pedido.clienteLlevar ? ' — ' + pedido.clienteLlevar : ''}`;
      }
      const meseroDoc = pedido.mesero ? await Usuario.findById(pedido.mesero).select('nombre') : null;
      const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

      for (const estacion of ['cocina', 'barra']) {
        const lineas = porEstacion[estacion];
        if (lineas.length === 0) continue;

        const html = `
          <h2>EL MARISQUITO</h2>
          <div class="centrado chico">${estacion === 'barra' ? 'Comanda de barra' : 'Comanda de cocina'} — ${hora}</div>
          <div class="linea-punteada"></div>
          <div class="titulo-mesa-print">${encabezado}</div>
          ${meseroDoc ? `<div class="mesero-print">Mesero: ${meseroDoc.nombre}</div>` : ''}
          ${pedido.notaGeneral ? `<div class="chico">Nota: ${pedido.notaGeneral}</div>` : ''}
          <div class="linea-punteada"></div>
          ${lineas.map(l => `
            <div class="fila-print"><span>${l.cantidad}× ${l.nombre}${l.varianteNombre ? ' (' + l.varianteNombre + ')' : ''}</span></div>
            ${l.notas ? `<div class="chico">— ${l.notas}</div>` : ''}
          `).join('')}
          <div class="linea-punteada"></div>
        `;

        const trabajo = await ColaImpresion.create({ tipo: 'comanda', estacion, html });
        if (io) io.emit('nuevaImpresion', { id: trabajo._id });
      }
    } catch (errImpresion) {
      console.error('No se pudo generar el ticket de impresión automática:', errImpresion.message);
    }

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
