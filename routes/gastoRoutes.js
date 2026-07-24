const express = require('express');
const router = express.Router();
const Gasto = require('../models/Gasto');
const { verificarToken, permitirRoles } = require('../middleware/auth');

// Listar gastos, opcionalmente filtrados por rango de días
router.get('/', verificarToken, permitirRoles('admin'), async (req, res) => {
  const dias = Number(req.query.dias) || 30;
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);

  const gastos = await Gasto.find({ fecha: { $gte: desde } }).sort('-fecha');
  res.json(gastos);
});

router.post('/', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const gasto = await Gasto.create(req.body);
    res.status(201).json(gasto);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    await Gasto.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Gasto eliminado' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
