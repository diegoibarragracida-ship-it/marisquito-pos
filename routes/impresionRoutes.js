const express = require('express');
const router = express.Router();
const ColaImpresion = require('../models/ColaImpresion');
const Configuracion = require('../models/Configuracion');
const { verificarToken, permitirRoles } = require('../middleware/auth');

// Enviar un trabajo a la cola (desde mesero/cocina/caja)
router.post('/', verificarToken, async (req, res) => {
  try {
    const { tipo, html, estacion } = req.body;
    if (!tipo || !html) return res.status(400).json({ error: 'Falta tipo o contenido para imprimir' });

    const datos = { tipo, html };
    if (estacion) datos.estacion = estacion; // sin esto, el trabajo quedaba sin estación y nunca lo recogía ninguna consola
    const trabajo = await ColaImpresion.create(datos);

    // Avisa en tiempo real a la estación de impresión conectada
    const io = req.app.get('io');
    if (io) io.emit('nuevaImpresion', { id: trabajo._id });

    res.status(201).json(trabajo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ver trabajos pendientes (uso viejo / centro de impresión). NO la usan las consolas para
// imprimir automático porque no es atómico: si 2 pantallas la llaman casi al mismo tiempo
// (ej. Admin y Caja, que comparten la estación 'admin'), ambas verían el mismo trabajo
// pendiente y lo imprimirían dos veces. Para eso existe /consumir.
router.get('/pendientes', verificarToken, async (req, res) => {
  const filtro = { estado: 'pendiente' };
  if (req.query.estacion) filtro.estacion = req.query.estacion;
  const pendientes = await ColaImpresion.find(filtro).sort('createdAt');
  res.json(pendientes);
});

// Estado de la impresión automática (cualquier consola lo puede consultar)
router.get('/estado', verificarToken, async (req, res) => {
  try {
    const config = await Configuracion.obtener();
    res.json({ impresionPausada: config.impresionPausada });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Pausar/reanudar la impresión automática en TODAS las consolas a la vez (solo admin)
router.patch('/pausar', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const { pausada } = req.body;
    const config = await Configuracion.obtener();
    config.impresionPausada = !!pausada;
    await config.save();

    const io = req.app.get('io');
    if (io) io.emit('estadoImpresion', { impresionPausada: config.impresionPausada });

    res.json({ impresionPausada: config.impresionPausada });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Tomar (y marcar como impreso) UN solo trabajo pendiente de forma atómica.
// Esto es lo que usan las consolas (Cocina / Admin / Caja) para imprimir automático:
// se llama en bucle hasta que regresa null. Al ser un findOneAndUpdate atómico,
// si Admin y Caja están abiertas al mismo tiempo (ambas escuchan 'admin'),
// nunca pueden llevarse el mismo trabajo ni imprimirlo dos veces.
// Si el admin pausó la impresión, regresa null sin tocar nada -- así el trabajo se
// queda tal cual "pendiente" esperando a que se reanude, en vez de perderse.
router.get('/consumir', verificarToken, async (req, res) => {
  try {
    const config = await Configuracion.obtener();
    if (config.impresionPausada) return res.json(null);

    const filtro = { estado: 'pendiente' };
    if (req.query.estacion) filtro.estacion = req.query.estacion;
    const trabajo = await ColaImpresion.findOneAndUpdate(
      filtro,
      { estado: 'impreso' },
      { sort: { createdAt: 1 }, new: true }
    );
    res.json(trabajo); // null si no había nada pendiente para esa estación
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Marcar un trabajo como ya impreso (se deja por compatibilidad, ya no la usa el flujo automático)
router.patch('/:id/impreso', verificarToken, async (req, res) => {
  try {
    const trabajo = await ColaImpresion.findByIdAndUpdate(req.params.id, { estado: 'impreso' }, { new: true });
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });
    res.json(trabajo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Historial para el Centro de Impresión: lo último que se ha mandado a imprimir,
// sin importar el estado (para ver qué se llegó a mandar aunque ya se haya impreso).
router.get('/historial', verificarToken, async (req, res) => {
  try {
    const historial = await ColaImpresion.find().sort('-createdAt').limit(150);
    res.json(historial);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Reimprimir un trabajo desde el Centro de Impresión: lo regresa a 'pendiente' y avisa
// por socket, así lo recoge automáticamente la consola que corresponda (Cocina/Admin/Caja),
// sin que el Centro de Impresión tenga que imprimir nada por su cuenta.
router.post('/:id/reimprimir', verificarToken, async (req, res) => {
  try {
    const trabajo = await ColaImpresion.findByIdAndUpdate(req.params.id, { estado: 'pendiente' }, { new: true });
    if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' });

    const io = req.app.get('io');
    if (io) io.emit('nuevaImpresion', { id: trabajo._id });

    res.json(trabajo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
