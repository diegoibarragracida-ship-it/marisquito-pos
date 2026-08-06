const mongoose = require('mongoose');

// Solo GUARDA los datos para que después, aparte, se facture con otro sistema
// (no timbra nada ante el SAT). Se autoborra sola a los 15 días de creada usando
// un índice TTL de MongoDB — no depende de ningún cron ni de que el servidor
// esté prendido en un momento exacto.
const facturaSchema = new mongoose.Schema({
  pedido: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pedido',
    required: true
  },
  total: Number, // monto de la venta al momento de pedir la factura (referencia rápida)
  rfc: { type: String, required: true, trim: true, uppercase: true },
  razonSocial: { type: String, required: true, trim: true },
  domicilioFiscal: { type: String, required: true, trim: true },
  regimenFiscal: { type: String, required: true, trim: true },
  usoCFDI: { type: String, required: true, trim: true },
  correo: { type: String, required: true, trim: true, lowercase: true },
  formaPago: { type: String, required: true, trim: true }, // catálogo SAT: Efectivo, Transferencia, Tarjeta de crédito, Tarjeta de débito, etc.
  solicitadaPor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario'
  }
}, { timestamps: true });

// Índice TTL: MongoDB borra el documento solo 15 días (15*24*3600 seg) después de createdAt
facturaSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15 * 24 * 60 * 60 });

module.exports = mongoose.model('Factura', facturaSchema);
