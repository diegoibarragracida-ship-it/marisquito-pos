const express = require('express');
const router = express.Router();
const Pedido = require('../models/Pedido');
const { verificarToken, permitirRoles } = require('../middleware/auth');
const { esDeBarra } = require('../utils/estaciones');

// Ver todas las bebidas/cocteles pendientes o en preparación, agrupadas por mesa.
// Mismo patrón que /cocina/comandas, pero filtrado solo a lo que le toca a Barra.
router.get('/comandas', verificarToken, permitirRoles('cocina', 'admin'), async (req, res) => {
  try {
    const pedidos = await Pedido.find({ estadoCuenta: 'abierta' })
      .populate('mesa', 'numero')
      .populate({
        path: 'items.producto',
        select: 'nombre categoria estacion',
        populate: { path: 'categoria', select: 'estacion' }
      });

    const comandas = pedidos.map(p => ({
      pedidoId: p._id,
      mesa: p.mesa ? p.mesa.numero : null,
      paraLlevar: p.tipo === 'para_llevar',
      clienteLlevar: p.clienteLlevar,
      notaGeneral: p.notaGeneral,
      items: p.items.filter(i => ['pendiente', 'preparando'].includes(i.estado) && esDeBarra(i))
    })).filter(c => c.items.length > 0);

    res.json(comandas);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;