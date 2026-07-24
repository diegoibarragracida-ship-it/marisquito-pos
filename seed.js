// Script único para crear usuarios de prueba (uno por rol).
// Uso: node seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const Usuario = require('./models/Usuario');

const USUARIOS_PRUEBA = [
  { nombre: 'Administrador', usuario: 'admin', password: 'admin123', rol: 'admin' },
  { nombre: 'Mesero Uno', usuario: 'mesero1', password: 'mesero123', rol: 'mesero' },
  { nombre: 'Cajero Uno', usuario: 'cajero1', password: 'cajero123', rol: 'cajero' },
  { nombre: 'Cocina Uno', usuario: 'cocina1', password: 'cocina123', rol: 'cocina' }
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Conectado a MongoDB Atlas');

  for (const datos of USUARIOS_PRUEBA) {
    const existe = await Usuario.findOne({ usuario: datos.usuario });
    if (existe) {
      console.log(`- "${datos.usuario}" ya existe, se dejó igual.`);
      continue;
    }
    await Usuario.create(datos);
    console.log(`- Usuario creado: ${datos.usuario} / ${datos.password} (rol: ${datos.rol})`);
  }

  console.log('\nListo. Cambia estas contraseñas antes de usar el sistema en producción.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Error creando usuarios:', err.message);
  process.exit(1);
});
