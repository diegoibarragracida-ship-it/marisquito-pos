// resetear-ventas.js
// Borra TODO el historial de ventas, comandas, cortes de caja, gastos y la cola/historial de
// impresión, y deja las mesas en "libre". Esto NO toca: productos, categorías, insumos,
// usuarios, promociones, proveedores, reservaciones ni compras.
//
// Uso:
//   node resetear-ventas.js            -> pide confirmación antes de borrar
//   node resetear-ventas.js --si       -> borra sin preguntar (para automatizar)

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');

const Pedido = require('./models/Pedido');
const CorteCaja = require('./models/CorteCaja');
const ColaImpresion = require('./models/ColaImpresion');
const Mesa = require('./models/Mesa');
const Gasto = require('./models/Gasto');

async function confirmar(pregunta) {
  if (process.argv.includes('--si')) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(pregunta, respuesta => {
      rl.close();
      resolve(respuesta.trim().toLowerCase() === 'si');
    });
  });
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('ERROR: no encuentro MONGO_URI. Corre este script desde la carpeta donde está tu .env (junto a server.js).');
    process.exit(1);
  }

  console.log('Conectando a la base de datos...');
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  } catch (err) {
    console.error('No se pudo conectar a la base de datos:', err.message);
    console.error('Revisa tu conexión a internet y que tu IP esté permitida en MongoDB Atlas (Network Access).');
    process.exit(1);
  }
  console.log('Conectado a la base de datos.');

  const [totalPedidos, totalCortes, totalImpresion, totalGastos] = await Promise.all([
    Pedido.countDocuments(),
    CorteCaja.countDocuments(),
    ColaImpresion.countDocuments(),
    Gasto.countDocuments()
  ]);

  console.log('\nEsto se va a borrar:');
  console.log(`  - ${totalPedidos} pedidos (ventas/comandas)`);
  console.log(`  - ${totalCortes} cortes de caja`);
  console.log(`  - ${totalImpresion} registros de la cola/historial de impresión`);
  console.log(`  - ${totalGastos} gastos`);
  console.log('  - Todas las mesas quedarán en estado "libre"');
  console.log('\nNO se toca: productos, categorías, insumos, usuarios, promociones, proveedores, reservaciones ni compras.\n');

  const ok = await confirmar('¿Seguro que quieres borrar todo esto? Escribe "si" para continuar: ');
  if (!ok) {
    console.log('Cancelado, no se borró nada.');
    await mongoose.disconnect();
    return;
  }

  const [resPedidos, resCortes, resImpresion, resMesas, resGastos] = await Promise.all([
    Pedido.deleteMany({}),
    CorteCaja.deleteMany({}),
    ColaImpresion.deleteMany({}),
    Mesa.updateMany({}, { estado: 'libre', $unset: { meseroActual: '' } }),
    Gasto.deleteMany({})
  ]);

  console.log('\nListo:');
  console.log(`  - Pedidos borrados: ${resPedidos.deletedCount}`);
  console.log(`  - Cortes borrados: ${resCortes.deletedCount}`);
  console.log(`  - Registros de impresión borrados: ${resImpresion.deletedCount}`);
  console.log(`  - Mesas puestas en "libre": ${resMesas.modifiedCount}`);
  console.log(`  - Gastos borrados: ${resGastos.deletedCount}`);
  console.log('\nSistema en ceros para ventas, comandas, cortes y gastos.');

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});