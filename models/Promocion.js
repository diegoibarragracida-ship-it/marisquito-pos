const mongoose = require('mongoose');

const promocionSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true // ej. "2x1 cocteles martes", "10% clientes frecuentes"
  },
  tipo: {
    type: String,
    enum: ['porcentaje', 'monto_fijo'],
    required: true
  },
  valor: {
    type: Number, // si es porcentaje: 0-100. Si es monto_fijo: pesos.
    required: true
  },
  diasSemana: {
    type: [Number], // 0=domingo … 6=sábado. Vacío = todos los días.
    default: []
  },
  activa: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Promocion', promocionSchema);
