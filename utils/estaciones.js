// Decide a qué estación (cocina/barra) pertenece un item de pedido, con la MISMA regla
// que usa el resto del sistema (el "Forzar a Barra/Cocina" del producto en Admin manda;
// si el producto no tiene estación forzada, se usa la estación de su categoría).
// Requiere que item.producto venga poblado con { estacion, categoria: { estacion } }.

function estacionDeItem(item) {
  if (!item.producto) return null;
  if (item.producto.estacion === 'barra') return 'barra';
  if (item.producto.estacion === 'cocina') return 'cocina';
  return item.producto.categoria ? item.producto.categoria.estacion : null;
}

function esDeBarra(item) {
  return estacionDeItem(item) === 'barra';
}

function esDeCocina(item) {
  return estacionDeItem(item) === 'cocina';
}

module.exports = { estacionDeItem, esDeBarra, esDeCocina };