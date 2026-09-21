# Despliegue de The Blessed Company en Render

Esta guía publica el proyecto en tres recursos de Render: PostgreSQL, API NestJS y frontend React/Vite. El archivo `render.yaml` ya contiene la estructura; las URLs públicas se deben copiar en el panel después de crear los servicios.

## 1. Preparación en GitHub

1. Confirma que `render.yaml` y este archivo estén en la raíz del repositorio.
2. Haz commit y push a la rama que vas a publicar, normalmente `main`.
3. No subas `backend/.env`, contraseñas, tokens ni cadenas `DATABASE_URL` al repositorio.

## 2. Crear los servicios

1. En Render elige **New > Blueprint** y conecta `avv290302/sistema-prestamos`.
2. Selecciona la rama `main` y confirma el Blueprint.
3. Render creará PostgreSQL, `sistema-prestamos-api` y `sistema-prestamos-web`.
4. Espera a que termine el primer despliegue. El backend ejecuta las migraciones Prisma antes de iniciar.

Si tu cuenta no permite crear la base desde el Blueprint, crea primero una base PostgreSQL en Render con el nombre `sistema-prestamos-db` y vuelve a ejecutar el Blueprint.

## 3. Variables obligatorias

En **sistema-prestamos-api > Environment** configura:

- `NODE_ENV=production`
- `DATABASE_URL`: la conexión interna que Render proporciona al PostgreSQL del mismo workspace.
- `SHADOW_DATABASE_URL`: una base PostgreSQL separada para migraciones Prisma. No uses la misma base de producción como shadow database. También puedes dejarla configurada como una variable secreta con una base temporal.
- `FRONTEND_ORIGIN=https://<URL-DEL-FRONTEND>`

En **sistema-prestamos-web > Environment** configura:

- `VITE_API_URL=https://<URL-DEL-BACKEND>`

Después de guardar cada cambio pulsa **Manual Deploy > Deploy latest commit**. Vite inserta `VITE_API_URL` durante la compilación, por eso se debe volver a desplegar el frontend si cambia la URL de la API.

## 4. Verificación de producción

1. Abre la URL del frontend por HTTPS.
2. Comprueba que aparece el login y que no hay errores de red en el navegador.
3. Crea la primera cuenta administradora desde el **Shell** del servicio API. Define temporalmente `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` (la contraseña debe tener entre 15 y 128 caracteres) y ejecuta:

   ```bash
   node -r ts-node/register src/scripts/create-admin.ts
   ```

   El script no modifica nada si ya existe un administrador. Cuando termine, elimina esas tres variables temporales del servicio y entra desde el frontend.
4. Prueba, en este orden, una búsqueda de clientes, la vista de un préstamo, el registro de un pago de demostración, la descarga de su comprobante y el acceso a Reportes.
5. Comprueba en Render que el backend tenga estado **Live** y que sus logs no reporten errores de migración o conexión.

## 5. Dominio propio

Puedes añadir un dominio al frontend y otro al backend en Render. Cuando cambies el dominio del frontend, actualiza `FRONTEND_ORIGIN` con el origen exacto, incluyendo `https://` y sin barra final. Cuando cambies el dominio de la API, actualiza `VITE_API_URL` y vuelve a desplegar el frontend.

La aplicación usa una cookie de sesión `httpOnly`, `secure` en producción y `sameSite=strict`; por eso ambos servicios deben funcionar por HTTPS y `FRONTEND_ORIGIN` debe coincidir exactamente con la URL que visita el administrador.

## 6. Base de datos y respaldo

Antes del primer uso real, crea un respaldo de PostgreSQL y define una rutina periódica de copias. No pruebes migraciones destructivas sobre la base real. Para una prueba inicial usa un registro y un préstamo de demostración, verifica el comprobante y elimina/restaura únicamente esos datos de prueba según el flujo de la aplicación.

## 7. Costos y límites

Revisa los límites y precios vigentes de Render antes de entregar el sistema. Los planes de entrada pueden suspender servicios inactivos, limitar recursos o no incluir respaldos suficientes para una operación financiera. Para uso diario con clientes, elige un plan con servicio siempre activo, PostgreSQL persistente y respaldos.
