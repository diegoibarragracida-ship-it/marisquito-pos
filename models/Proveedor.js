const mongoose = require('mongoose');

const proveedorSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    trim: true
  },
  contacto: String, // nombre de la persona de contacto
  telefono: String,
  productosQueSurte: String, // texto libre, ej. "camarón, pulpo, pescado"
  notas: String
}, { timestamps: true });

module.exports = mongoose.model('Proveedor', proveedorSchema);
