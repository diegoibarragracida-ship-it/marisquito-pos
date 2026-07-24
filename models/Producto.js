const mongoose = require('mongoose');

// Cada línea de receta indica cuánto insumo consume el producto
const recetaItemSchema = new mongoose.Schema({
  insumo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Insumo',
    required: true
  },
  cantidad: {
    type: Number, // en la misma unidad que el insumo (g, ml, pieza, etc.)
    required: true
  }
}, { _id: false });

const productoSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  categoria: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Categoria',
    required: true
  },
  precio: {
    type: Number,
    required: true
  },
  disponible: {
    type: Boolean,
    default: true
  },
  esPaquete: {
    type: Boolean,
    default: false // true = es un combo/paquete (ej. "Combo Familiar"), se resalta en el menú
  },
  productosIncluidos: [{
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto' },
    cantidad: { type: Number, default: 1 }
  }],
  receta: [recetaItemSchema],
  foto: String
}, { timestamps: true });

module.exports = mongoose.model('Producto', productoSchema);
