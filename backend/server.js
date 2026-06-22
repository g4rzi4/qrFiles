const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const db = require('./config/database');
const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const validateRoutes = require('./routes/validate');

const app = express();
const PORT = process.env.PORT || 3000;

// Crear directorios de uploads si no existen
['uploads/originals', 'uploads/qr_pdfs', 'uploads/qr_images'].forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'qrfiles_secret_dev',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000,
    httpOnly: true
  }
}));

// Servir archivos estaticos del frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/validate', validateRoutes);

// Ruta de validacion publica - sirve la pagina HTML
app.get('/validar/:folio', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'validate.html'));
});

// Redirigir raiz
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect('/dashboard.html');
  }
  res.redirect('/login.html');
});

// Sembrar usuarios por defecto si no existen o tienen hash pendiente
async function seedUsers() {
  try {
    const hash = await bcrypt.hash('admin123', 10);
    const hash2 = await bcrypt.hash('capturista123', 10);

    await db.execute(
      `UPDATE usuarios SET password_hash = ? WHERE email = ? AND password_hash = 'PENDING_HASH'`,
      [hash, 'admin@sistema.com']
    );
    await db.execute(
      `UPDATE usuarios SET password_hash = ? WHERE email = ? AND password_hash = 'PENDING_HASH'`,
      [hash2, 'capturista@sistema.com']
    );
    console.log('Usuarios por defecto configurados.');
  } catch (err) {
    console.error('Error al sembrar usuarios:', err.message);
  }
}

async function startServer() {
  let retries = 10;
  while (retries > 0) {
    try {
      const conn = await db.getConnection();
      conn.release();
      console.log('Conexion a la base de datos establecida.');
      break;
    } catch (err) {
      retries--;
      console.log(`Esperando conexion a DB... intentos restantes: ${retries}`);
      if (retries === 0) throw err;
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  await seedUsers();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Error fatal al iniciar el servidor:', err);
  process.exit(1);
});
