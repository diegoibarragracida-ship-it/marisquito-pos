const mongoose = require('mongoose');

const categoriaSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  orden: {
    type: Number,
    default: 0 // para controlar el orden en que aparecen en el menú
  },
  activa: {
    type: Boolean,
    default: true
  },
  estacion: {
    type: String,
    enum: ['cocina', 'barra'], // a qué impresora se manda la comanda de los productos de esta categoría
    default: 'cocina'
  }
}, { timestamps: true });

module.exports = mongoose.model('Categoria', categoriaSchema);
