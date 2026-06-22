const express = require('express');
const db = require('../config/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - Listar usuarios con conteo de documentos por estado (solo admin)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT u.id, u.nombre, u.apellidos, u.email, u.rol,
              COUNT(d.id) AS total,
              SUM(CASE WHEN d.estado = 'vigente' THEN 1 ELSE 0 END) AS vigentes,
              SUM(CASE WHEN d.estado = 'revocado' THEN 1 ELSE 0 END) AS revocados,
              SUM(CASE WHEN d.estado = 'cancelado' THEN 1 ELSE 0 END) AS cancelados
       FROM usuarios u
       LEFT JOIN documentos d ON d.usuario_id = u.id
       GROUP BY u.id, u.nombre, u.apellidos, u.email, u.rol
       ORDER BY u.nombre, u.apellidos`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener usuarios:', err);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

// DELETE /api/users/:id - Eliminar usuario (solo admin)
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);

    if (targetId === req.session.userId) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    }

    const [rows] = await db.execute('SELECT id FROM usuarios WHERE id = ?', [targetId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    await db.execute('DELETE FROM usuarios WHERE id = ?', [targetId]);
    res.json({ message: 'Usuario eliminado correctamente.' });
  } catch (err) {
    if (err.errno === 1451) {
      return res.status(409).json({ error: 'No se puede eliminar: el usuario tiene documentos registrados. Elimina o reasigna sus documentos primero.' });
    }
    console.error('Error al eliminar usuario:', err);
    res.status(500).json({ error: 'Error al eliminar el usuario.' });
  }
});

module.exports = router;
