const express = require('express');
const router = express.Router();
const Categoria = require('../models/Categoria');
const { verificarToken, permitirRoles } = require('../middleware/auth');

// Listar categorías (para armar el menú por secciones)
router.get('/', verificarToken, async (req, res) => {
  const categorias = await Categoria.find().sort('orden');
  res.json(categorias);
});

// Crear categoría
router.post('/', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const categoria = await Categoria.create(req.body);
    res.status(201).json(categoria);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Editar categoría (nombre, orden, activa/inactiva)
router.put('/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const categoria = await Categoria.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!categoria) return res.status(404).json({ error: 'Categoría no encontrada' });
    res.json(categoria);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar categoría
router.delete('/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const Producto = require('../models/Producto');
    const enUso = await Producto.findOne({ categoria: req.params.id });

    if (enUso) {
      return res.status(400).json({
        error: 'No se puede eliminar: hay productos usando esta categoría. Reasígnalos primero.'
      });
    }

    await Categoria.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Categoría eliminada' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
