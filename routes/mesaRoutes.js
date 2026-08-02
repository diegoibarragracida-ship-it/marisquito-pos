const express = require('express');
const router = express.Router();
const Mesa = require('../models/Mesa');
const Pedido = require('../models/Pedido');
const { verificarToken, permitirRoles } = require('../middleware/auth');

// Ver todas las mesas y su estado (libre/ocupada/etc.)
router.get('/', verificarToken, async (req, res) => {
  const mesas = await Mesa.find().populate('meseroActual', 'nombre').sort('numero');
  res.json(mesas);
});

// Crear una mesa nueva (admin)
router.post('/', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const totalMesas = await Mesa.countDocuments();
    // Las va acomodando en una cuadrícula inicial para que no queden encimadas;
    // el admin luego las arrastra a donde quiera en el plano.
    const columna = totalMesas % 5;
    const fila = Math.floor(totalMesas / 5);
    const posX = 12 + columna * 19;
    const posY = 15 + fila * 22;

    const mesa = await Mesa.create({ ...req.body, posX, posY }); // { numero, capacidad }
    res.status(201).json(mesa);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Guardar la posición de una mesa en el plano (al arrastrarla)
router.patch('/:id/posicion', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const { posX, posY, forma } = req.body;
    const cambios = {};
    if (posX !== undefined) cambios.posX = Math.max(0, Math.min(100, posX));
    if (posY !== undefined) cambios.posY = Math.max(0, Math.min(100, posY));
    if (forma) cambios.forma = forma;

    const mesa = await Mesa.findByIdAndUpdate(req.params.id, cambios, { new: true });
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
    res.json(mesa);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar una mesa (admin) — solo si está libre
router.delete('/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const mesa = await Mesa.findById(req.params.id);
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
    if (mesa.estado !== 'libre') {
      return res.status(400).json({ error: 'Solo puedes eliminar mesas que estén libres' });
    }
    await Mesa.findByIdAndDelete(req.params.id);
    res.json({ mensaje: 'Mesa eliminada' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Mesero toma una mesa
router.patch('/:id/ocupar', verificarToken, async (req, res) => {
  try {
    const mesa = await Mesa.findById(req.params.id);
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

    mesa.estado = 'ocupada';
    mesa.meseroActual = req.usuario.id;
    await mesa.save();

    res.json(mesa);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Marcar mesa como "cuenta pedida" (cliente pidió la cuenta)
router.patch('/:id/pedir-cuenta', verificarToken, async (req, res) => {
  const mesa = await Mesa.findByIdAndUpdate(req.params.id, { estado: 'cuenta_pedida' }, { new: true });
  res.json(mesa);
});

// Reabrir una mesa que ya había pedido la cuenta (ej. pidieron algo más antes de pagar).
// El pedido nunca se cerró (eso solo pasa cuando caja cobra), así que solo hay que
// regresar el estado de la mesa a "ocupada" para poder seguir agregando productos.
router.patch('/:id/reabrir', verificarToken, async (req, res) => {
  const mesa = await Mesa.findByIdAndUpdate(req.params.id, { estado: 'ocupada' }, { new: true });
  if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
  res.json(mesa);
});

// Transferir la mesa (y su pedido) a otro mesero
router.patch('/:id/transferir', verificarToken, async (req, res) => {
  try {
    const { nuevoMeseroId } = req.body;
    const mesa = await Mesa.findByIdAndUpdate(
      req.params.id,
      { meseroActual: nuevoMeseroId },
      { new: true }
    ).populate('meseroActual', 'nombre');

    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });

    // El pedido abierto también pasa a nombre del nuevo mesero
    await Pedido.findOneAndUpdate(
      { mesa: req.params.id, estadoCuenta: 'abierta' },
      { mesero: nuevoMeseroId }
    );

    res.json(mesa);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Liberar mesa a mano (botón de emergencia para el admin, por si una mesa se queda
// "atorada" — ej. cuenta ya cerrada pero la mesa nunca se puso en libre). Por seguridad,
// SOLO libera si de verdad no hay ningún pedido abierto para esa mesa; si lo hay, avisa
// en vez de borrar una cuenta con consumo real.
router.patch('/:id/liberar', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const pedidoAbierto = await Pedido.findOne({ mesa: req.params.id, estadoCuenta: 'abierta' });
    if (pedidoAbierto) {
      return res.status(400).json({
        error: 'Esta mesa tiene un pedido abierto con consumo. Ciérralo/cóbralo desde Caja antes de liberarla a mano.'
      });
    }

    const mesa = await Mesa.findByIdAndUpdate(
      req.params.id,
      { estado: 'libre', meseroActual: null },
      { new: true }
    );
    if (!mesa) return res.status(404).json({ error: 'Mesa no encontrada' });
    res.json(mesa);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
