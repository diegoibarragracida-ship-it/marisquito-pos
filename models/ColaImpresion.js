const mongoose = require('mongoose');

const colaImpresionSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['comanda', 'ticket'],
    required: true
  },
  html: {
    type: String, // el ticket/comanda ya renderizado, listo para imprimir tal cual
    required: true
  },
  estado: {
    type: String,
    enum: ['pendiente', 'impreso'],
    default: 'pendiente'
  },
  estacion: {
    type: String,
    enum: ['cocina', 'barra', 'admin']
    // 'cocina'  -> SOLO la consola de Cocina (nunca cuentas, nunca barra)
    // 'barra'   -> comandas de bebidas/cocteles: las recoge Admin, Caja o la estación Barra
    //              (la que esté abierta primero; /consumir es atómico, nunca se duplica)
    // 'admin'   -> cuentas/tickets: las recoge Admin o Caja (la que esté abierta primero)
    // sin valor -> compatibilidad vieja, se imprime en cualquier estación
  }
}, { timestamps: true });

module.exports = mongoose.model('ColaImpresion', colaImpresionSchema);
