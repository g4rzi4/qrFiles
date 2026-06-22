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
| pdf.js            | Previsualizacion del PDF para colocar el QR (via CDN) |

## Requisitos

- Docker Desktop instalado y en ejecucion
- Puerto 3000 y 3307 disponibles

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

### Variable APP_URL (importante para que el QR funcione fuera de tu red)

El codigo QR de cada documento apunta a `${APP_URL}/validar/:folio`. Esta variable se define en `docker-compose.yml`:

- Para uso solo en tu red local: `APP_URL=http://localhost:3000` o `http://<tu-ip-local>:3000`
- Para que el QR sea escaneable desde cualquier lugar (demo, presentacion): expon la app con un tunel publico, por ejemplo [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/):

  ```bash
  cloudflared tunnel --url http://localhost:3000
  ```

  Copia la URL `https://xxxx.trycloudflare.com` que genera y colocala en `APP_URL` dentro de `docker-compose.yml`, luego reinicia con `docker compose up -d`. Los documentos que subas **despues** de ese cambio generaran QR con la URL publica. Estos tuneles gratuitos son temporales: si se reinician, la URL cambia y los QR generados previamente dejan de funcionar.

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
    │   ├── usuarios.html
    │   └── validate.html
    └── uploads/
        ├── originals/         # PDFs originales
        ├── qr_pdfs/           # PDFs con QR insertado
        └── qr_images/         # Imagenes PNG del QR
```

## Funcionalidades

- **Login y registro** con sesiones y contrasenas cifradas con bcrypt
- **Modo claro / oscuro** con boton de cambio en la barra de navegacion y persistencia en `localStorage`
- **Carga de PDF** con metadatos (titulo, tipo, area emisora)
- **Generacion de folio unico** por documento (formato DOC-YYYY-XXXXXXXX)
- **Generacion de codigo QR** que apunta a la URL de validacion publica
- **Posicionamiento libre del QR**: previsualizacion del PDF (via pdf.js) con un recuadro arrastrable para colocar el QR en cualquier punto de la pagina, mas botones rapidos para las 4 esquinas
- **Seleccion de pagina**: el QR puede insertarse en cualquier pagina del documento (numero especifico o "ultima pagina")
- **Leyenda automatica** "Valida tu documento" dibujada justo debajo del QR en el PDF
- **Repositorio de documentos** con filtros por estado y tipo
- **Cambio de estado** (vigente / revocado / cancelado) con bitacora de cambios
- **Gestion de usuarios** (solo administrador): listado con conteo de documentos por estado y eliminacion de usuarios
- **Pagina publica de validacion** — sin requerir inicio de sesion
- **Descarga del PDF con QR** desde el repositorio

## Servicios Docker

| Servicio | Puerto | Descripcion        |
|----------|--------|--------------------|
| app      | 3000          | Aplicacion Node.js |
| database | 3307 (host) → 3306 (contenedor) | MySQL 8.0 |

## Comandos utiles

```bash
# Ver logs en tiempo real
docker compose logs -f app

# Detener servicios
docker compose down

# Eliminar todo incluyendo datos
docker compose down -v
```
