const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contrasena son requeridos.' });
    }

    const [rows] = await db.execute(
      'SELECT * FROM usuarios WHERE email = ? AND activo = 1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Credenciales invalidas.' });
    }

    req.session.userId = user.id;
    req.session.userNombre = user.nombre;
    req.session.userRol = user.rol;

    res.json({
      message: 'Inicio de sesion exitoso.',
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol }
    });
  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { nombre, apellidos, email, password, celular } = req.body;

    if (!nombre || !apellidos || !email || !password || !celular) {
      return res.status(400).json({ error: 'Todos los campos son requeridos.' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'El correo electronico no es valido.' });
    }

    if (password.length < 8 || !/\d/.test(password)) {
      return res.status(400).json({ error: 'La contrasena debe tener minimo 8 caracteres e incluir al menos un numero.' });
    }

    const celularDigits = celular.replace(/\D/g, '');
    if (celularDigits.length === 0 || celularDigits.length > 12) {
      return res.status(400).json({ error: 'El numero de celular debe tener maximo 12 numeros.' });
    }

    const [existentes] = await db.execute('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existentes.length > 0) {
      return res.status(409).json({ error: 'Ya existe una cuenta registrada con este correo.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [result] = await db.execute(
      'INSERT INTO usuarios (nombre, apellidos, email, password_hash, celular, rol) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, apellidos, email, passwordHash, celularDigits, 'capturista']
    );

    req.session.userId = result.insertId;
    req.session.userNombre = nombre;
    req.session.userRol = 'capturista';

    res.status(201).json({
      message: 'Cuenta registrada exitosamente.',
      user: { id: result.insertId, nombre, email, rol: 'capturista' }
    });
  } catch (err) {
    console.error('Error en registro:', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Sesion cerrada.' });
  });
});

router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  res.json({
    id: req.session.userId,
    nombre: req.session.userNombre,
    rol: req.session.userRol
  });
});

module.exports = router;
