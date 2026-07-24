// Carga masiva de TODO el menú de El Marisquito: categorías, insumos base
// para los cócteles, y todos los productos (incluyendo los cócteles con sus
// 3 tamaños: Chico / Mediano / Bola).
//
// Es seguro correrlo más de una vez: si una categoría, insumo o producto ya
// existe (mismo nombre), lo deja igual en vez de duplicarlo.
//
// Uso: node importar-menu.js

require('dotenv').config();
const mongoose = require('mongoose');
const Categoria = require('./models/Categoria');
const Insumo = require('./models/Insumo');
const Producto = require('./models/Producto');

/* ======================================================================
   1) CATEGORÍAS (en el orden en que quieres que aparezcan en el menú)
   ====================================================================== */
const CATEGORIAS = [
  'Cocteles',
  'Entradas',
  'Especialidades',
  'Carnes',
  'Extras',
  'Postres',
  'Bebidas',
  'Refrescos',
  'Cervezas'
];

/* ======================================================================
   2) INSUMOS base para armar la receta de los cócteles.
   ⚠️ Los costoUnitario y stockActual son ESTIMADOS — ajústalos en
   Admin > Inventario con tus costos y existencias reales.
   ====================================================================== */
const INSUMOS = [
  { nombre: 'Camarón',        unidad: 'g',     stockActual: 8000, stockMinimo: 1000, costoUnitario: 0.16 },
  { nombre: 'Pulpo',          unidad: 'g',     stockActual: 6000, stockMinimo: 1000, costoUnitario: 0.14 },
  { nombre: 'Jaiba (pulpa)',  unidad: 'g',     stockActual: 5000, stockMinimo: 1000, costoUnitario: 0.20 },
  { nombre: 'Caracol',        unidad: 'g',     stockActual: 5000, stockMinimo: 1000, costoUnitario: 0.18 },
  { nombre: 'Salsa cóctel',   unidad: 'ml',    stockActual: 10000, stockMinimo: 1000, costoUnitario: 0.02 },
  { nombre: 'Limón',          unidad: 'pieza', stockActual: 300,  stockMinimo: 30,   costoUnitario: 2 },
  { nombre: 'Cebolla',        unidad: 'g',     stockActual: 5000, stockMinimo: 500,  costoUnitario: 0.02 },
  { nombre: 'Cilantro',       unidad: 'g',     stockActual: 2000, stockMinimo: 200,  costoUnitario: 0.05 },
  { nombre: 'Aguacate',       unidad: 'pieza', stockActual: 100,  stockMinimo: 10,   costoUnitario: 8 }
];

/* ======================================================================
   3) CÓCTELES — cada uno con 3 tamaños y su receta estimada.
   Las cantidades escalan chico → mediano → bola. Son un punto de partida
   razonable; ajústalas según tus porciones reales desde Admin > Recetas
   una vez importado (ahí puedes editar cada variante).
   ====================================================================== */

// receta "de acompañamiento" que lleva CUALQUIER cóctel, según tamaño
function acompanamiento(tam) {
  const porTamano = {
    Chico:   { salsa: 150, limon: 1, cebolla: 15, cilantro: 5 },
    Mediano: { salsa: 200, limon: 1, cebolla: 20, cilantro: 8 },
    Bola:    { salsa: 280, limon: 2, cebolla: 30, cilantro: 12 }
  };
  const c = porTamano[tam];
  return [
    { insumoNombre: 'Salsa cóctel', cantidad: c.salsa },
    { insumoNombre: 'Limón', cantidad: c.limon },
    { insumoNombre: 'Cebolla', cantidad: c.cebolla },
    { insumoNombre: 'Cilantro', cantidad: c.cilantro }
  ];
}

// ingredientes principales por tamaño, en gramos: { Chico, Mediano, Bola }
const COCTELES = [
  {
    nombre: 'Cóctel de Camarón',
    precios: { Chico: 131, Mediano: 176, Bola: 214 },
    principal: { 'Camarón': { Chico: 120, Mediano: 170, Bola: 260 } }
  },
  {
    nombre: 'Cóctel de Pulpo',
    precios: { Chico: 145, Mediano: 178, Bola: 254 },
    principal: { 'Pulpo': { Chico: 130, Mediano: 180, Bola: 270 } }
  },
  {
    nombre: 'Cóctel de Jaiba',
    precios: { Chico: 143, Mediano: 175, Bola: 259 },
    principal: { 'Jaiba (pulpa)': { Chico: 110, Mediano: 160, Bola: 240 } }
  },
  {
    nombre: 'Cóctel de Caracol',
    precios: { Chico: 141, Mediano: 172, Bola: 255 },
    principal: { 'Caracol': { Chico: 110, Mediano: 160, Bola: 240 } }
  },
  {
    nombre: 'Cóctel Camarón y Pulpo',
    precios: { Chico: 141, Mediano: 181, Bola: 239 },
    principal: {
      'Camarón': { Chico: 65, Mediano: 90, Bola: 135 },
      'Pulpo':   { Chico: 65, Mediano: 90, Bola: 135 }
    }
  },
  {
    nombre: 'Cóctel Camarón y Jaiba',
    precios: { Chico: 139, Mediano: 178, Bola: 236 },
    principal: {
      'Camarón':       { Chico: 60, Mediano: 85, Bola: 130 },
      'Jaiba (pulpa)': { Chico: 60, Mediano: 85, Bola: 130 }
    }
  },
  {
    nombre: 'Cóctel Caracol y Camarón',
    precios: { Chico: 139, Mediano: 176, Bola: 234 },
    principal: {
      'Caracol': { Chico: 60, Mediano: 85, Bola: 130 },
      'Camarón': { Chico: 60, Mediano: 85, Bola: 130 }
    }
  },
  {
    nombre: 'Vuelve a la Vida',
    precios: { Chico: 109, Mediano: 142, Bola: 179 },
    principal: {
      'Camarón':       { Chico: 40, Mediano: 55, Bola: 85 },
      'Pulpo':         { Chico: 40, Mediano: 55, Bola: 85 },
      'Jaiba (pulpa)': { Chico: 30, Mediano: 40, Bola: 65 },
      'Caracol':       { Chico: 30, Mediano: 40, Bola: 65 }
    }
  }
];

/* ======================================================================
   4) RESTO DEL MENÚ — se importa con precio y categoría correctos.
   No llevan receta todavía (queda en $0 de costo) porque tú conoces las
   porciones reales; asígnaselas después desde Admin > Inventario > Recetas
   con calma, producto por producto.
   ====================================================================== */
const ENTRADAS = [
  ['Arroz con plátanos fritos', 61],
  ['Spaguetti con queso', 64],
  ['Arroz con camarón', 126],
  ['Spaguetti con camarón', 126],
  ['Orden de guacamole', 73],
  ['Tostadas de camarón', 182],
  ['Tostadas de cazón', 131],
  ['Tostadas de pollo', 141],
  ['Orden de papas', 69],
  ['Orden de frijolitos', 64]
];

const ESPECIALIDADES = [
  ['Camarones al gusto', 296],
  ['Pulpos al gusto', 299],
  ['Posta Robelo al gusto', 179],
  ['Torta de Camarón', 265],
  ['Torta de Mariscos', 255],
  ['Filete Sol', 230],
  ['Filete a la Plancha', 175],
  ['Filete Empanizado', 188],
  ['Ensalada de mariscos', 198],
  ['Ensalada de camarón', 220],
  ['Sopa de mariscos', 181],
  ['Cazuela de mariscos', 203],
  ['Chilpachole de camarón chico', 153],
  ['Chilpachole de camarón grande', 163],
  ['Chilpachole de jaiba', 169],
  ['Chilpachole de robalo', 181],
  ['Chilpachole cabeza de robalo', 141],
  ['Promo: Cabecita de pescado + Vuelve a la vida chico', 109]
  // Nota: "Mojarra al gusto" no se importó porque su precio es "según tamaño"
  // (variable) — agrégala manualmente desde Admin, o pídeme que la haga
  // como producto con variantes si me dices los precios por tamaño.
];

const CARNES = [
  ['Filete asado de res', 257],
  ['Arrachera con papas', 327],
  ['Tampiqueña', 335],
  ['Milanesa de res', 225],
  ['Milanesa de pollo', 222],
  ['Pechuga a la plancha', 202]
];

const EXTRAS = [
  ['Filetito de pescado con arroz', 75],
  ['Tacita de caldo de cabeza', 45],
  ['Orden de totopos', 32],
  ['Orden de tortillas', 16],
  ['Salsa chipotle', 18],
  ['Mayonesa', 18],
  ['Galleta salada', 4]
];

const POSTRES = [
  ['Plátanos fritos', 75],
  ['Duraznos', 75]
];

const BEBIDAS = [
  ['Vaso de horchata de coco', 46],
  ['Vaso de agua de jamaica', 35],
  ['Jarra de horchata de coco', 145],
  ['Jarra de agua de jamaica', 115],
  ['Licuado de fresa', 46],
  ['Licuado de nuez', 55],
  ['Licuado de vainilla', 46],
  ['Chocomilk', 46],
  ['Café con leche', 44],
  ['Leche para nescafé', 49],
  ['Café de olla', 29],
  ['Chocolate', 55],
  ['Té', 23]
];

const REFRESCOS = [
  ['Coca Cola', 39],
  ['Coca Cola Zero', 39],
  ['Sangría Casera', 36],
  ['Boing de sabores', 39],
  ['Peñafiel Naranjada', 36],
  ['Peñafiel Limonada', 36],
  ['Peñafiel Mineral', 36],
  ['Manzanita', 20],
  ['Agua embotellada', 17]
];

const CERVEZAS = [
  ['Corona', 43],
  ['XX Lager', 43],
  ['XX Ámbar', 43],
  ['Superior', 43],
  ['Heineken Cero', 43],
  ['Indio', 46],
  ['Negra Modelo', 46]
];

/* ======================================================================
   Lógica del importador — no hace falta tocar nada de aquí para abajo
   ====================================================================== */

async function upsertCategoria(nombre, orden) {
  return Categoria.findOneAndUpdate(
    { nombre },
    { nombre, orden, activa: true },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function upsertInsumo(datos) {
  return Insumo.findOneAndUpdate(
    { nombre: datos.nombre },
    { $setOnInsert: datos },
    { new: true, upsert: true }
  );
}

async function upsertProductoSimple(nombre, precio, categoriaId) {
  const existe = await Producto.findOne({ nombre });
  if (existe) {
    console.log(`  - "${nombre}" ya existe, se dejó igual.`);
    return existe;
  }
  const creado = await Producto.create({ nombre, precio, categoria: categoriaId, receta: [] });
  console.log(`  - Creado: ${nombre} ($${precio})`);
  return creado;
}

async function importar() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Conectado a MongoDB Atlas\n');

  // 1) Categorías
  console.log('== Categorías ==');
  const catIds = {};
  for (let i = 0; i < CATEGORIAS.length; i++) {
    const cat = await upsertCategoria(CATEGORIAS[i], i);
    catIds[CATEGORIAS[i]] = cat._id;
    console.log(`  - ${CATEGORIAS[i]}`);
  }

  // 2) Insumos
  console.log('\n== Insumos base para cócteles ==');
  const insumoIds = {};
  for (const datos of INSUMOS) {
    const insumo = await upsertInsumo(datos);
    insumoIds[datos.nombre] = insumo._id;
    console.log(`  - ${datos.nombre}`);
  }

  // 3) Cócteles con variantes de tamaño
  console.log('\n== Cócteles (con tamaños Chico/Mediano/Bola) ==');
  for (const coctel of COCTELES) {
    const existe = await Producto.findOne({ nombre: coctel.nombre });
    if (existe) {
      console.log(`  - "${coctel.nombre}" ya existe, se dejó igual.`);
      continue;
    }

    const variantes = ['Chico', 'Mediano', 'Bola'].map(tam => {
      const receta = [];
      for (const [insumoNombre, cantidades] of Object.entries(coctel.principal)) {
        receta.push({ insumo: insumoIds[insumoNombre], cantidad: cantidades[tam] });
      }
      for (const extra of acompanamiento(tam)) {
        receta.push({ insumo: insumoIds[extra.insumoNombre], cantidad: extra.cantidad });
      }
      return { nombre: tam, precio: coctel.precios[tam], receta };
    });

    await Producto.create({
      nombre: coctel.nombre,
      categoria: catIds['Cocteles'],
      variantes
    });
    console.log(`  - Creado: ${coctel.nombre} (Chico $${coctel.precios.Chico} / Mediano $${coctel.precios.Mediano} / Bola $${coctel.precios.Bola})`);
  }

  // 4) Resto del menú (sin receta todavía)
  const grupos = [
    ['Entradas', ENTRADAS],
    ['Especialidades', ESPECIALIDADES],
    ['Carnes', CARNES],
    ['Extras', EXTRAS],
    ['Postres', POSTRES],
    ['Bebidas', BEBIDAS],
    ['Refrescos', REFRESCOS],
    ['Cervezas', CERVEZAS]
  ];

  for (const [nombreCategoria, items] of grupos) {
    console.log(`\n== ${nombreCategoria} ==`);
    for (const [nombre, precio] of items) {
      await upsertProductoSimple(nombre, precio, catIds[nombreCategoria]);
    }
  }

  console.log('\nListo. Todo el menú quedó importado.');
  console.log('Pendiente: asignar recetas/insumos al resto de los platillos desde Admin > Inventario > Recetas, cuando tengas tiempo.');
  process.exit(0);
}

importar().catch(err => {
  console.error('Error importando el menú:', err.message);
  process.exit(1);
});
