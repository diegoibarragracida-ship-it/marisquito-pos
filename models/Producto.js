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
    required: function () { return !this.variantes || this.variantes.length === 0; }
    // si el producto tiene variantes (ej. tamaños), este precio no se usa; se ignora a favor del precio de cada variante
  },
  variantes: [{
    nombre: { type: String, required: true, trim: true }, // ej. "Chico", "Mediano", "Bola"
    precio: { type: Number, required: true },
    receta: [recetaItemSchema]
  }],
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
  foto: String,
  modificadores: {
    type: [String], // botones rápidos para el mesero, ej. "Sin cebolla", "Extra picante"
    default: [] // vacío = el mesero ve los modificadores automáticos según el nombre/categoría del platillo
  }
}, { timestamps: true });

module.exports = mongoose.model('Producto', productoSchema);
