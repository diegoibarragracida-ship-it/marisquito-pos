const express = require('express');
const router = express.Router();
const Promocion = require('../models/Promocion');
const { verificarToken, permitirRoles } = require('../middleware/auth');

// Listar promociones (caja las usa para aplicar en el cobro)
router.get('/', verificarToken, async (req, res) => {
  const promos = await Promocion.find().sort('-createdAt');
  res.json(promos);
});

// Listar solo las promociones activas y vigentes hoy (para el selector de caja)
router.get('/vigentes', verificarToken, async (req, res) => {
  const hoy = new Date().getDay(); // 0-6
  const promos = await Promocion.find({ activa: true });
  const vigentes = promos.filter(p => p.diasSemana.length === 0 || p.diasSemana.includes(hoy));
  res.json(vigentes);
});

router.post('/', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const promo = await Promocion.create(req.body);
    res.status(201).json(promo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const promo = await Promocion.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!promo) return res.status(404).json({ error: 'Promoción no encontrada' });
    res.json(promo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    await Promocion.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Promoción eliminada' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
