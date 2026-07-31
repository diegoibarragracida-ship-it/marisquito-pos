require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const categoriaRoutes = require('./routes/categoriaRoutes');
const mesaRoutes = require('./routes/mesaRoutes');
const pedidoRoutes = require('./routes/pedidoRoutes');
const cajaRoutes = require('./routes/cajaRoutes');
const cocinaRoutes = require('./routes/cocinaRoutes');
const barraRoutes = require('./routes/barraRoutes');
const impresionRoutes = require('./routes/impresionRoutes');
const promocionRoutes = require('./routes/promocionRoutes');
const reservacionRoutes = require('./routes/reservacionRoutes');
const proveedorRoutes = require('./routes/proveedorRoutes');
const compraRoutes = require('./routes/compraRoutes');
const gastoRoutes = require('./routes/gastoRoutes');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Hace disponible io dentro de los controladores/rutas vía req.app.get('io')
app.set('io', io);

app.use(cors());
app.use(express.json());

// Sirve el frontend (login, mesero, caja, cocina, admin)
app.use(express.static(require('path').join(__dirname, 'public')));

// Sirve las fotos de productos subidas (NOTA: efímero en Render, ver README)
app.use('/uploads', express.static(require('path').join(__dirname, 'uploads')));

// Rutas
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/categorias', categoriaRoutes);
app.use('/api/mesas', mesaRoutes);
app.use('/api/pedidos', pedidoRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/cocina', cocinaRoutes);
app.use('/api/barra', barraRoutes);
app.use('/api/impresion', impresionRoutes);
app.use('/api/promociones', promocionRoutes);
app.use('/api/reservaciones', reservacionRoutes);
app.use('/api/proveedores', proveedorRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/gastos', gastoRoutes);

app.get('/', (req, res) => {
  res.json({ mensaje: 'API El Marisquito POS funcionando 🦐' });
});

// Conexión a MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ Conectado a MongoDB Atlas'))
  .catch(err => console.error('❌ Error conectando a MongoDB:', err.message));

// Eventos de Socket.io en tiempo real
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);

  socket.on('disconnect', () => {
    console.log('❌ Cliente desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en el puerto ${PORT}`);
});