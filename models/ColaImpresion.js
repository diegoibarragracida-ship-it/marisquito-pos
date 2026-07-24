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
  }
}, { timestamps: true });

module.exports = mongoose.model('ColaImpresion', colaImpresionSchema);
