const mongoose = require('mongoose');

// Documento único (siempre el mismo _id fijo) para ajustes globales del sistema.
// Por ahora solo trae el interruptor de pausar la impresión automática.
const configuracionSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  impresionPausada: { type: Boolean, default: false }
}, { timestamps: true });

configuracionSchema.statics.obtener = async function () {
  let config = await this.findById('global');
  if (!config) config = await this.create({ _id: 'global' });
  return config;
};

module.exports = mongoose.model('Configuracion', configuracionSchema);
