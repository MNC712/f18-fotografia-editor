# F18 · Herramientas para Instagram

Portal de herramientas de **@f18.fotografia**. Desde el menú puedes seleccionar el editor de fotografías o la herramienta Sorteos.

- **Editor:** marcos formales y modernos, ficha técnica y firma. Las fotografías y sus proyectos se procesan y conservan localmente en el navegador.
- **Sorteos:** participantes, premios con foto, selección de ganadores sin repetir personas y resultados persistentes en un **JSON privado de tu hosting, sin MySQL**. Las fotos de premios son archivos privados referenciados desde el JSON; no son las fotografías del editor.

## Sorteos

- Crear, editar, eliminar y volver a abrir sorteos.
- Agregar nombres individualmente o en una lista, editar y eliminar participantes, con validación de duplicados.
- Guardar hasta 30 premios con nombre, descripción y foto opcional, y hasta 5000 participantes por sorteo.
- Confirmar el sorteo y asignar un ganador diferente a cada premio mediante aleatoriedad del servidor.
- Consultar los mismos resultados después de recargar; los sorteos finalizados son de solo lectura y se pueden duplicar como un borrador nuevo.
- Vista previa y descarga de historias **PNG de 1080 × 1920**, con premio, foto, ganador y firma; descarga conjunta en ZIP.
- Acceso restringido mediante la protección de directorio de Ferozo, validada por PHP; escrituras con protección CSRF.

**Instalación necesaria:** Sorteos requiere PHP 8.1+, HTTPS y protección por contraseña en Donweb/Ferozo; **no requiere MySQL ni contraseñas de base de datos**. PHP crea automáticamente `f18-private/sorteos.json` y `f18-private/prizes/` junto a `DOCUMENT_ROOT`, fuera de la carpeta pública, si tiene permisos. El [ejemplo de configuración](artifacts/instagram-photo-editor/hosting/config.example.php) es opcional, solo para cambiar rutas. Sigue la [guía de instalación](artifacts/instagram-photo-editor/hosting/README.md). Subir este repositorio no activa HTTPS ni la contraseña de Ferozo: hay que verificar el dominio real.

Si ya usabas la versión MySQL, la actualización no migra ni borra datos. La configuración antigua con `dsn` provoca un aviso y detiene el servicio hasta planificar el cambio; conserva un respaldo antes de sustituirla. Nunca subas datos, fotos ni configuración privada a GitHub.

## Funciones del editor

- Hasta cuatro fotografías editables, con carga múltiple, reordenación y lectura EXIF cuando está disponible.
- Siete marcos, incluido ancho completo y Prisma.
- Arrastrar, ampliar y girar la fotografía, sin dejar espacios vacíos en el marco.
- Formatos: 1080 × 1350, 1080 × 1440, 1080 × 1080, 1080 × 566 e historias 1080 × 1920.
- Tipografías y paletas, incluida una paleta automática basada en la imagen.
- Ficha técnica con apertura, obturación, ISO, focal, cámara y firma.
- Carruseles de dos a cuatro fotos con vista previa de la publicación.
- Recorte sin marco y feed 3×1: una fotografía dividida en tres publicaciones numeradas.
- Plantillas de historias con títulos, ficha técnica opcional y vista de zonas seguras.
- Exportación desde el original: máxima resolución útil, doble resolución o tamaño Instagram. PNG sin pérdida o JPEG con calidad 100 %. La resolución original y el recorte limitan el detalle disponible.
- Descarga conjunta en un único ZIP, sin alterar la calidad de las imágenes, además de descarga individual.
- Guardado automático local en IndexedDB y recuperación del proyecto en el mismo navegador y dispositivo, con protección contra sobrescrituras entre pestañas. No es una copia de seguridad externa.

## Ejecutar

Requisitos: Node.js 24 y pnpm 10.

```bash
pnpm install --frozen-lockfile
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/instagram-photo-editor run dev
```

Abrir http://localhost:5173. Las fuentes de Google requieren conexión; sin ella se usan fuentes alternativas.

## Compilar el portal

```bash
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/instagram-photo-editor run build
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/instagram-photo-editor run serve
```

Los archivos compilados se generan en `artifacts/instagram-photo-editor/dist/public`.

Para hosting con despliegue automático desde la rama `main`, hay una copia compilada en la **raíz del repositorio**: `index.html`, `assets/`, `sorteos-api/`, `favicon.svg` y `robots.txt`. Conserva la protección por contraseña y los archivos privados existentes al actualizar. El editor no necesita servidor de datos; **Sorteos necesita PHP y JSON privado, sin MySQL**.

También puedes generar un paquete limpio:

```bash
node artifacts/instagram-photo-editor/hosting/package-hosting.mjs
```

Su salida es `generated-artifacts/f18-portal-hosting/`. Publica únicamente el contenido de `public_html/`. Los archivos de guía y configuración de ejemplo que están al lado son para instalar; no se deben copiar como configuración real al directorio público. No hay esquema SQL.

## Copia para instalación manual

El directorio `docs/` contiene el sitio compilado, con `index.html` en su raíz y sus recursos en `docs/assets/`.

- Para el hosting del dominio propio: descarga la carpeta `docs/` y sube **su contenido** (no la carpeta contenedora) a la raíz pública del dominio, junto con `index.html` y `assets/`.
- `docs/` se mantiene idéntico a la distribución pública de la raíz, incluido el servicio PHP.

El código PHP no funciona en GitHub Pages, abriendo archivos HTML locales ni en la vista previa de Vite. En esos entornos el editor sigue siendo local; Sorteos muestra un aviso y no simula guardar datos. Para el portal completo usa tu hosting PHP y sigue la guía.

## Comprobaciones

```bash
pnpm --filter @workspace/instagram-photo-editor run typecheck
node --experimental-strip-types --test artifacts/instagram-photo-editor/src/lib/*.test.ts
```

## Estructura

- `artifacts/instagram-photo-editor`: aplicación React, TypeScript y Vite.
- `artifacts/instagram-photo-editor/hosting`: ejemplo opcional sin credenciales, empaquetado y guía de Ferozo para JSON.
- `sorteos-api`: servicio PHP público listo para el hosting; autentica antes de consultar o modificar datos.
- `lib`: bibliotecas compartidas de la plantilla monorepo.
- `artifacts/api-server`: servidor base de la plantilla; no es necesario para editar ni exportar fotos.

Esta copia contiene el código del producto, sin historial interno de Replit, conversaciones, fotografías cargadas, datos reales de sorteos ni credenciales. Los arneses temporales de integración no se distribuyen en esta copia pública. No publica automáticamente en Instagram: los archivos descargados se suben manualmente.
