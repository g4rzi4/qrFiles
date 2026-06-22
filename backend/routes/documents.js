const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const db = require('../config/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads/originals')),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${uuidv4()}`;
    cb(null, `${unique}.pdf`);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Solo se permiten archivos PDF.'));
    }
    cb(null, true);
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

function esPropietarioOAdmin(doc, req) {
  return req.session.userRol === 'admin' || doc.usuario_id === req.session.userId;
}

function generarFolio() {
  const year = new Date().getFullYear();
  const short = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
  return `DOC-${year}-${short}`;
}

const QR_CAPTION = 'Valida tu documento';

function fraccionValida(valor, fallback) {
  const n = parseFloat(valor);
  if (isNaN(n)) return fallback;
  return Math.min(Math.max(n, 0), 1);
}

async function insertarQREnPDF(pdfBuffer, qrBuffer, { qrPage, xFrac, yFrac }) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const qrImage = await pdfDoc.embedPng(qrBuffer);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pages = pdfDoc.getPages();
  const totalPaginas = pages.length;

  let pageIndex;
  if (qrPage === 'ultima') {
    pageIndex = totalPaginas - 1;
  } else {
    const n = parseInt(qrPage, 10);
    pageIndex = (!isNaN(n) && n >= 1 && n <= totalPaginas) ? n - 1 : 0;
  }
  const page = pages[pageIndex];
  const { width: pageWidth, height: pageHeight } = page.getSize();

  const qrSize = 90;
  const gap = 6;
  const captionSize = 8;
  const blockHeight = qrSize + gap + captionSize + 2;

  const fx = fraccionValida(xFrac, 1);
  const fy = fraccionValida(yFrac, 1);

  const maxX = Math.max(pageWidth - qrSize, 0);
  const maxYTravel = Math.max(pageHeight - blockHeight, 0);

  const x = fx * maxX;
  const blockTop = fy * maxYTravel;
  const qrY = pageHeight - blockTop - qrSize;
  const captionY = qrY - gap - captionSize;

  const textWidth = font.widthOfTextAtSize(QR_CAPTION, captionSize);
  const captionX = x + (qrSize - textWidth) / 2;

  page.drawImage(qrImage, { x, y: qrY, width: qrSize, height: qrSize });
  page.drawText(QR_CAPTION, {
    x: captionX,
    y: captionY,
    size: captionSize,
    font,
    color: rgb(0.373, 0.443, 0.380)
  });

  return { pdfBytes: await pdfDoc.save(), pageIndex: pageIndex + 1, totalPaginas };
}

// POST /api/documents - Subir documento con QR
router.post('/', requireAuth, upload.single('pdf'), async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { titulo, tipo_documento, area_emisora, qr_page, qr_pos_x, qr_pos_y } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Debes subir un archivo PDF.' });
    }
    if (!titulo || !tipo_documento || !area_emisora) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Titulo, tipo de documento y area emisora son requeridos.' });
    }

    const folio = generarFolio();
    const qrPageSelector = qr_page || '1';
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const validacionUrl = `${appUrl}/validar/${folio}`;

    // Generar imagen QR
    const qrBuffer = await QRCode.toBuffer(validacionUrl, {
      type: 'png',
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M'
    });

    const qrImageName = `${folio}_qr.png`;
    const qrImagePath = path.join(__dirname, '../uploads/qr_images', qrImageName);
    fs.writeFileSync(qrImagePath, qrBuffer);

    // Leer PDF original e insertar QR
    const pdfBuffer = fs.readFileSync(req.file.path);
    const xFrac = qr_pos_x !== undefined ? qr_pos_x : '1';
    const yFrac = qr_pos_y !== undefined ? qr_pos_y : '1';
    const { pdfBytes: pdfConQR, pageIndex, totalPaginas } = await insertarQREnPDF(
      pdfBuffer, qrBuffer, { qrPage: qrPageSelector, xFrac, yFrac }
    );

    const qrPdfName = `${folio}_con_qr.pdf`;
    const qrPdfPath = path.join(__dirname, '../uploads/qr_pdfs', qrPdfName);
    fs.writeFileSync(qrPdfPath, pdfConQR);

    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO documentos
        (folio, titulo, tipo_documento, area_emisora, estado, pdf_original_path, pdf_qr_path, qr_image_path, qr_position, qr_page, qr_pos_x, qr_pos_y, usuario_id)
       VALUES (?, ?, ?, ?, 'vigente', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        folio, titulo, tipo_documento, area_emisora,
        req.file.filename,
        qrPdfName,
        qrImageName,
        'personalizada',
        pageIndex,
        fraccionValida(xFrac, 1),
        fraccionValida(yFrac, 1),
        req.session.userId
      ]
    );

    await conn.commit();

    res.status(201).json({
      message: 'Documento registrado exitosamente.',
      documento: {
        id: result.insertId,
        folio,
        titulo,
        tipo_documento,
        area_emisora,
        estado: 'vigente',
        qr_page: pageIndex,
        qr_total_paginas: totalPaginas,
        validacion_url: validacionUrl
      }
    });
  } catch (err) {
    await conn.rollback();
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Error al subir documento:', err);
    res.status(500).json({ error: 'Error al procesar el documento.' });
  } finally {
    conn.release();
  }
});

// GET /api/documents - Listar documentos (admin ve todos, el resto solo los propios)
router.get('/', requireAuth, async (req, res) => {
  try {
    const esAdmin = req.session.userRol === 'admin';
    const filtroUsuarioId = esAdmin && req.query.usuario_id ? req.query.usuario_id : (esAdmin ? null : req.session.userId);

    const query = `SELECT d.*, u.nombre AS usuario_nombre, u.apellidos AS usuario_apellidos
       FROM documentos d
       JOIN usuarios u ON d.usuario_id = u.id
       ${filtroUsuarioId ? 'WHERE d.usuario_id = ?' : ''}
       ORDER BY d.created_at DESC`;

    const [rows] = await db.execute(query, filtroUsuarioId ? [filtroUsuarioId] : []);
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener documentos:', err);
    res.status(500).json({ error: 'Error al obtener documentos.' });
  }
});

// GET /api/documents/:id - Obtener documento por ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT d.*, u.nombre AS usuario_nombre, u.apellidos AS usuario_apellidos
       FROM documentos d
       JOIN usuarios u ON d.usuario_id = u.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado.' });
    }
    if (!esPropietarioOAdmin(rows[0], req)) {
      return res.status(403).json({ error: 'No tienes permiso para ver este documento.' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error al obtener documento:', err);
    res.status(500).json({ error: 'Error al obtener el documento.' });
  }
});

// PUT /api/documents/:id/estado - Cambiar estado del documento
router.put('/:id/estado', requireAuth, async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { estado, observacion } = req.body;
    const estadosValidos = ['vigente', 'revocado', 'cancelado'];

    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ error: 'Estado invalido.' });
    }

    const [rows] = await conn.execute('SELECT * FROM documentos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado.' });
    }

    const doc = rows[0];
    if (!esPropietarioOAdmin(doc, req)) {
      return res.status(403).json({ error: 'No tienes permiso para modificar este documento.' });
    }
    await conn.beginTransaction();

    await conn.execute(
      'UPDATE documentos SET estado = ? WHERE id = ?',
      [estado, req.params.id]
    );

    await conn.execute(
      'INSERT INTO bitacora (documento_id, usuario_id, estado_anterior, estado_nuevo, observacion) VALUES (?,?,?,?,?)',
      [req.params.id, req.session.userId, doc.estado, estado, observacion || null]
    );

    await conn.commit();
    res.json({ message: `Documento actualizado a estado: ${estado}.` });
  } catch (err) {
    await conn.rollback();
    console.error('Error al cambiar estado:', err);
    res.status(500).json({ error: 'Error al actualizar el estado.' });
  } finally {
    conn.release();
  }
});

// PUT /api/documents/:id - Editar metadatos del documento
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { titulo, tipo_documento, area_emisora } = req.body;

    if (!titulo || !tipo_documento || !area_emisora) {
      return res.status(400).json({ error: 'Titulo, tipo de documento y area emisora son requeridos.' });
    }

    const [rows] = await db.execute('SELECT * FROM documentos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado.' });
    }
    if (!esPropietarioOAdmin(rows[0], req)) {
      return res.status(403).json({ error: 'No tienes permiso para editar este documento.' });
    }

    await db.execute(
      'UPDATE documentos SET titulo = ?, tipo_documento = ?, area_emisora = ? WHERE id = ?',
      [titulo, tipo_documento, area_emisora, req.params.id]
    );

    res.json({ message: 'Documento actualizado correctamente.' });
  } catch (err) {
    console.error('Error al actualizar documento:', err);
    res.status(500).json({ error: 'Error al actualizar el documento.' });
  }
});

// DELETE /api/documents/:id - Eliminar documento
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM documentos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado.' });
    }

    const doc = rows[0];
    if (!esPropietarioOAdmin(doc, req)) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este documento.' });
    }

    await db.execute('DELETE FROM documentos WHERE id = ?', [req.params.id]);

    [
      ['../uploads/originals', doc.pdf_original_path],
      ['../uploads/qr_pdfs', doc.pdf_qr_path],
      ['../uploads/qr_images', doc.qr_image_path]
    ].forEach(([dir, filename]) => {
      if (!filename) return;
      const filePath = path.join(__dirname, dir, filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    });

    res.json({ message: 'Documento eliminado correctamente.' });
  } catch (err) {
    console.error('Error al eliminar documento:', err);
    res.status(500).json({ error: 'Error al eliminar el documento.' });
  }
});

// GET /api/documents/:id/download - Descargar PDF con QR
router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM documentos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado.' });
    }

    const doc = rows[0];
    if (!esPropietarioOAdmin(doc, req)) {
      return res.status(403).json({ error: 'No tienes permiso para descargar este documento.' });
    }
    const filePath = path.join(__dirname, '../uploads/qr_pdfs', doc.pdf_qr_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado.' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${doc.folio}_con_qr.pdf"`);
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(filePath);
  } catch (err) {
    console.error('Error al descargar:', err);
    res.status(500).json({ error: 'Error al descargar el archivo.' });
  }
});

module.exports = router;
