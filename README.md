# QRFiles — Sistema de Validacion Documental con Codigo QR

Aplicacion web para registrar documentos PDF, generar codigos QR unicos e insertar dicho QR en el PDF. Permite validacion publica de documentos mediante pagina web sin requerir inicio de sesion.

## Tecnologias utilizadas

| Tecnologia        | Rol                                         |
|-------------------|---------------------------------------------|
| Node.js + Express | Backend / API REST                          |
| MySQL 8.0         | Base de datos relacional                    |
| pdf-lib           | Insercion del codigo QR en el PDF           |
| qrcode            | Generacion del codigo QR como imagen PNG    |
| bcryptjs          | Cifrado seguro de contrasenas               |
| multer            | Carga de archivos PDF                       |
| express-session   | Manejo de sesiones de usuario               |
| Docker Compose    | Orquestacion de contenedores                |
| Tailwind CSS      | Estilos del frontend (via CDN)              |

## Requisitos

- Docker Desktop instalado y en ejecucion
- Puerto 3000 y 3306 disponibles

## Instalacion y ejecucion

```bash
# 1. Clonar el repositorio
git clone <url-del-repositorio>

# 2. Entrar a la carpeta del proyecto
cd qrFiles

# 3. Levantar los servicios con Docker Compose
docker compose up -d

# 4. Acceder al sistema en el navegador
http://localhost:3000
```

El primer arranque puede tardar ~30 segundos mientras MySQL se inicializa.

## Usuarios de prueba

| Rol           | Email                   | Contrasena     |
|---------------|-------------------------|----------------|
| Administrador | admin@sistema.com       | admin123       |
| Capturista    | capturista@sistema.com  | capturista123  |

## Estructura del proyecto

```
qrFiles/
├── docker-compose.yml          # Orquestacion de servicios
├── README.md
├── database/
│   └── init.sql               # Esquema de base de datos
└── backend/
    ├── Dockerfile
    ├── package.json
    ├── server.js              # Punto de entrada del servidor
    ├── config/
    │   └── database.js        # Conexion MySQL
    ├── middleware/
    │   └── auth.js            # Middleware de autenticacion
    ├── routes/
    │   ├── auth.js            # Login / logout
    │   ├── documents.js       # CRUD de documentos + QR
    │   └── validate.js        # Validacion publica
    ├── public/
    │   ├── login.html
    │   ├── dashboard.html
    │   ├── upload.html
    │   ├── repository.html
    │   └── validate.html
    └── uploads/
        ├── originals/         # PDFs originales
        ├── qr_pdfs/           # PDFs con QR insertado
        └── qr_images/         # Imagenes PNG del QR
```

## Funcionalidades

- **Login seguro** con sesiones y contrasenas cifradas con bcrypt
- **Carga de PDF** con metadatos (titulo, tipo, area emisora)
- **Generacion de folio unico** por documento (formato DOC-YYYY-XXXXXXXX)
- **Generacion de codigo QR** que apunta a la URL de validacion publica
- **Insercion del QR en el PDF** en la posicion elegida por el usuario
- **5 posiciones disponibles** para el QR (4 esquinas + ultima pagina inferior derecha)
- **Repositorio de documentos** con filtros por estado y tipo
- **Cambio de estado** (vigente / revocado / cancelado) con bitacora de cambios
- **Pagina publica de validacion** — sin requerir inicio de sesion
- **Descarga del PDF con QR** desde el repositorio

## Servicios Docker

| Servicio | Puerto | Descripcion        |
|----------|--------|--------------------|
| app      | 3000   | Aplicacion Node.js |
| database | 3306   | MySQL 8.0          |

## Comandos utiles

```bash
# Ver logs en tiempo real
docker compose logs -f app

# Detener servicios
docker compose down

# Eliminar todo incluyendo datos
docker compose down -v
```
