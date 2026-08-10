const mongoose = require('mongoose');

const itemPedidoSchema = new mongoose.Schema({
  producto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Producto',
    required: true
  },
  varianteNombre: {
    type: String, // ej. "Chico", "Mediano", "Bola" — vacío si el producto no tiene tamaños
    default: ''
  },
  precioUnitario: {
    type: Number, // precio congelado al momento de agregarlo (protege el historial de cambios de precio)
    required: true
  },
  pesoGramos: {
    type: Number, // solo si la variante es "por peso": cuántos gramos se vendieron realmente (ej. 450)
    default: null
  },
  cantidad: {
    type: Number,
    required: true,
    default: 1
  },
  notas: String, // ej. "sin cebolla", "extra picante"
  estado: {
    type: String,
    enum: ['pendiente', 'preparando', 'listo', 'entregado', 'cancelado'],
    default: 'pendiente'
  }
}, { timestamps: true });

const pedidoSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['mesa', 'para_llevar'],
    default: 'mesa'
  },
  mesa: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mesa',
    required: function () { return this.tipo === 'mesa'; }
  },
  // Otras mesas que se unieron a esta (ej. grupo grande que ocupa 2-3 mesas juntas).
  // "mesa" sigue siendo la principal — aquí van las que se le pegaron.
  mesasAdicionales: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Mesa'
  }],
  clienteLlevar: {
    type: String, // nombre/referencia del cliente cuando es pedido "para llevar"
    default: ''
  },
  mesero: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Usuario',
    required: true
  },
  items: [itemPedidoSchema],
  estadoCuenta: {
    type: String,
    enum: ['abierta', 'cerrada', 'cancelada'],
    default: 'abierta'
  },
  notaGeneral: {
    type: String,
    default: ''
  },
  pagos: [{
    monto: Number,
    metodoPago: String,
    tipoTarjeta: { type: String, enum: ['debito', 'credito', null], default: null }, // solo si metodoPago === 'tarjeta'
    persona: String, // etiqueta opcional, ej. "Persona 1"
    fecha: { type: Date, default: Date.now }
  }],
  total: {
    type: Number,
    default: 0
  },
  metodoPago: {
    type: String,
    enum: ['efectivo', 'tarjeta', 'mixto', null],
    default: null
  },
  tipoTarjeta: { type: String, enum: ['debito', 'credito', null], default: null }, // débito o crédito, cuando metodoPago incluye tarjeta
  montoEfectivo: { type: Number, default: 0 }, // solo se usa cuando metodoPago === 'mixto'
  montoTarjeta: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Pedido', pedidoSchema);