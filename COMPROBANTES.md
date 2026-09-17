# Configuración, apariencia y comprobantes

- Configuración (administrador): nombre, teléfono, dirección, mensaje del comprobante y condiciones iniciales de nuevos préstamos. Los cambios usan versión para evitar sobrescribir cambios simultáneos.
- Apariencia: Claro, Oscuro o Según el dispositivo. Disponible en el menú para todos los roles y en Configuración. Se guarda en el navegador, sin cambiar el tema de otros usuarios. La impresión mantiene el diseño claro.
- Cada pago nuevo conserva una instantánea de cliente, negocio, cobrador, saldos y cuotas aplicadas, dentro de la misma transacción y bloqueo del préstamo. Un reintento devuelve el mismo pago y la misma instantánea.
- El PDF se prepara después de registrar el pago y puede descargarse nuevamente desde Pagos > Ver detalle. Incluye folios, fecha, método, deuda anterior, abono, deuda nueva y aplicación parcial o completa a cada cuota.
- Los pagos anteriores a esta función incluyen una aclaración: no se inventan saldos históricos. Su PDF utiliza los datos actuales del negocio y cliente y las asignaciones registradas.
- WhatsApp: el botón de compartir utiliza el selector del dispositivo cuando admite archivos PDF. El usuario selecciona WhatsApp y el destinatario. La alternativa es descargar el PDF, abrir la conversación y adjuntarlo. El enlace nunca adjunta ni envía archivos automáticamente. No se publican comprobantes mediante enlaces sin autenticación.
- API: GET /payments/:id/receipt.pdf, autenticado para ADMIN, COLLECTOR y VIEWER. Respuesta privada sin caché.

## Instalación en otro entorno

Desde backend, instalar dependencias, generar Prisma con prisma7.config.ts, aplicar migraciones y compilar. La migración 20260916160000_payment_receipts añade los campos sin borrar datos. Reiniciar el backend después de compilar.

## Validación

Pruebas unitarias; payments-db-smoke.cjs; administration-db-smoke.cjs; payments-concurrency.cjs; client-lifecycle-db-smoke.cjs. Los escenarios verifican permisos, saldos, reintentos, concurrencia y persistencia de instantáneas. Pruebas de interfaz verificaron tema persistente, guardado, descarga y selector de archivos simulado. No se enviaron mensajes reales por WhatsApp. Los PDF se revisaron visualmente con documentos de una y varias páginas.

## Comprobantes, cancelaciones y uso móvil

- Nuevo módulo Comprobantes para todos los roles: búsqueda por nombre actual del cliente, teléfono o folio completo; filtros por fechas del pago y estado; descarga y opción de compartir.
- Solo ADMIN puede cancelar un pago desde su detalle en Pagos o Comprobantes. El motivo es obligatorio; se guardan fecha, administrador y motivo. No se elimina el pago ni sus asignaciones originales.
- La cancelación excluye ese abono del saldo pagado, cobranza, semáforo y reportes. Conserva los demás pagos y sus comprobantes. Las cuotas con historial de abonos, incluso cancelados, conservan número, fecha e importe al editar el préstamo.
- Los PDF descargados después de cancelar llevan la leyenda CANCELADO. Las copias ya descargadas o enviadas no pueden retirarse automáticamente: se debe avisar al cliente y compartir la versión cancelada.
- No hay reactivación del pago cancelado: registrar un nuevo pago si corresponde. Los reintentos de la misma cancelación no duplican el ajuste.
- API: POST /payments/:id/cancel con {reason}, ADMIN; GET /payments/:id, todos los roles de consulta. El listado acepta status ALL/ACTIVE/CANCELLED, from y to.
- Formularios de clientes, préstamos y usuarios y detalles de comprobantes se abren en ventanas con foco, salida mediante botones/Escape y regreso a la pantalla anterior. Los formularios en proceso de guardar no se cierran con Escape.
- En celular las tablas se presentan como tarjetas con etiquetas; controles táctiles, menú accesible durante el desplazamiento y formularios de pantalla completa. Probado en anchos 320, 390, 768 y 1280, con temas claro y oscuro. Recomendable comprobar también en los teléfonos reales antes de publicar.
- Migración adicional: 20260916210000_cancel_payments. Generar Prisma, aplicar migración, compilar y reiniciar backend.
- Pruebas: payment-cancellation-db-smoke.cjs (reversión, permisos, historial, consultas y PDF), payment-cancellation-concurrency.cjs (cancelación simultánea/reintentos frente a nuevos pagos), regresiones de pagos/cobranza/reportes/clientes, pruebas de interfaz móvil con datos simulados.
