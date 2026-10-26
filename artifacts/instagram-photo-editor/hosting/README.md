# Instalar Sorteos en Donweb / Ferozo

El portal tiene dos herramientas: el editor sigue procesando fotos **solo en el
dispositivo**; Sorteos guarda nombres, premios y resultados en **tu MySQL** y las
fotos de premios en una carpeta privada de **tu hosting**.

## Requisitos

- PHP **8.1 o posterior**, MySQL 5.7+ o MariaDB 10.3+, tablas InnoDB.
- Extensiones PHP: PDO MySQL, mbstring, fileinfo, GD con JPEG/PNG/WebP; EXIF
  recomendado para orientar fotos de iPad/iPhone.
- HTTPS activo. PHP con `memory_limit` de al menos 256M para imágenes de hasta
  20 megapíxeles, `upload_max_filesize = 8M`, `post_max_size = 10M`.
- PHP ejecutado por Apache/Ferozo debe recibir **REMOTE_USER** al acceder a un
  directorio protegido. Si tu modalidad CGI/FastCGI no lo transmite, pide al
  hosting habilitarlo. La API rechaza acceso si falta, incluso si la página carga.

No funciona abriendo `index.html` como archivo local ni en un hosting solo
estático. La vista previa de Vite muestra una explicación, no datos simulados.

## 1. Preparar los archivos

Desde el proyecto: `node artifacts/instagram-photo-editor/hosting/package-hosting.mjs`.
La salida está en `generated-artifacts/f18-portal-hosting/`:

```
public_html/
  index.html
  assets/
  sorteos-api/       # PHP y .htaccess incluidos
config.example.php
schema.sql
INSTALACION.md
```

Sube **el contenido de public_html** al directorio público de tu dominio, sin
borrar ni sobrescribir la protección por contraseña existente de Ferozo.
Incluye archivos ocultos: `sorteos-api/.htaccess`. No reemplaces tu `.htaccess`
raíz automáticamente. No subas el resto del paquete a la carpeta pública.
El paquete está compilado para la raíz del dominio. Para una subcarpeta, compila
con su `BASE_PATH` y copia esa salida en lugar del paquete raíz.

## 2. Crear la base y configuración privada

1. Crea una base MySQL dedicada y un usuario en Ferozo. Usa las credenciales
   únicamente en el administrador de archivos de tu hosting, **nunca en el chat
   ni GitHub**.
2. Importa `schema.sql` en esa base con phpMyAdmin. No lo ejecutes en una base
   con datos ajenos a esta herramienta.
3. Junto a `public_html`, **fuera de ella**, crea `f18-private/`. Dentro, copia
   `config.example.php` como `config.php` y completa el nombre real de base,
   usuario y contraseña. La ruta por defecto es
   `dirname(DOCUMENT_ROOT)/f18-private/config.php`. Si tu dominio tiene otra
   estructura, configura `F18_RAFFLE_CONFIG` en el servidor con la ruta absoluta
   privada; nunca una ruta bajo la carpeta pública.
4. La carpeta `prizes/` se creará dentro de `f18-private/`. PHP necesita permiso
   para escribir ahí. Usa permisos privados (carpeta 700 y archivos 600 cuando
   el usuario PHP lo permita), nunca 777. Guarda también sesiones PHP en una
   ubicación privada del servidor.
5. Conserva `require_https => true`. No subas la configuración real, la base,
   sesiones ni las fotos privadas al repositorio o al despliegue automático.

## 3. Proteger TODO el portal

En Ferozo, usa **Herramientas → Restringir el acceso a un directorio o a una
carpeta** (el nombre puede variar) para proteger el directorio público completo
del dominio con usuario y contraseña. La regla debe heredarse en
`sorteos-api/`. Usa una contraseña fuerte y HTTPS.

La API solo acepta la identidad **REMOTE_USER** validada por el servidor web.
No basta un formulario JavaScript ni ocultar el botón de Sorteos. No agregues
reglas `Require all granted` ni exclusiones para la API. La API no interpreta
cabeceras de nombre de usuario enviadas por el navegador. Fotos privadas solo
se sirven por la API autenticada, con `no-store` y `nosniff`.

**Comprobación obligatoria antes de usar datos reales:** en una ventana privada,
sin introducir credenciales, visita el dominio, `sorteos-api/index.php?action=list`
y `sorteos-api/index.php?action=image&id=1`. Deben pedir credenciales o rechazar
acceso (401/403), nunca devolver nombres ni fotos. Con credenciales válidas,
`action=session` debe devolver JSON con un token de sesión. No compartas ese token.
Una escritura sin token debe fallar con 403. Si aparece 401 aun autenticado,
verifica la transmisión de REMOTE_USER con el hosting; **no desactives el control**.

## 4. Verificar funcionamiento

En Herramientas → Sorteos:

1. Crea un sorteo de prueba, pega varios nombres, edita uno, prueba un duplicado.
   Los duplicados rechazan el lote completo con un aviso; no agregan parcialmente.
2. Crea premios con y sin foto, reemplaza una foto y vuelve a abrir desde otro
   dispositivo autorizado. Los datos deben persistir.
3. Sortea: se pide confirmación, cada premio recibe una persona distinta. El
   resultado queda cerrado. Recargar/reintentar no cambia los ganadores. Para
   repetir, crea una copia (nuevo borrador sin resultados).
4. Descarga un PNG y el ZIP. Cada historia es de **1080 × 1920**, sin compresión
   con pérdida. Instagram puede recomprimir al publicar.
5. Comprueba el editor: sus fotos y ajustes siguen siendo locales, nunca pasan
   por MySQL ni por la carpeta de premios.

Las fechas se guardan en UTC. El azar usa `random_int` del servidor. No es un
servicio de certificación legal ni obtiene comentarios de Instagram.

## Mantenimiento y límites

- Hasta 5000 participantes y 30 premios por sorteo; foto JPEG/PNG/WebP real de
  hasta 8 MB y 20 megapíxeles. Las fotos se decodifican/recrean para eliminar
  contenido ejecutable y metadatos; JPEG se vuelve a codificar en calidad 100.
- Borrar un sorteo borra participantes, premios, resultados y fotos asociadas.
  Es irreversible: haz copias de seguridad **de MySQL y f18-private/prizes/**
  juntas. Duplicar un sorteo crea fotos independientes, sin compartir archivos
  que un borrado pueda retirar de la copia.
- Un corte de proceso entre guardar una foto y confirmar la transacción puede
  dejar un archivo privado huérfano; no borres archivos manualmente sin contrastar
  la base de datos y conservar una copia.
- Los formularios no guardados no se sincronizan entre dispositivos. Actualiza
  los datos antes de editar desde otra sesión; el cierre del sorteo se impone
  en el servidor.
- Ante un error de red después de sortear, abre de nuevo el sorteo para consultar
  el resultado guardado antes de repetir. El servidor devuelve el mismo resultado.
- Despliegues futuros: actualiza solo los archivos públicos compilados y el
  servicio PHP, preservando configuración, protección Ferozo, fotos y base de datos.
- La configuración de seguridad de Apache/Ferozo y su ejecución PHP deben
  verificarse en tu cuenta real: una prueba local no valida el hosting.

## Comprobaciones de desarrollo

Los arneses temporales que se usaron para comprobar PHP/MySQL y las subidas en
un servidor de pruebas local no se incluyen en esta copia pública del
repositorio, porque la raíz se despliega automáticamente al hosting. No instales
un router de pruebas ni desactives la autenticación en producción. Las
comprobaciones locales no sustituyen comprobar la protección real del dominio
en Ferozo como se indica más arriba.
