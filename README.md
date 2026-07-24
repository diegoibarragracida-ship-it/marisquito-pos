# El Marisquito - Sistema POS 🦐

Sistema de punto de venta para restaurante con módulos de Meseros, Caja, Cocina, Administración e Inventario (control de stock por receta).

## Estructura del proyecto

```
marisquito-pos/
├── models/
│   ├── Usuario.js       → usuarios y roles (mesero, cajero, cocina, admin)
│   ├── Mesa.js          → mesas del salón y su estado
│   ├── Insumo.js        → materia prima (camarón, limón, etc.) y su stock
│   ├── Producto.js      → menú, con receta de insumos que consume cada platillo
│   ├── Pedido.js        → cuenta de una mesa con los productos pedidos
│   └── CorteCaja.js     → apertura/cierre de turno de caja
├── controllers/
│   └── inventarioController.js  → lógica de descuento automático de stock
├── routes/
│   ├── authRoutes.js    → login
│   ├── adminRoutes.js   → CRUD de insumos y productos (crear, editar, eliminar, disponibilidad, foto)
│   ├── categoriaRoutes.js → CRUD de categorías del menú
│   ├── mesaRoutes.js    → ocupar/liberar mesas
│   ├── pedidoRoutes.js  → agregar/cancelar productos en un pedido
│   ├── cajaRoutes.js    → cobrar cuentas, cortes de turno
│   └── cocinaRoutes.js  → comandas y actualización de estado de platillos
├── middleware/
│   └── auth.js          → verificación de JWT y permisos por rol
├── server.js            → arranque del servidor + Socket.io
├── package.json
└── .env.example
```

## Frontend (public/)

```
public/
├── index.html      → redirige a login
├── login.html      → pantalla de acceso
├── mesero.html     → mapa de mesas
├── pedido.html     → menú + ticket de comanda de una mesa
├── caja.html       → turno de caja, cuentas por cobrar, dividir cuenta, cobro
├── cocina.html     → comandas en tiempo real (Socket.io) con avance de estado
├── impresora.html  → estación de impresión: imprime automáticamente todo lo que llega a la cola
├── admin.html      → dashboard, menú, inventario, mesas, empleados, reportes
├── css/style.css   → identidad visual (tema mercado costero + ticket de comanda)
└── js/
    ├── config.js   → URL base de la API (cambiar para producción/Render)
    └── api.js      → helper de peticiones + manejo de sesión (token en localStorage)
```

El frontend se sirve **desde el mismo servidor Express** (carpeta `public/`), así que no necesitas otro servidor ni preocuparte por CORS. Con `npm run dev` ya tienes todo en `http://localhost:3000`. Todas las pantallas de los 4 roles (mesero, cajero, cocina, admin) ya están construidas.

## Impresión con una sola impresora

Si el mesero, cocina y caja usan dispositivos distintos (tablets, otra compu) pero solo hay **una impresora física**, usa este flujo:

1. En la computadora que tiene la impresora conectada (configúrala como predeterminada de Windows), abre **http://localhost:3000/impresora.html** (o la URL de Render) y déjala abierta todo el día.
2. Cuando alguien presione "🖨 Imprimir" en Cocina o en Caja (desde cualquier dispositivo), el trabajo se manda a una cola en el servidor.
3. La pantalla de impresora lo detecta al instante (vía Socket.io) y lo imprime automáticamente ahí, sin que nadie tenga que hacer nada en esa compu.

### Impresión 100% automática, sin la ventanita de "Imprimir" de Windows

Por defecto, cada trabajo abre el diálogo de impresión de Windows y hay que darle clic a "Imprimir". Para que sea completamente automático (sin ninguna ventana), usa `impresora-automatica.bat` incluido en la raíz del proyecto:

1. **Configura tu impresora térmica como predeterminada** en Windows (Configuración → Impresoras → clic derecho → "Establecer como predeterminada"), y ajusta el tamaño de papel a recibo/ticket (58mm o 80mm según tu modelo) en las propiedades de la impresora.
2. **Cierra todas las ventanas de Chrome** en esa computadora (el script también lo hace automático, pero ayuda cerrarlas manualmente primero la primera vez).
3. Haz doble clic en **`impresora-automatica.bat`**. Esto abre Chrome en modo especial (`--kiosk-printing`) que imprime directo a la impresora predeterminada sin preguntar nada.
4. La primera vez tendrás que iniciar sesión normalmente (admin, cajero o cocina) — después de eso, la sesión se queda guardada en esa ventana y no hace falta volver a entrar.
5. Dejas esa ventana abierta todo el día. Si necesitas cerrarla y reabrirla, siempre usa el `.bat`, no un acceso directo normal de Chrome — si abres Chrome "normal" primero, el modo silencioso no se activa.

**Tip:** para que arranque solo cuando enciendes la computadora, copia un acceso directo de `impresora-automatica.bat` en la carpeta de inicio de Windows (`Win + R` → escribe `shell:startup` → pega el acceso directo ahí).

Si más adelante cambias de navegador o quieres algo más robusto que Chrome en modo kiosk (por ejemplo, imprimir incluso si el navegador se cierra), la alternativa es un agente local como QZ Tray — es una integración aparte que podemos agregar después.

## Instalación

```bash
npm install
```

Copia `.env.example` a `.env` y coloca tu cadena de conexión de MongoDB Atlas y tu JWT secret:

```bash
cp .env.example .env
```

## Ejecutar en desarrollo (local)

```bash
npm run dev
```

Abre **http://localhost:3000** — te manda directo al login.

Antes de poder entrar, necesitas al menos un usuario en la base de datos. Corre una sola vez:

```bash
node seed.js
```

Esto crea un usuario por cada rol, para que puedas probar las 4 pantallas:

| Usuario | Contraseña | Rol |
|---|---|---|
| admin | admin123 | admin |
| mesero1 | mesero123 | mesero |
| cajero1 | cajero123 | cajero |
| cocina1 | cocina123 | cocina |

Cámbiales la contraseña antes de usar el sistema en producción.

## Flujo básico de uso

1. **Admin** crea insumos (`POST /api/admin/insumos`) — ej. Camarón, 20000 g, mínimo 2000 g.
2. **Admin** crea categorías (`POST /api/categorias`) — ej. "Cocteles", "Ceviches", "Bebidas".
3. **Admin** crea productos con su receta y categoría (`POST /api/admin/productos`) — ej. "Cóctel chico" consume 200g de camarón.
   - Editar: `PUT /api/admin/productos/:id`
   - Eliminar: `DELETE /api/admin/productos/:id`
   - Activar/desactivar rápido: `PATCH /api/admin/productos/:id/disponibilidad`
   - Subir foto: `POST /api/admin/productos/:id/foto` (form-data, campo `foto`)
3. **Mesero** hace login (`POST /api/auth/login`) y ocupa una mesa (`PATCH /api/mesas/:id/ocupar`).
4. **Mesero** crea el pedido de la mesa (`POST /api/pedidos` con `mesaId`) y agrega productos (`POST /api/pedidos/:pedidoId/items`) → el sistema descuenta el stock automáticamente.
   - Ver el pedido actual de una mesa: `GET /api/pedidos/mesa/:mesaId/actual`
   - Ver su historial de ventas del turno: `GET /api/pedidos/mesero/historial`
   - Transferir la mesa a otro mesero: `PATCH /api/mesas/:id/transferir`
5. **Cocina** ve las comandas (`GET /api/cocina/comandas`) y marca los platillos como listos.
6. **Cajero** puede previsualizar la división de la cuenta (`POST /api/caja/dividir/:pedidoId`, modo `partes_iguales` o `por_producto`) y luego cobrar la cuenta (`POST /api/caja/cobrar/:pedidoId`), lo que libera la mesa.

## Deploy en Render

1. Sube este proyecto a tu repositorio de GitHub.
2. En Render, crea un nuevo **Web Service** conectado a tu repo.
3. Configura las variables de entorno (`MONGO_URI`, `JWT_SECRET`) en el panel de Render.
4. Build command: `npm install` — Start command: `npm start`.

## Pendiente / siguientes pasos sugeridos

- Frontend para meseros, caja y cocina (puede ser HTML/JS simple o React).
- Reportes de ventas y consumo de insumos por periodo.
- Facturación / CFDI si se requiere para México.
- Pantalla en tiempo real de cocina (KDS) conectada vía Socket.io.
