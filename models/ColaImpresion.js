const mongoose = require('mongoose');

const colaImpresionSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ['comanda', 'ticket'],
    required: true
  },
  html: {
    type: String, // el ticket/comanda ya renderizado, listo para imprimir tal cual
    required: true
  },
  estado: {
    type: String,
    enum: ['pendiente', 'impreso'],
    default: 'pendiente'
  },
  estacion: {
    type: String,
    enum: ['cocina', 'barra', 'admin']
    // 'cocina'  -> SOLO la consola de Cocina (nunca cuentas, nunca barra)
    // 'barra'   -> comandas de bebidas/cocteles: las recoge la estación Barra, Admin o Caja
    //              (cualquiera de las 3 que esté abierta primero). Admin y Caja lo hacen en
    //              "modo botón" (requiereToque:true) para no robarle en silencio el ticket
    //              a la impresora física de Barra sin que nadie decida imprimirlo ahí.
    // 'admin'   -> cuentas/tickets: las recoge Admin o Caja (la que esté abierta primero)
    // sin valor -> compatibilidad vieja, se imprime en cualquier estación
  }
}, { timestamps: true });

module.exports = mongoose.model('ColaImpresion', colaImpresionSchema);