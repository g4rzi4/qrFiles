const express = require('express');
const path = require('path');
const fs = require('fs');
const db = require('../config/database');

const router = express.Router();

// GET /api/validate/:folio/pdf - PDF publico (sin login)
router.get('/:folio/pdf', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT pdf_qr_path FROM documentos WHERE folio = ?',
      [req.params.folio]
    );

    if (rows.length === 0 || !rows[0].pdf_qr_path) {
      return res.status(404).json({ error: 'Documento no encontrado.' });
    }

    const filePath = path.join(__dirname, '../uploads/qr_pdfs', rows[0].pdf_qr_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado.' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${req.params.folio}.pdf"`);
    res.sendFile(filePath);
  } catch (err) {
    console.error('Error al servir el PDF:', err);
    res.status(500).json({ error: 'Error al obtener el archivo.' });
  }
});

// GET /api/validate/:folio - Validacion publica (sin login)
router.get('/:folio', async (req, res) => {
  try {
    const { folio } = req.params;

    const [rows] = await db.execute(
      `SELECT d.id, d.folio, d.titulo, d.tipo_documento, d.area_emisora, d.estado, d.created_at,
              u.nombre AS usuario_nombre
       FROM documentos d
       JOIN usuarios u ON d.usuario_id = u.id
       WHERE d.folio = ?`,
      [folio]
    );

    if (rows.length === 0) {
      return res.json({ encontrado: false, estado: 'no_encontrado' });
    }

    const doc = rows[0];

    // Registrar consulta en bitacora de validaciones
    await db.execute(
      'INSERT INTO validaciones (documento_id, ip_address, user_agent, resultado) VALUES (?, ?, ?, ?)',
      [
        doc.id,
        req.ip || req.connection.remoteAddress || 'unknown',
        req.headers['user-agent'] || 'unknown',
        doc.estado
      ]
    );

    res.json({
      encontrado: true,
      folio: doc.folio,
      titulo: doc.titulo,
      tipo_documento: doc.tipo_documento,
      area_emisora: doc.area_emisora,
      estado: doc.estado,
      fecha_registro: doc.created_at,
      registrado_por: doc.usuario_nombre,
      pdf_url: `/api/validate/${doc.folio}/pdf`
    });
  } catch (err) {
    console.error('Error al validar documento:', err);
    res.status(500).json({ error: 'Error al consultar el documento.' });
  }
});

module.exports = router;
