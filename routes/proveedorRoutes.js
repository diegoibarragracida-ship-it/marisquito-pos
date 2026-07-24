const express = require('express');
const router = express.Router();
const Proveedor = require('../models/Proveedor');
const { verificarToken, permitirRoles } = require('../middleware/auth');

router.get('/', verificarToken, permitirRoles('admin'), async (req, res) => {
  const proveedores = await Proveedor.find().sort('nombre');
  res.json(proveedores);
});

router.post('/', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const proveedor = await Proveedor.create(req.body);
    res.status(201).json(proveedor);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const proveedor = await Proveedor.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado' });
    res.json(proveedor);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    await Proveedor.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Proveedor eliminado' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
