-- Sistema de Validacion Documental con Codigo QR
-- Esquema de base de datos

CREATE DATABASE IF NOT EXISTS qrfiles_db;
USE qrfiles_db;

-- Tabla de usuarios internos
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  apellidos VARCHAR(150) NOT NULL DEFAULT '',
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  celular VARCHAR(20) NOT NULL DEFAULT '',
  rol ENUM('admin', 'capturista') DEFAULT 'capturista',
  activo TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla de documentos
CREATE TABLE IF NOT EXISTS documentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  folio VARCHAR(50) UNIQUE NOT NULL,
  titulo VARCHAR(200) NOT NULL,
  tipo_documento VARCHAR(100) NOT NULL,
  area_emisora VARCHAR(150) NOT NULL,
  estado ENUM('vigente', 'revocado', 'cancelado') DEFAULT 'vigente',
  pdf_original_path VARCHAR(500),
  pdf_qr_path VARCHAR(500),
  qr_image_path VARCHAR(500),
  qr_position VARCHAR(50) DEFAULT 'inferior_derecha',
  usuario_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);

-- Tabla de validaciones (log de consultas publicas)
CREATE TABLE IF NOT EXISTS validaciones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  documento_id INT NOT NULL,
  ip_address VARCHAR(50),
  user_agent VARCHAR(500),
  resultado VARCHAR(20),
  fecha_consulta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE CASCADE
);

-- Tabla de bitacora de cambios de estado
CREATE TABLE IF NOT EXISTS bitacora (
  id INT AUTO_INCREMENT PRIMARY KEY,
  documento_id INT NOT NULL,
  usuario_id INT NOT NULL,
  estado_anterior VARCHAR(20),
  estado_nuevo VARCHAR(20),
  observacion TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (documento_id) REFERENCES documentos(id) ON DELETE CASCADE,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE RESTRICT
);

-- Usuario administrador por defecto
-- Contrasena: admin123 (se genera el hash en el arranque de la app)
INSERT IGNORE INTO usuarios (nombre, email, password_hash, rol) VALUES
('Administrador', 'admin@sistema.com', 'PENDING_HASH', 'admin'),
('Capturista', 'capturista@sistema.com', 'PENDING_HASH', 'capturista');
