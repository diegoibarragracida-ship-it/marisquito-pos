const mongoose = require('mongoose');

const insumoSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  unidad: {
    type: String,
    enum: ['g', 'kg', 'ml', 'l', 'pieza'],
    required: true
  },
  stockActual: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  stockMinimo: {
    type: Number,
    default: 0
  },
  costoUnitario: {
    type: Number, // costo por unidad (ej. por gramo) para reportes de margen
    default: 0
  }
}, { timestamps: true });

// Helper: revisa si el insumo está en nivel bajo
insumoSchema.methods.enStockBajo = function () {
  return this.stockActual <= this.stockMinimo;
};

module.exports = mongoose.model('Insumo', insumoSchema);
