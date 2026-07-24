const mongoose = require('mongoose');

const itemCompraSchema = new mongoose.Schema({
  insumo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Insumo',
    required: true
  },
  cantidad: {
    type: Number,
    required: true
  },
  costoTotal: {
    type: Number,
    required: true
  }
}, { _id: false });

const compraSchema = new mongoose.Schema({
  proveedor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Proveedor'
  },
  items: [itemCompraSchema],
  total: {
    type: Number,
    required: true
  },
  fecha: {
    type: Date,
    default: Date.now
  },
  notas: String
}, { timestamps: true });

module.exports = mongoose.model('Compra', compraSchema);
