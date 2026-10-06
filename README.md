# T-Yel · calendario desgarrable

Almanaque de hojas desgarrables. Cada mes es una hoja de tela simulada en 3D (perspectiva, luz, sombra y
reverso de papel): se arranca de la perforación junto a las anillas tirando hacia abajo. Por día se puede
guardar una nota, un color y un emoji. Botones: Nota, Color, Emoji, Volver (mes anterior, también entre años)
y Hoy (salta al mes actual).

**Todo el código es propio** (© 2026 Yel Martínez, licencia MIT). Sin librerías, sin WebAssembly, sin
imágenes de terceros, sin tipografías ni servicios externos: no se envía nada a ningún servidor. Las hojas
se dibujan por código. Las notas se guardan solo en el
`localStorage` de tu navegador.

## Cómo funciona

- `js/cloth.js` — simulación de tela en 3D: partículas con integración de **Verlet**, **restricciones de
  distancia** y rotura de las que se estiran demasiado. La fila superior se une a las anillas con una
  perforación más débil, por eso la hoja se rasga por ahí. Una pared en z = 0 sostiene la hoja de debajo.
- `js/gl.js` — dibujo en **WebGL** propio: cámara con perspectiva, luz difusa y brillo, reverso de la hoja
  como papel blanco y sombra proyectada sobre la hoja siguiente.
- `js/sheet.js` — pinta cada mes (cabecera de color, iniciales, cuadrícula, día de hoy, notas, colores y emojis).
- `js/app.js` — interfaz, estado, almacenamiento y bucle de animación.

Accesibilidad: con el teclado, `Intro` sobre la hoja la arranca; los paneles son diálogos con botones.

## Probar en local

```bash
python -m http.server 4500 --bind 127.0.0.1
```

y abrir <http://127.0.0.1:4500/>.

## Pruebas

```bash
node test/cloth.test.js    # física: reposo, rotura progresiva, caída, tirón corto sin rotura, profundidad y normales
```

## Imágenes

No hay imágenes: el calendario se dibuja por código.

## Licencia

MIT — ver [LICENSE](LICENSE).
