const Producto = require('../models/Producto');
const Insumo = require('../models/Insumo');
const MovimientoInsumo = require('../models/MovimientoInsumo');

/**
 * Devuelve la receta "efectiva" de un producto: si es un producto normal,
 * es su propia receta. Si tiene variantes (tamaños: chico/mediano/bola),
 * es la receta de la variante indicada. Si es un paquete/combo, es la suma
 * de las recetas de todos los productos que lo componen (multiplicadas por
 * su cantidad dentro del paquete). Funciona también si un paquete incluyera
 * otro paquete, aunque en la práctica no suele pasar.
 */
async function obtenerRecetaEfectiva(productoId, varianteNombre = '') {
  const producto = await Producto.findById(productoId)
    .populate('receta.insumo')
    .populate('variantes.receta.insumo')
    .populate('productosIncluidos.producto');

  if (!producto) throw new Error('Producto no encontrado');

  if (producto.esPaquete && producto.productosIncluidos.length > 0) {
    let recetaCombinada = [];
    for (const incluido of producto.productosIncluidos) {
      const subReceta = await obtenerRecetaEfectiva(incluido.producto._id);
      for (const item of subReceta) {
        recetaCombinada.push({ insumo: item.insumo, cantidad: item.cantidad * incluido.cantidad });
      }
    }
    return recetaCombinada;
  }

  if (producto.variantes && producto.variantes.length > 0) {
    const variante = producto.variantes.find(v => v.nombre === varianteNombre) || producto.variantes[0];
    return variante.receta.map(r => ({ insumo: r.insumo, cantidad: r.cantidad }));
  }

  return producto.receta.map(r => ({ insumo: r.insumo, cantidad: r.cantidad }));
}

/**
 * Combina líneas repetidas del mismo insumo en una sola (ej. si dos
 * productos del paquete usan camarón, se suma en una sola línea antes
 * de checar o descontar stock, para no subestimar lo que hace falta).
 */
function fusionarReceta(receta) {
  const mapa = new Map();
  for (const item of receta) {
    const id = String(item.insumo._id || item.insumo);
    if (!mapa.has(id)) mapa.set(id, { insumo: item.insumo, cantidad: 0 });
    mapa.get(id).cantidad += item.cantidad;
  }
  return Array.from(mapa.values());
}

async function recetaEfectivaFusionada(productoId, varianteNombre = '') {
  return fusionarReceta(await obtenerRecetaEfectiva(productoId, varianteNombre));
}

// Revisa el stock usando una receta que YA se obtuvo (sin volver a golpear la
// base de datos) — antes esto se recalculaba desde cero cada vez que se llamaba.
function verificarStockConReceta(receta, cantidad) {
  for (const item of receta) {
    const requerido = item.cantidad * cantidad;
    if (item.insumo.stockActual < requerido) {
      return { ok: false, faltante: item.insumo.nombre, disponible: item.insumo.stockActual, requerido };
    }
  }
  return { ok: true };
}

/**
 * Verifica si hay stock suficiente para vender "cantidad" unidades de un producto
 * (o paquete/variante), revisando cada insumo de su receta efectiva.
 */
async function hayStockSuficiente(productoId, cantidad = 1, varianteNombre = '') {
  const receta = await recetaEfectivaFusionada(productoId, varianteNombre);
  return verificarStockConReceta(receta, cantidad);
}

/**
 * Descuenta del stock de cada insumo lo que consume el producto (o paquete/variante) vendido.
 * Se debe llamar cuando el mesero confirma/envía el pedido a cocina.
 *
 * OPTIMIZADO: antes esta función calculaba la receta 3 veces (aquí, dentro de
 * hayStockSuficiente, y otra vez al revisar si se agotó) y guardaba cada insumo
 * por separado con .save(). Ahora la receta se calcula UNA vez, y los insumos
 * se descuentan todos juntos con bulkWrite — muchas menos idas y vueltas a la
 * base de datos, sobre todo cuando el pedido trae varios productos.
 */
async function descontarStockPorVenta(productoId, cantidad = 1, varianteNombre = '') {
  const receta = await recetaEfectivaFusionada(productoId, varianteNombre);

  const check = verificarStockConReceta(receta, cantidad);
  if (!check.ok) {
    throw new Error(
      `Stock insuficiente de "${check.faltante}". Disponible: ${check.disponible}, requerido: ${check.requerido}`
    );
  }

  if (receta.length > 0) {
    // Descuenta TODOS los insumos en una sola operación (antes eran N .save() por separado)
    await Insumo.bulkWrite(receta.map(item => ({
      updateOne: {
        filter: { _id: item.insumo._id },
        update: { $inc: { stockActual: -(item.cantidad * cantidad) } }
      }
    })));

    // Registra los movimientos también en un solo viaje (antes eran N .create() por separado)
    await MovimientoInsumo.insertMany(receta.map(item => ({
      insumo: item.insumo._id,
      tipo: 'venta',
      cantidad: item.cantidad * cantidad
    })));
  }

  // ¿Ya no alcanza para una venta más? Se calcula con los números que ya tenemos
  // en memoria (sin volver a consultar la base de datos ni recalcular la receta).
  const yaNoAlcanza = receta.some(item => (item.insumo.stockActual - item.cantidad * cantidad) < item.cantidad);

  if (yaNoAlcanza) {
    const producto = await Producto.findById(productoId).select('variantes disponible');
    if (producto && (!producto.variantes || producto.variantes.length === 0) && producto.disponible) {
      producto.disponible = false;
      await producto.save();
    }
  }

  return { ok: true };
}

/**
 * Revierte el descuento de stock (ej. si se cancela un item del pedido).
 */
async function revertirStockPorCancelacion(productoId, cantidad = 1, varianteNombre = '') {
  const receta = await recetaEfectivaFusionada(productoId, varianteNombre);

  if (receta.length > 0) {
    await Insumo.bulkWrite(receta.map(item => ({
      updateOne: {
        filter: { _id: item.insumo._id },
        update: { $inc: { stockActual: item.cantidad * cantidad } }
      }
    })));
  }

  const producto = await Producto.findById(productoId).select('disponible');
  if (producto && !producto.disponible) {
    producto.disponible = true;
    await producto.save();
  }

  return { ok: true };
}

module.exports = {
  hayStockSuficiente,
  descontarStockPorVenta,
  revertirStockPorCancelacion,
  recetaEfectivaFusionada
};
