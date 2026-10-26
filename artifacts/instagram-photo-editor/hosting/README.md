# Sorteos con JSON privado en Donweb / Ferozo

**No necesita MySQL, phpMyAdmin, esquema SQL ni credenciales de base de datos.**
Todos los sorteos, participantes, premios y resultados se guardan en un único
`sorteos.json` privado del hosting. Las fotos de premios se guardan como archivos
privados y el JSON conserva sus referencias, no sus bytes.

El editor fotográfico sigue procesando y guardando sus fotos **solo en el
dispositivo**. No se suben a este servicio.

## Requisitos

- PHP **8.1 o posterior** con JSON, mbstring, fileinfo, GD con JPEG/PNG/WebP;
  EXIF recomendado para orientar fotos de teléfonos.
- HTTPS y protección de directorio de Ferozo aplicada al portal **y a su API**.
  PHP debe recibir `REMOTE_USER` validado por Apache. Si CGI/FastCGI no lo
  transmite, pide al hosting habilitarlo; **no desactives este control**.
- Sistema de archivos local con `flock`, reemplazo atómico por `rename` y
  `fsync`. No usar carpetas de red ni varias máquinas con copias separadas.
- Permiso de PHP para crear/escribir una carpeta hermana de `DOCUMENT_ROOT`,
  fuera del directorio público. `memory_limit` recomendado: 256M;
  `upload_max_filesize = 8M`, `post_max_size = 10M`.

## 1. Preparar y subir

```
node artifacts/instagram-photo-editor/hosting/package-hosting.mjs
```

Salida: `generated-artifacts/f18-portal-hosting/`:

```
public_html/
  index.html
  assets/
  sorteos-api/       # PHP y .htaccess incluidos
config.example.php  # opcional, sin contraseñas
INSTALACION.md
```

Sube **solo el contenido de public_html/** al directorio público del dominio.
Incluye `sorteos-api/.htaccess`, pero **no borres ni reemplaces la protección
existente de Ferozo ni su .htaccess raíz**. No subas pruebas ni configuraciones
privadas. El paquete es para la raíz del dominio; una subcarpeta requiere
compilar con el `BASE_PATH` correspondiente.

## 2. Almacenamiento automático, sin base de datos

Al acceder autenticado por HTTPS, PHP prepara automáticamente esta estructura:

```
carpeta-de-tu-cuenta/
  public_html/           # DOCUMENT_ROOT del dominio
  f18-private/           # FUERA del directorio público
    sorteos.json         # aparece al guardar el primer sorteo
    sorteos.json.lock    # bloqueo permanente; no borrar ni reemplazar en uso
    prizes/              # fotos privadas de premios
```

No hay que crear tablas, usuarios MySQL ni una contraseña de base de datos.
La ruta se calcula desde `DOCUMENT_ROOT`, no desde la carpeta de la API.
Los datos sobreviven a recargas y se comparten entre dispositivos autorizados.
Los formularios aún no guardados no se sincronizan; vuelve a abrir o actualiza
el sorteo antes de editar desde otro dispositivo.

Si el hosting no permite crear esa carpeta, créala tú y da permiso de escritura
al usuario PHP. Usa 700 para carpetas y 600 para archivos cuando sea compatible
con ese usuario; **nunca 777**. Las sesiones PHP también deben ser privadas.

### Rutas personalizadas (opcional)

Copia `config.example.php` como `f18-private/config.php`, fuera del sitio
público. Solo contiene rutas y la exigencia de HTTPS; no contiene credenciales.
Para otra ubicación del propio archivo de configuración, define en el servidor
`F18_RAFFLE_CONFIG` con su ruta absoluta privada. Las rutas del JSON y de fotos
deben ser absolutas, privadas y escribibles; no se aceptan enlaces simbólicos
para el JSON ni su bloqueo. Mantén `require_https => true`.

### Si instalaste antes la versión MySQL

Esta actualización **no convierte ni borra tu base anterior**. Si encuentra
una configuración con `dsn`, se detiene con un aviso para no mostrar un
almacenamiento vacío como si fuera una migración. Conserva una copia de la base
y de sus fotos antes de cambiar la configuración. Si ya tienes sorteos reales,
necesitan una migración planificada; no reemplaces esa configuración todavía.
Si nunca guardaste datos, puedes sustituir la configuración antigua por el
ejemplo JSON, o retirarla para usar las rutas automáticas.

## 3. Proteger el portal

En Ferozo, usa la opción de restringir acceso a un directorio/carpeta para
proteger **todo el directorio público del dominio** con usuario y contraseña.
La protección debe heredarse en `sorteos-api/`. Usa una contraseña fuerte y HTTPS.

La API solo reconoce `REMOTE_USER` establecido por el servidor web. No acepta
nombres de usuario enviados por cabeceras del navegador. No agregues
`Require all granted` ni excepciones para la API. Las escrituras requieren
además un token CSRF vinculado a la sesión; fotos y JSON nunca se sirven por
una URL pública directa.

## 4. Comprobaciones en tu dominio real

Antes de usar datos reales:

1. En ventana privada y sin credenciales, abre el portal y
   `sorteos-api/index.php?action=list` y `?action=image&id=1`.
   Deben pedir acceso o rechazarlo con 401/403, sin devolver nombres ni fotos.
2. Con acceso válido, `?action=session` debe devolver un token. No lo compartas.
   Una escritura sin token o con el de otra sesión debe fallar con 403.
3. Crea un sorteo de prueba; agrega, edita y elimina participantes. Un lote con
   duplicados se rechaza completo, sin agregar parcialmente.
4. Crea premios con y sin foto, reemplaza y elimina fotos. Abre el mismo sorteo
   en otro dispositivo autorizado: datos y fotos deben seguir disponibles.
5. Sortea: cada premio recibe una persona distinta. Recargar o volver a enviar
   la petición devuelve los mismos ganadores. Un sorteo cerrado es de solo
   lectura; duplicarlo crea un borrador sin resultados y con fotos independientes.
6. Descarga historias PNG y ZIP: cada historia es de **1080 × 1920**, sin
   compresión con pérdida. Instagram puede recomprimir al publicar.
7. Comprueba que el editor conserva sus fotos y proyectos locales.

GitHub y las pruebas locales **no demuestran** que la protección ni los
permisos de tu hosting real estén bien configurados. La vista previa Vite,
GitHub Pages y abrir `index.html` local no ejecutan PHP: muestran un aviso,
no simulan guardar sorteos.

## Integridad, copias y límites

- Cada escritura toma un bloqueo exclusivo, relee el JSON más reciente,
  valida la operación y guarda un archivo temporal privado en la misma carpeta.
  Se vacía/sincroniza antes de reemplazar el JSON atómicamente. Las lecturas
  toman un bloqueo compartido. Varias sesiones no pierden cambios por leer una
  copia vieja. Los sorteos simultáneos devuelven el mismo resultado cerrado.
- Un JSON vacío, truncado, incompatible o con estructura inválida provoca un
  error explícito; **nunca se reinicia ni sobrescribe como una lista vacía**.
  Conserva el archivo afectado y restaura un respaldo comprobado.
- Haz copias periódicas de **sorteos.json y prizes/** juntas, sin operaciones
  de edición en curso. Guárdalas fuera del directorio público y de GitHub.
  Para restaurar, pausa el acceso y conserva primero los archivos actuales.
  No borres el bloqueo mientras haya procesos utilizando el servicio.
- Borrar un sorteo elimina sus datos y fotos; es irreversible. Las fotos
  retiradas se borran solo tras confirmar el nuevo JSON. Un corte de proceso
  puede dejar fotos o temporales huérfanos; no los borres sin contrastar un respaldo.
- Diseñado para uso pequeño en un único hosting. Cada solicitud lee el JSON
  completo: no es una solución para grandes volúmenes o servidores distribuidos.
  Límite por sorteo: 5000 participantes y 30 premios; fotos reales JPEG/PNG/WebP
  de hasta 8 MB y 20 megapíxeles, decodificadas y recreadas sin metadatos.
- Fechas UTC; selección con `random_int` del servidor. No certifica sorteos
  legalmente ni obtiene comentarios de Instagram.
- Actualizaciones: reemplaza solo el producto público; conserva `f18-private`,
  fotos, sesiones y protección Ferozo. No distribuyas archivos de datos reales.

## Pruebas de desarrollo

En la copia de trabajo se comprueban el servicio JSON, escrituras concurrentes,
fallos de guardado, rutas privadas y el contrato HTTP usando PHP/Python y
carpetas temporales aisladas, sin base de datos ni credenciales del hosting.
Los arneses simulan la identidad de Apache solo en loopback. **No se distribuyen
en el paquete ni en el repositorio público y nunca deben desplegarse.**
Estas comprobaciones no sustituyen las pruebas anteriores en tu dominio real.
