function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    if (req.path.startsWith('/api/')) {
      return res.status(401).json({ error: 'No autorizado. Inicia sesion.' });
    }
    return res.redirect('/login.html');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (req.session.userRol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido a administradores.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
