const mongoose = require('mongoose');

const corteCajaSchema = new mongoose.Schema({
  cajero: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true
  },
  fechaApertura: {
    type: Date,
    default: Date.now
  },
  fechaCierre: Date,
  efectivoInicial: {
    type: Number,
    default: 0
  },
  efectivoFinal: Number,
  totalVentasEfectivo: {
    type: Number,
    default: 0
  },
  totalVentasTarjeta: {
    type: Number,
    default: 0
  },
  totalPropinas: {
    type: Number,
    default: 0
  },
  estado: {
    type: String,
    enum: ['abierto', 'cerrado'],
    default: 'abierto'
  }
}, { timestamps: true });

module.exports = mongoose.model('CorteCaja', corteCajaSchema);
