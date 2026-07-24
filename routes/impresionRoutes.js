const express = require('express');
const router = express.Router();
const ColaImpresion = require('../models/ColaImpresion');
const { verificarToken } = require('../middleware/auth');

// Enviar un trabajo a la cola (desde mesero/cocina/caja)
router.post('/', verificarToken, async (req, res) => {
  try {
    const { tipo, html } = req.body;
    if (!tipo || !html) return res.status(400).json({ error: 'Falta tipo o contenido para imprimir' });

    const trabajo = await ColaImpresion.create({ tipo, html });

    // Avisa en tiempo real a la estación de impresión conectada
    const io = req.app.get('io');
    if (io) io.emit('nuevaImpresion', { id: trabajo._id });

    res.status(201).json(trabajo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ver trabajos pendientes (los consume la estación de impresión)
router.get('/pendientes', verificarToken, async (req, res) => {
  const pendientes = await ColaImpresion.find({ estado: 'pendiente' }).sort('createdAt');
  res.json(pendientes);
});

// Marcar un trabajo como ya impreso
router.patch('/:id/impreso', verificarToken, async (req, res) => {
  try {
    const trabajo = await ColaImpresion.findByIdAndUpdate(req.params.id, { estado: 'impreso' }, { new: true });
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
    res.json(trabajo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
