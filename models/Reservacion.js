const mongoose = require('mongoose');

const reservacionSchema = new mongoose.Schema({
  nombreCliente: {
    type: String,
    required: true,
    trim: true
  },
  telefono: {
    type: String,
    trim: true
  },
  fechaHora: {
    type: Date,
    required: true
  },
  numPersonas: {
    type: Number,
    default: 2
  },
  mesa: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mesa'
  },
  notas: String,
  estado: {
    type: String,
    enum: ['pendiente', 'confirmada', 'completada', 'cancelada'],
    default: 'pendiente'
  }
}, { timestamps: true });

module.exports = mongoose.model('Reservacion', reservacionSchema);
