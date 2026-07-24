const mongoose = require('mongoose');

const mesaSchema = new mongoose.Schema({
  numero: {
    type: Number,
    required: true,
    unique: true
  },
  capacidad: {
    type: Number,
    default: 4
  },
  estado: {
    type: String,
    enum: ['libre', 'ocupada', 'cuenta_pedida', 'reservada'],
    default: 'libre'
  },
  posX: {
    type: Number, // porcentaje horizontal (0-100) dentro del plano del salón
    default: 50
  },
  posY: {
    type: Number, // porcentaje vertical (0-100) dentro del plano del salón
    default: 50
  },
  forma: {
    type: String,
    enum: ['redonda', 'cuadrada'],
    default: 'redonda'
  },
  meseroActual: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario'
  }
}, { timestamps: true });

module.exports = mongoose.model('Mesa', mesaSchema);
