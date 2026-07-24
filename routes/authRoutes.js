const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const Usuario = require('../models/Usuario');

router.post('/login', async (req, res) => {
  try {
    const { usuario, password } = req.body;

    const usuarioEncontrado = await Usuario.findOne({ usuario, activo: true });
    if (!usuarioEncontrado) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const passwordCorrecto = await usuarioEncontrado.compararPassword(password);
    if (!passwordCorrecto) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: usuarioEncontrado._id, usuario: usuarioEncontrado.usuario, rol: usuarioEncontrado.rol },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      usuario: {
        id: usuarioEncontrado._id,
        nombre: usuarioEncontrado.nombre,
        rol: usuarioEncontrado.rol
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
