// eliminar-duplicados-mojarra.js
// Borra todos los productos del menú llamados "Mojarra frita" (con cualquier precio o
// sufijo, ej. "Mojarra frita 80") y deja intacto el producto "Mojarra" ($0) donde vas
// a configurar las variantes Frita/Preparada por peso.
//
// Uso:
//   node eliminar-duplicados-mojarra.js            -> te muestra la lista y pide confirmación
//   node eliminar-duplicados-mojarra.js --si        -> borra sin preguntar

require('dotenv').config();
const mongoose = require('mongoose');
const readline = require('readline');
const Producto = require('./models/Producto');

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
    console.error('ERROR: no encuentro MONGO_URI. Corre esto desde la carpeta donde está tu .env (junto a server.js).');
    process.exit(1);
  }

  console.log('Conectando a la base de datos...');
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  } catch (err) {
    console.error('No se pudo conectar:', err.message);
    process.exit(1);
  }
  console.log('Conectado.\n');

  // Cualquier producto que EMPIECE con "Mojarra frita" (cubre "Mojarra frita 80", etc.)
  // pero NUNCA el producto exacto "Mojarra" solo -- ese se queda intacto.
  const duplicados = await Producto.find({ nombre: /^mojarra frita/i });

  if (duplicados.length === 0) {
    console.log('No encontré ningún producto que empiece con "Mojarra frita". No hay nada que borrar.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Encontré ${duplicados.length} productos para borrar:`);
  duplicados.forEach(p => console.log(`  - "${p.nombre}" · $${p.precio}`));
  console.log('\nEl producto "Mojarra" (el de $0) NO se toca.\n');

  const ok = await confirmar('¿Borrar todos los de arriba? Escribe "si" para continuar: ');
  if (!ok) {
    console.log('Cancelado, no se borró nada.');
    await mongoose.disconnect();
    return;
  }

  const res = await Producto.deleteMany({ nombre: /^mojarra frita/i });
  console.log(`\nListo: se borraron ${res.deletedCount} productos.`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
