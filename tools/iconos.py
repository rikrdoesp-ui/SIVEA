"""Genera los iconos de SIVEA y la imagen de marca de la pantalla inicial.

Uso: uv run --no-project --with pillow python tools/iconos.py <icono> [<marca>]
Escribe en iconos/: icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, icon.ico
(para el instalador de Windows) y, si se da la marca, marca-sivea.jpg.
Con --ico solo rehace icon.ico a partir de iconos/icon-512.png.
"""
import sys
from pathlib import Path

from PIL import Image, ImageFilter

FONDO = (11, 33, 64, 255)  # #0b2140, la barra de la app, debajo de lo transparente
SALIDA = Path(__file__).resolve().parent.parent / "iconos"
ANCHO_MARCA = 480


def cuadrada(img: Image.Image) -> Image.Image:
    """Centra la imagen en un lienzo cuadrado transparente, sin recortarla."""
    lado = max(img.size)
    lienzo = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    lienzo.paste(img, ((lado - img.width) // 2, (lado - img.height) // 2), img)
    return lienzo


def sobre_fondo(img: Image.Image, lado: int, margen: float) -> Image.Image:
    """Imagen reducida sobre un fondo opaco hecho con ella misma, difuminada: así el borde no se nota."""
    fondo = Image.new("RGBA", (lado, lado), FONDO)
    fondo.alpha_composite(img.resize((lado, lado), Image.LANCZOS).filter(ImageFilter.GaussianBlur(lado / 12)))
    interior = round(lado * (1 - 2 * margen))
    pieza = img.resize((interior, interior), Image.LANCZOS)
    fondo.alpha_composite(pieza, ((lado - interior) // 2, (lado - interior) // 2))
    return fondo


def ico(base: Image.Image) -> None:
    """Icono de Windows con todos los tamaños que usa el sistema (el instalador y los accesos directos)."""
    base.resize((256, 256), Image.LANCZOS).save(
        SALIDA / "icon.ico", sizes=[(n, n) for n in (16, 24, 32, 48, 64, 128, 256)]
    )


def main() -> None:
    if sys.argv[1:] == ["--ico"]:
        ico(Image.open(SALIDA / "icon-512.png").convert("RGBA"))
        return print(f"Listo {SALIDA / 'icon.ico'}")
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    base = cuadrada(Image.open(sys.argv[1]).convert("RGBA"))
    if base.width < 512:
        print(f"Aviso: la imagen mide {base.width} px; se verá borrosa en 512 px.")
    SALIDA.mkdir(exist_ok=True)
    for lado in (192, 512):
        base.resize((lado, lado), Image.LANCZOS).save(SALIDA / f"icon-{lado}.png")
    # Android recorta los iconos "maskable" en círculo: el dibujo va dentro del 80 % central.
    sobre_fondo(base, 512, 0.10).save(SALIDA / "icon-maskable-512.png")
    # iOS no admite transparencia en el icono de inicio.
    sobre_fondo(base, 180, 0.0).convert("RGB").save(SALIDA / "apple-touch-icon.png")
    ico(base)
    if len(sys.argv) == 3:
        marca = Image.open(sys.argv[2]).convert("RGB")
        alto = round(marca.height * ANCHO_MARCA / marca.width)
        marca.resize((ANCHO_MARCA, alto), Image.LANCZOS).save(SALIDA / "marca-sivea.jpg", quality=85, optimize=True)
    print(f"Listo en {SALIDA}")


if __name__ == "__main__":
    main()
