const mongoose = require('mongoose');

const movimientoInsumoSchema = new mongoose.Schema({
  insumo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Insumo',
    required: true
  },
  tipo: {
    type: String,
    enum: ['entrada', 'merma', 'ajuste', 'venta'],
    required: true
  },
  cantidad: {
    type: Number,
    required: true // siempre positivo; el "tipo" indica si sumó o restó
  },
  motivo: String,
  registradoPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario'
  }
}, { timestamps: true });

module.exports = mongoose.model('MovimientoInsumo', movimientoInsumoSchema);
