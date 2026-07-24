const Producto = require('../models/Producto');
const Insumo = require('../models/Insumo');
const MovimientoInsumo = require('../models/MovimientoInsumo');

/**
 * Devuelve la receta "efectiva" de un producto: si es un producto normal,
 * es su propia receta. Si es un paquete/combo, es la suma de las recetas
 * de todos los productos que lo componen (multiplicadas por su cantidad
 * dentro del paquete). Funciona también si un paquete incluyera otro
 * paquete, aunque en la práctica no suele pasar.
 */
async function obtenerRecetaEfectiva(productoId) {
  const producto = await Producto.findById(productoId)
    .populate('receta.insumo')
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

async function recetaEfectivaFusionada(productoId) {
  return fusionarReceta(await obtenerRecetaEfectiva(productoId));
}

/**
 * Verifica si hay stock suficiente para vender "cantidad" unidades de un producto
 * (o paquete), revisando cada insumo de su receta efectiva.
 */
async function hayStockSuficiente(productoId, cantidad = 1) {
  const receta = await recetaEfectivaFusionada(productoId);

  for (const item of receta) {
    const insumo = item.insumo;
    const requerido = item.cantidad * cantidad;

    if (insumo.stockActual < requerido) {
      return {
        ok: false,
        faltante: insumo.nombre,
        disponible: insumo.stockActual,
        requerido
      };
    }
  }

  return { ok: true };
}

/**
 * Descuenta del stock de cada insumo lo que consume el producto (o paquete) vendido.
 * Se debe llamar cuando el mesero confirma/envía el pedido a cocina.
 */
async function descontarStockPorVenta(productoId, cantidad = 1) {
  const receta = await recetaEfectivaFusionada(productoId);

  const check = await hayStockSuficiente(productoId, cantidad);
  if (!check.ok) {
    throw new Error(
      `Stock insuficiente de "${check.faltante}". Disponible: ${check.disponible}, requerido: ${check.requerido}`
    );
  }

  for (const item of receta) {
    const insumo = item.insumo;
    const consumo = item.cantidad * cantidad;

    insumo.stockActual -= consumo;
    await insumo.save();

    await MovimientoInsumo.create({ insumo: insumo._id, tipo: 'venta', cantidad: consumo });
  }

  // Si el producto ya no tiene insumos suficientes para otra venta, se marca agotado
  const producto = await Producto.findById(productoId);
  const siguienteCheck = await hayStockSuficiente(productoId, 1);
  if (!siguienteCheck.ok) {
    producto.disponible = false;
    await producto.save();
  }

  return { ok: true };
}

/**
 * Revierte el descuento de stock (ej. si se cancela un item del pedido).
 */
async function revertirStockPorCancelacion(productoId, cantidad = 1) {
  const receta = await recetaEfectivaFusionada(productoId);

  for (const item of receta) {
    const insumo = item.insumo;
    insumo.stockActual += item.cantidad * cantidad;
    await insumo.save();
  }

  const producto = await Producto.findById(productoId);
  if (!producto.disponible) {
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
