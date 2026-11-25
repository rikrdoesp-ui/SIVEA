# SIVEA · Sistema Inteligente de Verificación Ambiental

Revisa informes de seguimiento ambiental en PDF y genera la lista de verificación que se entrega, con su formato oficial.

Listas incluidas:

- Informes semestrales del EsIA Cat. III "Saneamiento de la Ciudad y la Bahía de Panamá" (Res. DINEORA IA-067-2005).
- Informes semestrales del EsIA Cat. III "Saneamiento Arraiján - La Chorrera, Redes y Colectoras" (Res. DEIA-IA-166-2018).
- Verificación de la gestión ambiental mensual del contratista (R-PA03-20).

## Privacidad

Todo ocurre en el navegador del revisor. Los informes no se suben a ningún servidor y la página no tiene permiso para conectarse a internet (`connect-src 'none'`). El avance se guarda en el propio equipo, y se puede llevar a otro con "Guardar copia del avance".

## Uso

Abre la app publicada en GitHub Pages e instálala desde el navegador (Chrome o Edge: "Instalar SIVEA"). Después funciona sin conexión. También se puede abrir `docs/index.html` con doble clic.

## Desarrollo

```bash
node --test tests/*.test.js     # pruebas
node tools/empaquetar.js        # genera docs/ (un solo HTML, service worker, manifiesto e iconos)
node .claude/serve.mjs 8093     # servidor local de desarrollo
```

Los iconos se generan con `uv run --no-project --with pillow python tools/iconos.py <icono> [<marca>]`.

Componentes de terceros: pdf.js (Apache-2.0) y jsPDF (MIT). Ver `vendor/PROCEDENCIA.txt` y las licencias en `vendor/`.
