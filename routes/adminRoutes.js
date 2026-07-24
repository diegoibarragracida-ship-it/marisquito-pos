const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const Insumo = require('../models/Insumo');
const Producto = require('../models/Producto');
const Usuario = require('../models/Usuario');
const Mesa = require('../models/Mesa');
const Pedido = require('../models/Pedido');
const MovimientoInsumo = require('../models/MovimientoInsumo');
const { verificarToken, permitirRoles } = require('../middleware/auth');

// Configuración de subida de fotos (almacenamiento local en /uploads)
// NOTA: en Render el disco es efímero (se borra en cada deploy). Para producción
// se recomienda usar un servicio externo como Cloudinary o S3 en vez de disco local.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const nombreUnico = `${Date.now()}-${file.originalname}`;
    cb(null, nombreUnico);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
  fileFilter: (req, file, cb) => {
    const tiposPermitidos = /jpeg|jpg|png|webp/;
    const extValida = tiposPermitidos.test(path.extname(file.originalname).toLowerCase());
    if (extValida) return cb(null, true);
    cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP'));
  }
});

// --- INSUMOS ---

// Listar insumos (útil para dashboard de stock)
router.get('/insumos', verificarToken, async (req, res) => {
  const insumos = await Insumo.find();
  res.json(insumos);
});

// Crear insumo
router.post('/insumos', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const insumo = await Insumo.create(req.body);
    res.status(201).json(insumo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Entrada de mercancía (aumentar stock, ej. llegó compra de camarón)
router.patch('/insumos/:id/entrada', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const { cantidad } = req.body;
    const insumo = await Insumo.findById(req.params.id);
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

    insumo.stockActual += cantidad;
    await insumo.save();
    await MovimientoInsumo.create({ insumo: insumo._id, tipo: 'entrada', cantidad, registradoPor: req.usuario.id });
    res.json(insumo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Registrar una merma (insumo que se echó a perder, con motivo obligatorio)
router.post('/insumos/:id/merma', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const { cantidad, motivo } = req.body;
    if (!motivo || !motivo.trim()) {
      return res.status(400).json({ error: 'Escribe el motivo de la merma' });
    }
    const insumo = await Insumo.findById(req.params.id);
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

    insumo.stockActual = Math.max(0, insumo.stockActual - cantidad);
    await insumo.save();
    await MovimientoInsumo.create({ insumo: insumo._id, tipo: 'merma', cantidad, motivo, registradoPor: req.usuario.id });

    res.json(insumo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ajuste manual de stock (merma, se echó a perder, etc.)
router.patch('/insumos/:id/ajuste', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const { nuevoStock, motivo } = req.body;
    const insumo = await Insumo.findById(req.params.id);
    if (!insumo) return res.status(404).json({ error: 'Insumo no encontrado' });

    insumo.stockActual = nuevoStock;
    await insumo.save();
    res.json({ insumo, motivo });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Insumos en stock bajo (para alertas del admin)
router.get('/insumos/alertas/bajos', verificarToken, async (req, res) => {
  const insumos = await Insumo.find();
  const bajos = insumos.filter(i => i.enStockBajo());
  res.json(bajos);
});

// --- PRODUCTOS (MENÚ) ---

// Listar productos (mesero ve el menú disponible)
router.get('/productos', verificarToken, async (req, res) => {
  const productos = await Producto.find()
    .populate('receta.insumo', 'nombre unidad')
    .populate('categoria', 'nombre orden')
    .populate('productosIncluidos.producto', 'nombre precio');
  res.json(productos);
});

// Crear producto con su receta
router.post('/productos', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const producto = await Producto.create(req.body);
    res.status(201).json(producto);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Editar producto (precio, receta, disponibilidad)
router.put('/productos/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const producto = await Producto.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(producto);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Eliminar producto de la carta
router.delete('/productos/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const producto = await Producto.findByIdAndDelete(req.params.id);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });
    res.json({ mensaje: 'Producto eliminado de la carta' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Activar/desactivar disponibilidad rápidamente (ej. "se acabó el pescado")
router.patch('/productos/:id/disponibilidad', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    producto.disponible = req.body.disponible !== undefined ? req.body.disponible : !producto.disponible;
    await producto.save();

    res.json(producto);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Subir/actualizar foto de un producto
router.post('/productos/:id/foto', verificarToken, permitirRoles('admin'), upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen' });

    const producto = await Producto.findById(req.params.id);
    if (!producto) return res.status(404).json({ error: 'Producto no encontrado' });

    producto.foto = `/uploads/${req.file.filename}`;
    await producto.save();

    res.json(producto);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- EMPLEADOS ---

// Listar empleados (sin exponer el password)
router.get('/usuarios', verificarToken, permitirRoles('admin'), async (req, res) => {
  const usuarios = await Usuario.find().select('-password').sort('rol');
  res.json(usuarios);
});

// Crear empleado
router.post('/usuarios', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const { nombre, usuario, password, rol } = req.body;
    const nuevo = await Usuario.create({ nombre, usuario, password, rol });
    const { password: _omit, ...sinPassword } = nuevo.toObject();
    res.status(201).json(sinPassword);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Ese nombre de usuario ya existe' });
    }
    res.status(400).json({ error: err.message });
  }
});

// Editar empleado (nombre, rol, activo/inactivo)
router.put('/usuarios/:id', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const { nombre, rol, activo } = req.body;
    const usuario = await Usuario.findByIdAndUpdate(
      req.params.id,
      { nombre, rol, activo },
      { new: true }
    ).select('-password');
    if (!usuario) return res.status(404).json({ error: 'Empleado no encontrado' });
    res.json(usuario);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Restablecer contraseña de un empleado
router.patch('/usuarios/:id/password', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 4 caracteres' });
    }
    const usuario = await Usuario.findById(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Empleado no encontrado' });

    usuario.password = password; // el hook pre-save la hashea
    await usuario.save();
    res.json({ mensaje: 'Contraseña actualizada' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- DASHBOARD ---

// Resumen general para la pantalla principal del admin
router.get('/dashboard', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const [mesas, insumos, productos, pedidosHoyCerrados, cuentasAbiertas] = await Promise.all([
      Mesa.find(),
      Insumo.find(),
      Producto.find(),
      Pedido.find({ estadoCuenta: 'cerrada', updatedAt: { $gte: inicioHoy } }),
      Pedido.countDocuments({ estadoCuenta: 'abierta' })
    ]);

    const ventasHoy = pedidosHoyCerrados.reduce((acc, p) => acc + (p.total || 0), 0);
    const insumosBajos = insumos.filter(i => i.enStockBajo());
    const productosAgotados = productos.filter(p => !p.disponible);

    res.json({
      ventasHoy,
      cuentasCerradasHoy: pedidosHoyCerrados.length,
      cuentasAbiertas,
      mesasOcupadas: mesas.filter(m => m.estado !== 'libre').length,
      mesasTotal: mesas.length,
      insumosBajos,
      productosAgotados: productosAgotados.length
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- REPORTES ---

// Ventas de los últimos N días (agrupadas por día)
router.get('/reportes/ventas', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const dias = Number(req.query.dias) || 7;
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);
    desde.setHours(0, 0, 0, 0);

    const pedidos = await Pedido.find({ estadoCuenta: 'cerrada', updatedAt: { $gte: desde } });

    const porDia = {};
    for (const p of pedidos) {
      const clave = p.updatedAt.toISOString().slice(0, 10);
      porDia[clave] = (porDia[clave] || 0) + (p.total || 0);
    }

    const resultado = Object.entries(porDia)
      .map(([fecha, total]) => ({ fecha, total }))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    res.json({ dias, totalPeriodo: pedidos.reduce((acc, p) => acc + (p.total || 0), 0), porDia: resultado });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Productos más vendidos
router.get('/reportes/top-productos', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const pedidos = await Pedido.find({ estadoCuenta: 'cerrada' }).populate('items.producto', 'nombre precio');

    const conteo = {};
    for (const p of pedidos) {
      for (const item of p.items) {
        if (item.estado === 'cancelado' || !item.producto) continue;
        const clave = String(item.producto._id) + '|' + (item.varianteNombre || '');
        const nombreMostrado = item.varianteNombre ? `${item.producto.nombre} (${item.varianteNombre})` : item.producto.nombre;
        if (!conteo[clave]) conteo[clave] = { nombre: nombreMostrado, cantidad: 0, totalVendido: 0 };
        conteo[clave].cantidad += item.cantidad;
        conteo[clave].totalVendido += item.precioUnitario * item.cantidad;
      }
    }

    const top = Object.values(conteo).sort((a, b) => b.cantidad - a.cantidad).slice(0, 10);
    res.json(top);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Ventas por mesero
router.get('/reportes/por-mesero', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const pedidos = await Pedido.find({ estadoCuenta: 'cerrada' }).populate('mesero', 'nombre');

    const conteo = {};
    for (const p of pedidos) {
      if (!p.mesero) continue;
      const clave = String(p.mesero._id);
      if (!conteo[clave]) conteo[clave] = { nombre: p.mesero.nombre, cuentas: 0, totalVendido: 0 };
      conteo[clave].cuentas += 1;
      conteo[clave].totalVendido += p.total || 0;
    }

    const resultado = Object.values(conteo).sort((a, b) => b.totalVendido - a.totalVendido);
    res.json(resultado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Margen de ganancia por producto (precio de venta vs costo de su receta; funciona para paquetes también)
router.get('/reportes/margen', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const { recetaEfectivaFusionada } = require('../controllers/inventarioController');
    const productos = await Producto.find();

    const resultado = [];
    for (const p of productos) {
      if (p.variantes && p.variantes.length > 0) {
        for (const v of p.variantes) {
          const receta = await recetaEfectivaFusionada(p._id, v.nombre);
          const costo = receta.reduce((acc, r) => acc + (r.insumo ? r.insumo.costoUnitario * r.cantidad : 0), 0);
          const margen = v.precio - costo;
          const margenPorcentaje = v.precio > 0 ? (margen / v.precio) * 100 : 0;
          resultado.push({
            nombre: `${p.nombre} (${v.nombre})`,
            precio: v.precio,
            costo: Number(costo.toFixed(2)),
            margen: Number(margen.toFixed(2)),
            margenPorcentaje: Number(margenPorcentaje.toFixed(1))
          });
        }
        continue;
      }
      const receta = await recetaEfectivaFusionada(p._id);
      const costo = receta.reduce((acc, r) => acc + (r.insumo ? r.insumo.costoUnitario * r.cantidad : 0), 0);
      const margen = p.precio - costo;
      const margenPorcentaje = p.precio > 0 ? (margen / p.precio) * 100 : 0;
      resultado.push({
        nombre: p.nombre,
        precio: p.precio,
        costo: Number(costo.toFixed(2)),
        margen: Number(margen.toFixed(2)),
        margenPorcentaje: Number(margenPorcentaje.toFixed(1))
      });
    }
    resultado.sort((a, b) => a.margenPorcentaje - b.margenPorcentaje);

    res.json(resultado);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Mermas registradas (últimos N días)
router.get('/reportes/mermas', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const dias = Number(req.query.dias) || 30;
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    const mermas = await MovimientoInsumo.find({ tipo: 'merma', createdAt: { $gte: desde } })
      .populate('insumo', 'nombre unidad')
      .populate('registradoPor', 'nombre')
      .sort('-createdAt');

    res.json(mermas);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Utilidad neta del periodo: ventas - gastos - compras
router.get('/reportes/utilidad', verificarToken, permitirRoles('admin'), async (req, res) => {
  try {
    const Gasto = require('../models/Gasto');
    const Compra = require('../models/Compra');

    const dias = Number(req.query.dias) || 30;
    const desde = new Date();
    desde.setDate(desde.getDate() - dias);

    const [pedidos, gastos, compras] = await Promise.all([
      Pedido.find({ estadoCuenta: 'cerrada', updatedAt: { $gte: desde } }),
      Gasto.find({ fecha: { $gte: desde } }),
      Compra.find({ fecha: { $gte: desde } })
    ]);

    const ventas = pedidos.reduce((acc, p) => acc + (p.total || 0), 0);
    const totalGastos = gastos.reduce((acc, g) => acc + g.monto, 0);
    const totalCompras = compras.reduce((acc, c) => acc + c.total, 0);
    const utilidad = ventas - totalGastos - totalCompras;

    res.json({ dias, ventas, totalGastos, totalCompras, utilidad });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
