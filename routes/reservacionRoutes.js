const express = require('express');
const router = express.Router();
const Reservacion = require('../models/Reservacion');
const { verificarToken, permitirRoles } = require('../middleware/auth');

// Listar reservaciones (próximas primero)
router.get('/', verificarToken, async (req, res) => {
  const reservaciones = await Reservacion.find()
    .populate('mesa', 'numero')
    .sort('fechaHora');
  res.json(reservaciones);
});

router.post('/', verificarToken, permitirRoles('admin', 'mesero', 'cajero'), async (req, res) => {
  try {
    const reservacion = await Reservacion.create(req.body);
    res.status(201).json(reservacion);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', verificarToken, permitirRoles('admin', 'mesero', 'cajero'), async (req, res) => {
  try {
    const reservacion = await Reservacion.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!reservacion) return res.status(404).json({ error: 'Reservación no encontrada' });
    res.json(reservacion);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    await Reservacion.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Reservación eliminada' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
