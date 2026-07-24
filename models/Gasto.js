const mongoose = require('mongoose');

const gastoSchema = new mongoose.Schema({
  concepto: {
    type: String,
    required: true,
    trim: true // ej. "Renta local", "Luz", "Propano", "Reparación de equipo"
  },
  monto: {
    type: Number,
    required: true
  },
  tipo: {
    type: String,
    enum: ['fijo', 'variable'],
    required: true
  },
  fecha: {
    type: Date,
    default: Date.now
  },
  recurrente: {
    type: Boolean,
    default: false
  },
  frecuencia: {
    type: String,
    enum: ['semanal', 'mensual', 'anual', null],
    default: null
  }
}, { timestamps: true });

module.exports = mongoose.model('Gasto', gastoSchema);
