const express = require('express');
const router = express.Router();
const Compra = require('../models/Compra');
const Insumo = require('../models/Insumo');
const MovimientoInsumo = require('../models/MovimientoInsumo');
const { verificarToken, permitirRoles } = require('../middleware/auth');

// Listar compras (más recientes primero)
router.get('/', verificarToken, permitirRoles('admin'), async (req, res) => {
  const compras = await Compra.find()
    .populate('proveedor', 'nombre')
    .populate('items.insumo', 'nombre unidad')
    .sort('-fecha');
  res.json(compras);
});

// Registrar una compra: aumenta el stock de cada insumo automáticamente
router.post('/', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const { proveedor, items, notas } = req.body; // items: [{ insumo, cantidad, costoTotal }]
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Agrega al menos un insumo a la compra' });
    }

    const total = items.reduce((acc, i) => acc + Number(i.costoTotal), 0);
    const compra = await Compra.create({ proveedor: proveedor || null, items, total, notas });

    for (const item of items) {
      const insumo = await Insumo.findById(item.insumo);
      if (!insumo) continue;

      insumo.stockActual += Number(item.cantidad);
      // Actualiza el costo unitario con el de esta compra, para que el margen de ganancia quede al día
      if (item.cantidad > 0) {
        insumo.costoUnitario = Number(item.costoTotal) / Number(item.cantidad);
      }
      await insumo.save();

      await MovimientoInsumo.create({
        insumo: insumo._id,
        tipo: 'entrada',
        cantidad: item.cantidad,
        motivo: 'Compra a proveedor',
        registradoPor: req.usuario.id
      });
    }

    res.status(201).json(compra);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
