const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { PDFDocument } = require('pdf-lib');
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

function generarFolio() {
  const year = new Date().getFullYear();
  const short = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
  return `DOC-${year}-${short}`;
}

function calcularPosicionQR(position, pageWidth, pageHeight, qrSize, margin) {
  switch (position) {
    case 'superior_derecha':
      return { x: pageWidth - qrSize - margin, y: pageHeight - qrSize - margin };
    case 'superior_izquierda':
      return { x: margin, y: pageHeight - qrSize - margin };
    case 'inferior_izquierda':
      return { x: margin, y: margin };
    case 'inferior_derecha':
    case 'ultima_inferior_derecha':
    default:
      return { x: pageWidth - qrSize - margin, y: margin };
  }
}

async function insertarQREnPDF(pdfBuffer, qrBuffer, position) {
  const pdfDoc = await PDFDocument.load(pdfBuffer);
  const qrImage = await pdfDoc.embedPng(qrBuffer);

  const pages = pdfDoc.getPages();
  const page = position === 'ultima_inferior_derecha'
    ? pages[pages.length - 1]
    : pages[0];

  const { width, height } = page.getSize();
  const qrSize = 90;
  const margin = 20;
  const { x, y } = calcularPosicionQR(position, width, height, qrSize, margin);

  page.drawImage(qrImage, { x, y, width: qrSize, height: qrSize });

  return await pdfDoc.save();
}

// POST /api/documents - Subir documento con QR
router.post('/', requireAuth, upload.single('pdf'), async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { titulo, tipo_documento, area_emisora, qr_position } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'Debes subir un archivo PDF.' });
    }
    if (!titulo || !tipo_documento || !area_emisora) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Titulo, tipo de documento y area emisora son requeridos.' });
    }

    const folio = generarFolio();
    const position = qr_position || 'inferior_derecha';
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
    const pdfConQR = await insertarQREnPDF(pdfBuffer, qrBuffer, position);

    const qrPdfName = `${folio}_con_qr.pdf`;
    const qrPdfPath = path.join(__dirname, '../uploads/qr_pdfs', qrPdfName);
    fs.writeFileSync(qrPdfPath, pdfConQR);

    await conn.beginTransaction();

    const [result] = await conn.execute(
      `INSERT INTO documentos
        (folio, titulo, tipo_documento, area_emisora, estado, pdf_original_path, pdf_qr_path, qr_image_path, qr_position, usuario_id)
       VALUES (?, ?, ?, ?, 'vigente', ?, ?, ?, ?, ?)`,
      [
        folio, titulo, tipo_documento, area_emisora,
        req.file.filename,
        qrPdfName,
        qrImageName,
        position,
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
        qr_position: position,
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

// GET /api/documents - Listar todos los documentos
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT d.*, u.nombre AS usuario_nombre
       FROM documentos d
       JOIN usuarios u ON d.usuario_id = u.id
       ORDER BY d.created_at DESC`
    );
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
      `SELECT d.*, u.nombre AS usuario_nombre
       FROM documentos d
       JOIN usuarios u ON d.usuario_id = u.id
       WHERE d.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado.' });
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

// GET /api/documents/:id/download - Descargar PDF con QR
router.get('/:id/download', requireAuth, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM documentos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Documento no encontrado.' });
    }

    const doc = rows[0];
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
