`// Borra TODAS las órdenes (pedidos/comandas) y el historial de impresión.`
`// No toca productos, insumos, usuarios, gastos, compras, ni nada más.`
`// Uso: node resetear-ordenes.js`
`require('dotenv').config();`
`const mongoose = require('mongoose');`
`const Pedido = require('./models/Pedido');`
`const ColaImpresion = require('./models/ColaImpresion');`
`const Mesa = require('./models/Mesa');`
` `
`async function resetear() {`
`await mongoose.connect(process.env.MONGO_URI);`
`console.log('Conectado a MongoDB Atlas');`
` `
`const pedidosBorrados = await Pedido.deleteMany({});`
`console.log(`Pedidos borrados: ${pedidosBorrados.deletedCount}`);`
` `
`const impresionBorrada = await ColaImpresion.deleteMany({});`
`console.log(`Trabajos de impresión borrados: ${impresionBorrada.deletedCount}`);`
` `
`const mesasActualizadas = await Mesa.updateMany(`
`{},`
`{ estado: 'libre', meseroActual: null }`
`);`
`console.log(`Mesas puestas en "libre": ${mesasActualizadas.modifiedCount}`);`
` `
`console.log('\nListo. Todo lo demás (productos, insumos, usuarios, gastos, etc.) sigue intacto.');`
`process.exit(0);`
`}`
` `
`resetear().catch(err => {`
`console.error('Error al resetear las órdenes:', err.message);`
`process.exit(1);`
`});`
`  `