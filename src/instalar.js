'use strict';
// Registra el trabajador sin conexión. Desde un archivo abierto con doble clic no aplica.
if ('serviceWorker' in navigator && window.location.protocol !== 'file:' && document.getElementById('rec-pdf')) {
  navigator.serviceWorker.register('sw.js').catch((e) => console.warn('No se pudo preparar el uso sin conexión', e));
}
