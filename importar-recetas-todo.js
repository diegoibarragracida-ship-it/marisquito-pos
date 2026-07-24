// Carga masiva de INSUMOS y RECETAS para todo el menú que aún no las tenía:
// Entradas, Especialidades, Carnes, Extras, Postres, Bebidas, Refrescos y Cervezas.
// (Los cócteles ya traían su receta desde importar-menu.js — este script no los toca.)
//
// Es seguro correrlo más de una vez:
//  - Si un insumo ya existe (mismo nombre), lo deja igual (no lo duplica ni pisa su stock).
//  - Si un producto YA tiene receta cargada (porque tú la editaste a mano desde Admin),
//    este script NO la sobreescribe — la respeta y la salta.
//
// ⚠️ Las cantidades son ESTIMADAS a partir de porciones típicas de este tipo de
// platillos. Son un punto de partida razonable para que el sistema empiece a
// descontar inventario y calcular costos/márgenes — ajústalas producto por
// producto desde Admin > Inventario > Recetas cuando tengas tiempo, con tus
// porciones reales.
//
// Uso: node importar-recetas-todo.js

require('dotenv').config();
const mongoose = require('mongoose');
const Insumo = require('./models/Insumo');
const Producto = require('./models/Producto');

/* ======================================================================
   1) INSUMOS NUEVOS (los de cócteles ya existen: Camarón, Pulpo,
   Jaiba (pulpa), Caracol, Salsa cóctel, Limón, Cebolla, Cilantro, Aguacate)
   ====================================================================== */
const INSUMOS_NUEVOS = [
  // Proteínas / mariscos adicionales
  { nombre: 'Cazón deshebrado',     unidad: 'g',     stockActual: 3000, stockMinimo: 500, costoUnitario: 0.12 },
  { nombre: 'Pollo deshebrado',     unidad: 'g',     stockActual: 4000, stockMinimo: 500, costoUnitario: 0.08 },
  { nombre: 'Pechuga de pollo',     unidad: 'g',     stockActual: 5000, stockMinimo: 500, costoUnitario: 0.09 },
  { nombre: 'Filete de pescado',    unidad: 'g',     stockActual: 6000, stockMinimo: 1000, costoUnitario: 0.15 },
  { nombre: 'Posta de robalo',      unidad: 'g',     stockActual: 5000, stockMinimo: 1000, costoUnitario: 0.17 },
  { nombre: 'Cabeza de robalo',     unidad: 'pieza', stockActual: 30,   stockMinimo: 5,   costoUnitario: 20 },
  { nombre: 'Filete de res',        unidad: 'g',     stockActual: 6000, stockMinimo: 1000, costoUnitario: 0.13 },
  { nombre: 'Arrachera',            unidad: 'g',     stockActual: 6000, stockMinimo: 1000, costoUnitario: 0.16 },
  { nombre: 'Milanesa de res',      unidad: 'g',     stockActual: 5000, stockMinimo: 1000, costoUnitario: 0.11 },
  { nombre: 'Milanesa de pollo',    unidad: 'g',     stockActual: 5000, stockMinimo: 1000, costoUnitario: 0.09 },

  // Carbohidratos / guarniciones
  { nombre: 'Arroz',                unidad: 'g',     stockActual: 10000, stockMinimo: 1000, costoUnitario: 0.02 },
  { nombre: 'Spaghetti',            unidad: 'g',     stockActual: 5000,  stockMinimo: 500,  costoUnitario: 0.025 },
  { nombre: 'Papa',                 unidad: 'g',     stockActual: 8000,  stockMinimo: 1000, costoUnitario: 0.02 },
  { nombre: 'Frijol',               unidad: 'g',     stockActual: 6000,  stockMinimo: 1000, costoUnitario: 0.03 },
  { nombre: 'Tostada',              unidad: 'pieza',  stockActual: 300,   stockMinimo: 50,   costoUnitario: 1.5 },
  { nombre: 'Tortilla de maíz',     unidad: 'pieza',  stockActual: 500,   stockMinimo: 100,  costoUnitario: 0.8 },
  { nombre: 'Totopos',              unidad: 'g',     stockActual: 5000,  stockMinimo: 500,  costoUnitario: 0.03 },
  { nombre: 'Pan para torta',       unidad: 'pieza',  stockActual: 100,   stockMinimo: 10,   costoUnitario: 6 },
  { nombre: 'Pan molido',           unidad: 'g',     stockActual: 3000,  stockMinimo: 500,  costoUnitario: 0.03 },
  { nombre: 'Huevo',                unidad: 'pieza',  stockActual: 200,   stockMinimo: 24,   costoUnitario: 3 },

  // Verduras / sazonadores extra
  { nombre: 'Jitomate',             unidad: 'g',     stockActual: 5000, stockMinimo: 500, costoUnitario: 0.03 },
  { nombre: 'Chile serrano',        unidad: 'g',     stockActual: 1000, stockMinimo: 100, costoUnitario: 0.06 },
  { nombre: 'Chile chipotle',       unidad: 'g',     stockActual: 1500, stockMinimo: 200, costoUnitario: 0.07 },
  { nombre: 'Lechuga',              unidad: 'g',     stockActual: 3000, stockMinimo: 500, costoUnitario: 0.02 },
  { nombre: 'Plátano macho',        unidad: 'pieza',  stockActual: 100,   stockMinimo: 10,  costoUnitario: 6 },
  { nombre: 'Queso',                unidad: 'g',     stockActual: 3000, stockMinimo: 300, costoUnitario: 0.12 },
  { nombre: 'Aceite',               unidad: 'ml',    stockActual: 10000, stockMinimo: 1000, costoUnitario: 0.03 },
  { nombre: 'Caldo de mariscos',    unidad: 'ml',    stockActual: 15000, stockMinimo: 2000, costoUnitario: 0.02 },
  { nombre: 'Salsa chipotle prep.', unidad: 'g',     stockActual: 3000, stockMinimo: 300, costoUnitario: 0.06 },
  { nombre: 'Mayonesa',             unidad: 'g',     stockActual: 3000, stockMinimo: 300, costoUnitario: 0.05 },
  { nombre: 'Galleta salada',       unidad: 'pieza',  stockActual: 400,   stockMinimo: 50,  costoUnitario: 0.6 },

  // Postres / bebidas
  { nombre: 'Durazno en almíbar',   unidad: 'g',     stockActual: 3000, stockMinimo: 300, costoUnitario: 0.05 },
  { nombre: 'Horchata de coco',     unidad: 'ml',    stockActual: 10000, stockMinimo: 1000, costoUnitario: 0.015 },
  { nombre: 'Agua de jamaica',      unidad: 'ml',    stockActual: 10000, stockMinimo: 1000, costoUnitario: 0.01 },
  { nombre: 'Leche',                unidad: 'ml',    stockActual: 8000,  stockMinimo: 1000, costoUnitario: 0.015 },
  { nombre: 'Fresa',                unidad: 'g',     stockActual: 2000, stockMinimo: 300, costoUnitario: 0.06 },
  { nombre: 'Nuez',                 unidad: 'g',     stockActual: 1500, stockMinimo: 200, costoUnitario: 0.15 },
  { nombre: 'Esencia de vainilla',  unidad: 'ml',    stockActual: 500,   stockMinimo: 50,  costoUnitario: 0.3 },
  { nombre: 'Chocolate en polvo',   unidad: 'g',     stockActual: 2000, stockMinimo: 300, costoUnitario: 0.08 },
  { nombre: 'Café molido',          unidad: 'g',     stockActual: 2000, stockMinimo: 300, costoUnitario: 0.15 },
  { nombre: 'Piloncillo',           unidad: 'g',     stockActual: 2000, stockMinimo: 300, costoUnitario: 0.03 },
  { nombre: 'Canela',               unidad: 'g',     stockActual: 500,   stockMinimo: 50,  costoUnitario: 0.1 },
  { nombre: 'Nescafé',              unidad: 'g',     stockActual: 500,   stockMinimo: 50,  costoUnitario: 0.2 },
  { nombre: 'Bolsita de té',        unidad: 'pieza',  stockActual: 200,   stockMinimo: 20,  costoUnitario: 1.2 },

  // Refrescos embotellados (cada uno es su propio insumo: 1 pieza = 1 unidad vendida)
  { nombre: 'Coca Cola (botella)',        unidad: 'pieza', stockActual: 60, stockMinimo: 12, costoUnitario: 15 },
  { nombre: 'Coca Cola Zero (botella)',   unidad: 'pieza', stockActual: 40, stockMinimo: 12, costoUnitario: 15 },
  { nombre: 'Sangría Casera (botella)',   unidad: 'pieza', stockActual: 40, stockMinimo: 12, costoUnitario: 13 },
  { nombre: 'Boing de sabores (botella)', unidad: 'pieza', stockActual: 40, stockMinimo: 12, costoUnitario: 14 },
  { nombre: 'Peñafiel Naranjada (botella)', unidad: 'pieza', stockActual: 40, stockMinimo: 12, costoUnitario: 13 },
  { nombre: 'Peñafiel Limonada (botella)',  unidad: 'pieza', stockActual: 40, stockMinimo: 12, costoUnitario: 13 },
  { nombre: 'Peñafiel Mineral (botella)',   unidad: 'pieza', stockActual: 40, stockMinimo: 12, costoUnitario: 13 },
  { nombre: 'Manzanita (botella)',          unidad: 'pieza', stockActual: 40, stockMinimo: 12, costoUnitario: 8 },
  { nombre: 'Agua embotellada (botella)',   unidad: 'pieza', stockActual: 60, stockMinimo: 12, costoUnitario: 6 },

  // Cervezas (cada una es su propio insumo: 1 pieza = 1 unidad vendida)
  { nombre: 'Corona (cerveza)',        unidad: 'pieza', stockActual: 60, stockMinimo: 12, costoUnitario: 16 },
  { nombre: 'XX Lager (cerveza)',      unidad: 'pieza', stockActual: 60, stockMinimo: 12, costoUnitario: 16 },
  { nombre: 'XX Ámbar (cerveza)',      unidad: 'pieza', stockActual: 40, stockMinimo: 12, costoUnitario: 16 },
  { nombre: 'Superior (cerveza)',      unidad: 'pieza', stockActual: 40, stockMinimo: 12, costoUnitario: 15 },
  { nombre: 'Heineken Cero (cerveza)', unidad: 'pieza', stockActual: 30, stockMinimo: 12, costoUnitario: 17 },
  { nombre: 'Indio (cerveza)',         unidad: 'pieza', stockActual: 40, stockMinimo: 12, costoUnitario: 15 },
  { nombre: 'Negra Modelo (cerveza)',  unidad: 'pieza', stockActual: 40, stockMinimo: 12, costoUnitario: 16 }
];

/* ======================================================================
   2) RECETAS por producto: nombre EXACTO del producto (como quedó importado
   en importar-menu.js) -> lista de { insumoNombre, cantidad }
   ====================================================================== */
const RECETAS = {
  // --- Entradas ---
  'Arroz con plátanos fritos': [
    { insumoNombre: 'Arroz', cantidad: 200 },
    { insumoNombre: 'Plátano macho', cantidad: 1 },
    { insumoNombre: 'Aceite', cantidad: 20 }
  ],
  'Spaguetti con queso': [
    { insumoNombre: 'Spaghetti', cantidad: 150 },
    { insumoNombre: 'Queso', cantidad: 60 }
  ],
  'Arroz con camarón': [
    { insumoNombre: 'Arroz', cantidad: 180 },
    { insumoNombre: 'Camarón', cantidad: 80 }
  ],
  'Spaguetti con camarón': [
    { insumoNombre: 'Spaghetti', cantidad: 150 },
    { insumoNombre: 'Camarón', cantidad: 80 }
  ],
  'Orden de guacamole': [
    { insumoNombre: 'Aguacate', cantidad: 2 },
    { insumoNombre: 'Jitomate', cantidad: 50 },
    { insumoNombre: 'Cebolla', cantidad: 20 },
    { insumoNombre: 'Cilantro', cantidad: 5 },
    { insumoNombre: 'Limón', cantidad: 1 },
    { insumoNombre: 'Chile serrano', cantidad: 10 }
  ],
  'Tostadas de camarón': [
    { insumoNombre: 'Tostada', cantidad: 3 },
    { insumoNombre: 'Camarón', cantidad: 100 },
    { insumoNombre: 'Mayonesa', cantidad: 20 },
    { insumoNombre: 'Lechuga', cantidad: 30 }
  ],
  'Tostadas de cazón': [
    { insumoNombre: 'Tostada', cantidad: 3 },
    { insumoNombre: 'Cazón deshebrado', cantidad: 100 },
    { insumoNombre: 'Lechuga', cantidad: 20 }
  ],
  'Tostadas de pollo': [
    { insumoNombre: 'Tostada', cantidad: 3 },
    { insumoNombre: 'Pollo deshebrado', cantidad: 100 },
    { insumoNombre: 'Lechuga', cantidad: 20 }
  ],
  'Orden de papas': [
    { insumoNombre: 'Papa', cantidad: 250 },
    { insumoNombre: 'Aceite', cantidad: 20 }
  ],
  'Orden de frijolitos': [
    { insumoNombre: 'Frijol', cantidad: 200 }
  ],

  // --- Especialidades ---
  'Camarones al gusto': [
    { insumoNombre: 'Camarón', cantidad: 250 },
    { insumoNombre: 'Aceite', cantidad: 15 }
  ],
  'Pulpos al gusto': [
    { insumoNombre: 'Pulpo', cantidad: 280 },
    { insumoNombre: 'Aceite', cantidad: 15 }
  ],
  'Posta Robelo al gusto': [
    { insumoNombre: 'Posta de robalo', cantidad: 250 },
    { insumoNombre: 'Aceite', cantidad: 15 }
  ],
  'Torta de Camarón': [
    { insumoNombre: 'Pan para torta', cantidad: 1 },
    { insumoNombre: 'Camarón', cantidad: 120 },
    { insumoNombre: 'Aguacate', cantidad: 0.5 },
    { insumoNombre: 'Frijol', cantidad: 40 }
  ],
  'Torta de Mariscos': [
    { insumoNombre: 'Pan para torta', cantidad: 1 },
    { insumoNombre: 'Camarón', cantidad: 60 },
    { insumoNombre: 'Pulpo', cantidad: 60 },
    { insumoNombre: 'Frijol', cantidad: 40 }
  ],
  'Filete Sol': [
    { insumoNombre: 'Filete de pescado', cantidad: 220 },
    { insumoNombre: 'Camarón', cantidad: 40 }
  ],
  'Filete a la Plancha': [
    { insumoNombre: 'Filete de pescado', cantidad: 220 },
    { insumoNombre: 'Aceite', cantidad: 10 }
  ],
  'Filete Empanizado': [
    { insumoNombre: 'Filete de pescado', cantidad: 200 },
    { insumoNombre: 'Pan molido', cantidad: 50 },
    { insumoNombre: 'Huevo', cantidad: 1 },
    { insumoNombre: 'Aceite', cantidad: 30 }
  ],
  'Ensalada de mariscos': [
    { insumoNombre: 'Camarón', cantidad: 60 },
    { insumoNombre: 'Pulpo', cantidad: 60 },
    { insumoNombre: 'Jaiba (pulpa)', cantidad: 40 },
    { insumoNombre: 'Lechuga', cantidad: 80 },
    { insumoNombre: 'Jitomate', cantidad: 50 }
  ],
  'Ensalada de camarón': [
    { insumoNombre: 'Camarón', cantidad: 150 },
    { insumoNombre: 'Lechuga', cantidad: 100 },
    { insumoNombre: 'Jitomate', cantidad: 50 }
  ],
  'Sopa de mariscos': [
    { insumoNombre: 'Camarón', cantidad: 50 },
    { insumoNombre: 'Pulpo', cantidad: 40 },
    { insumoNombre: 'Jaiba (pulpa)', cantidad: 30 },
    { insumoNombre: 'Caldo de mariscos', cantidad: 300 }
  ],
  'Cazuela de mariscos': [
    { insumoNombre: 'Camarón', cantidad: 60 },
    { insumoNombre: 'Pulpo', cantidad: 50 },
    { insumoNombre: 'Jaiba (pulpa)', cantidad: 40 },
    { insumoNombre: 'Caracol', cantidad: 40 },
    { insumoNombre: 'Caldo de mariscos', cantidad: 250 }
  ],
  'Chilpachole de camarón chico': [
    { insumoNombre: 'Camarón', cantidad: 80 },
    { insumoNombre: 'Caldo de mariscos', cantidad: 250 },
    { insumoNombre: 'Chile chipotle', cantidad: 15 }
  ],
  'Chilpachole de camarón grande': [
    { insumoNombre: 'Camarón', cantidad: 140 },
    { insumoNombre: 'Caldo de mariscos', cantidad: 300 },
    { insumoNombre: 'Chile chipotle', cantidad: 20 }
  ],
  'Chilpachole de jaiba': [
    { insumoNombre: 'Jaiba (pulpa)', cantidad: 120 },
    { insumoNombre: 'Caldo de mariscos', cantidad: 280 },
    { insumoNombre: 'Chile chipotle', cantidad: 15 }
  ],
  'Chilpachole de robalo': [
    { insumoNombre: 'Posta de robalo', cantidad: 150 },
    { insumoNombre: 'Caldo de mariscos', cantidad: 280 },
    { insumoNombre: 'Chile chipotle', cantidad: 15 }
  ],
  'Chilpachole cabeza de robalo': [
    { insumoNombre: 'Cabeza de robalo', cantidad: 1 },
    { insumoNombre: 'Caldo de mariscos', cantidad: 250 },
    { insumoNombre: 'Chile chipotle', cantidad: 15 }
  ],
  'Promo: Cabecita de pescado + Vuelve a la vida chico': [
    { insumoNombre: 'Cabeza de robalo', cantidad: 1 },
    { insumoNombre: 'Caldo de mariscos', cantidad: 200 }
    // Nota: no incluye la receta del "Vuelve a la Vida chico" (ese descuento
    // ya vive en su propio producto/variante); si quieres que este combo
    // también descuente esos insumos automáticamente, lo ideal es marcarlo
    // como "esPaquete" con productosIncluidos en vez de receta manual — dímelo
    // y lo dejamos así.
  ],

  // --- Carnes ---
  'Filete asado de res': [
    { insumoNombre: 'Filete de res', cantidad: 220 }
  ],
  'Arrachera con papas': [
    { insumoNombre: 'Arrachera', cantidad: 220 },
    { insumoNombre: 'Papa', cantidad: 150 }
  ],
  'Tampiqueña': [
    { insumoNombre: 'Arrachera', cantidad: 150 },
    { insumoNombre: 'Queso', cantidad: 30 },
    { insumoNombre: 'Frijol', cantidad: 60 }
  ],
  'Milanesa de res': [
    { insumoNombre: 'Milanesa de res', cantidad: 200 },
    { insumoNombre: 'Pan molido', cantidad: 40 },
    { insumoNombre: 'Huevo', cantidad: 1 }
  ],
  'Milanesa de pollo': [
    { insumoNombre: 'Milanesa de pollo', cantidad: 200 },
    { insumoNombre: 'Pan molido', cantidad: 40 },
    { insumoNombre: 'Huevo', cantidad: 1 }
  ],
  'Pechuga a la plancha': [
    { insumoNombre: 'Pechuga de pollo', cantidad: 200 },
    { insumoNombre: 'Aceite', cantidad: 10 }
  ],

  // --- Extras ---
  'Filetito de pescado con arroz': [
    { insumoNombre: 'Filete de pescado', cantidad: 100 },
    { insumoNombre: 'Arroz', cantidad: 100 }
  ],
  'Tacita de caldo de cabeza': [
    { insumoNombre: 'Caldo de mariscos', cantidad: 150 }
  ],
  'Orden de totopos': [
    { insumoNombre: 'Totopos', cantidad: 100 }
  ],
  'Orden de tortillas': [
    { insumoNombre: 'Tortilla de maíz', cantidad: 6 }
  ],
  'Salsa chipotle': [
    { insumoNombre: 'Salsa chipotle prep.', cantidad: 60 }
  ],
  'Mayonesa': [
    { insumoNombre: 'Mayonesa', cantidad: 40 }
  ],
  'Galleta salada': [
    { insumoNombre: 'Galleta salada', cantidad: 4 }
  ],

  // --- Postres ---
  'Plátanos fritos': [
    { insumoNombre: 'Plátano macho', cantidad: 2 },
    { insumoNombre: 'Aceite', cantidad: 20 }
  ],
  'Duraznos': [
    { insumoNombre: 'Durazno en almíbar', cantidad: 200 }
  ],

  // --- Bebidas ---
  'Vaso de horchata de coco': [{ insumoNombre: 'Horchata de coco', cantidad: 300 }],
  'Vaso de agua de jamaica': [{ insumoNombre: 'Agua de jamaica', cantidad: 300 }],
  'Jarra de horchata de coco': [{ insumoNombre: 'Horchata de coco', cantidad: 1000 }],
  'Jarra de agua de jamaica': [{ insumoNombre: 'Agua de jamaica', cantidad: 1000 }],
  'Licuado de fresa': [
    { insumoNombre: 'Fresa', cantidad: 100 },
    { insumoNombre: 'Leche', cantidad: 250 }
  ],
  'Licuado de nuez': [
    { insumoNombre: 'Nuez', cantidad: 50 },
    { insumoNombre: 'Leche', cantidad: 250 }
  ],
  'Licuado de vainilla': [
    { insumoNombre: 'Leche', cantidad: 250 },
    { insumoNombre: 'Esencia de vainilla', cantidad: 5 }
  ],
  'Chocomilk': [
    { insumoNombre: 'Leche', cantidad: 250 },
    { insumoNombre: 'Chocolate en polvo', cantidad: 30 }
  ],
  'Café con leche': [
    { insumoNombre: 'Café molido', cantidad: 10 },
    { insumoNombre: 'Leche', cantidad: 150 }
  ],
  'Leche para nescafé': [
    { insumoNombre: 'Leche', cantidad: 200 },
    { insumoNombre: 'Nescafé', cantidad: 4 }
  ],
  'Café de olla': [
    { insumoNombre: 'Café molido', cantidad: 10 },
    { insumoNombre: 'Piloncillo', cantidad: 20 },
    { insumoNombre: 'Canela', cantidad: 1 }
  ],
  'Chocolate': [
    { insumoNombre: 'Chocolate en polvo', cantidad: 40 },
    { insumoNombre: 'Leche', cantidad: 200 }
  ],
  'Té': [
    { insumoNombre: 'Bolsita de té', cantidad: 1 }
  ],

  // --- Refrescos (embotellados: receta 1:1 contra el insumo del mismo producto) ---
  'Coca Cola': [{ insumoNombre: 'Coca Cola (botella)', cantidad: 1 }],
  'Coca Cola Zero': [{ insumoNombre: 'Coca Cola Zero (botella)', cantidad: 1 }],
  'Sangría Casera': [{ insumoNombre: 'Sangría Casera (botella)', cantidad: 1 }],
  'Boing de sabores': [{ insumoNombre: 'Boing de sabores (botella)', cantidad: 1 }],
  'Peñafiel Naranjada': [{ insumoNombre: 'Peñafiel Naranjada (botella)', cantidad: 1 }],
  'Peñafiel Limonada': [{ insumoNombre: 'Peñafiel Limonada (botella)', cantidad: 1 }],
  'Peñafiel Mineral': [{ insumoNombre: 'Peñafiel Mineral (botella)', cantidad: 1 }],
  'Manzanita': [{ insumoNombre: 'Manzanita (botella)', cantidad: 1 }],
  'Agua embotellada': [{ insumoNombre: 'Agua embotellada (botella)', cantidad: 1 }],

  // --- Cervezas (1:1 contra su propio insumo) ---
  'Corona': [{ insumoNombre: 'Corona (cerveza)', cantidad: 1 }],
  'XX Lager': [{ insumoNombre: 'XX Lager (cerveza)', cantidad: 1 }],
  'XX Ámbar': [{ insumoNombre: 'XX Ámbar (cerveza)', cantidad: 1 }],
  'Superior': [{ insumoNombre: 'Superior (cerveza)', cantidad: 1 }],
  'Heineken Cero': [{ insumoNombre: 'Heineken Cero (cerveza)', cantidad: 1 }],
  'Indio': [{ insumoNombre: 'Indio (cerveza)', cantidad: 1 }],
  'Negra Modelo': [{ insumoNombre: 'Negra Modelo (cerveza)', cantidad: 1 }]
};

/* ======================================================================
   Lógica del importador
   ====================================================================== */

async function upsertInsumo(datos) {
  return Insumo.findOneAndUpdate(
    { nombre: datos.nombre },
    { $setOnInsert: datos },
    { new: true, upsert: true }
  );
}

async function correr() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Conectado a MongoDB Atlas\n');

  // 1) Insumos nuevos
  console.log('== Insumos nuevos ==');
  const insumoIds = {};
  for (const datos of INSUMOS_NUEVOS) {
    const insumo = await upsertInsumo(datos);
    insumoIds[datos.nombre] = insumo._id;
    console.log(`  - ${datos.nombre}`);
  }

  // Necesitamos también los ids de los insumos que YA existían (de los cócteles)
  // por si alguna receta nueva los reutiliza (ej. Camarón, Aguacate, Limón...).
  const existentes = await Insumo.find({});
  for (const ins of existentes) {
    insumoIds[ins.nombre] = ins._id;
  }

  // 2) Recetas
  console.log('\n== Asignando recetas ==');
  let asignadas = 0, saltadas = 0, noEncontradas = 0;

  for (const [nombreProducto, recetaDef] of Object.entries(RECETAS)) {
    const producto = await Producto.findOne({ nombre: nombreProducto });
    if (!producto) {
      console.log(`  ! No encontrado (revisa el nombre exacto): "${nombreProducto}"`);
      noEncontradas++;
      continue;
    }
    if (producto.receta && producto.receta.length > 0) {
      console.log(`  - "${nombreProducto}" ya tenía receta, se dejó igual.`);
      saltadas++;
      continue;
    }

    const receta = [];
    let faltaInsumo = false;
    for (const item of recetaDef) {
      const insumoId = insumoIds[item.insumoNombre];
      if (!insumoId) {
        console.log(`    ! Insumo no encontrado: "${item.insumoNombre}" (para ${nombreProducto})`);
        faltaInsumo = true;
        continue;
      }
      receta.push({ insumo: insumoId, cantidad: item.cantidad });
    }
    if (faltaInsumo || receta.length === 0) continue;

    producto.receta = receta;
    await producto.save();
    console.log(`  - Receta asignada: ${nombreProducto} (${receta.length} insumos)`);
    asignadas++;
  }

  console.log(`\nListo. Recetas asignadas: ${asignadas} | ya existían: ${saltadas} | producto no encontrado: ${noEncontradas}`);
  console.log('Revisa cantidades/costos reales desde Admin > Inventario > Recetas cuando puedas.');
  process.exit(0);
}

correr().catch(err => {
  console.error('Error asignando recetas:', err.message);
  process.exit(1);
});