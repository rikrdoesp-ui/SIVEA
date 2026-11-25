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

## Instalador para Windows

`SIVEA-Setup.exe` instala SIVEA como programa de escritorio (Electron, sin navegador), con su icono en el menú Inicio y en el escritorio. Es la misma app de `docs/index.html`, con las mismas restricciones: sin red, ventana que no navega a otras páginas y sin permisos de cámara, ubicación ni similares. El avance se guarda en el perfil de la app instalada, separado del que tenga el navegador; para pasarlo de uno a otro se usa "Guardar copia del avance".

```bash
cd escritorio
npm install
npm run dist     # empaqueta docs/index.html y arma escritorio/dist/SIVEA-Setup-1.0.0.exe (unos 120 MB)
npm start        # abre la app sin instalar, con menú Ver > Herramientas de desarrollo
```

El instalador deja elegir la carpeta, no pide permisos de administrador (instala para el usuario) y se puede correr en silencio con `SIVEA-Setup-1.0.0.exe /S`. El ejecutable no está firmado (no hay certificado): Windows SmartScreen mostrará "Windows protegió su PC / editor desconocido", y hay que elegir "Más información" y "Ejecutar de todas formas". Si cambia el icono, se rehace con `uv run --no-project --with pillow python tools/iconos.py --ico`.
