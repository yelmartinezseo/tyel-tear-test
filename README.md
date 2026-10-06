# T-Yel · calendario desgarrable

**Demo en vivo:** <https://yel-martinez-portfolio.com/t-yel/> · **Explicación técnica:** <https://yel-martinez-portfolio.com/recursos/tyel-calendario-desgarrable-fisica-de-tela-webgl/>

Almanaque de hojas desgarrables. Cada mes es una hoja de tela simulada en 3D (perspectiva, luz, sombra y
reverso de papel): se arranca tirando de ella; se rasga por donde tires y los trozos sueltos caen. Por día se puede
guardar una nota, un color y un emoji. Botones: Nota, Color, Emoji, Volver (mes anterior, también entre años)
y Hoy (salta al mes actual).

**Todo el código es propio** (© 2026 Yel Martínez, licencia MIT). Sin librerías, sin WebAssembly, sin
imágenes de terceros, sin tipografías ni servicios externos: no se envía nada a ningún servidor. Las hojas
se dibujan por código. Las notas se guardan solo en el
`localStorage` de tu navegador.

## Cómo funciona

- `js/cloth.js` — simulación de tela en 3D: partículas con integración de **Verlet**, **restricciones de
  distancia** y rotura de las que se estiran demasiado; junto a un corte abierto el papel cede con menos
  esfuerzo, así el rasgón sigue el tirón. La fila superior se une a las anillas con una perforación más
  débil. Lo que queda suelto cae por gravedad. Una pared en z = 0 sostiene la hoja de debajo.
- `js/gl.js` — dibujo en **WebGL** propio: cámara con perspectiva, luz difusa y brillo, reverso de la hoja
  como papel blanco y sombra proyectada sobre la hoja siguiente. El borde rasgado sale de un contorno suave
  de las celdas que siguen enteras, con ruido para que sea irregular.
- `js/sheet.js` — pinta cada mes (cabecera de color, iniciales, cuadrícula, día de hoy, notas, colores y emojis).
- `js/app.js` — interfaz, estado, almacenamiento y bucle de animación.

Accesibilidad: con el teclado, `Intro` sobre la hoja la arranca; los paneles son diálogos con botones.
Si WebGL no está disponible o no pinta, se muestra la hoja plana con un aviso.

## Probar en local

```bash
python test/serve.py
```

y abrir <http://127.0.0.1:4500/> (solo escucha en tu equipo y no guarda caché).

## Pruebas

```bash
node test/cloth.test.js    # física: reposo, rotura progresiva, caída, tirón corto sin rotura, profundidad y normales
```

## Imágenes

No hay imágenes: el calendario se dibuja por código.

## Licencia

MIT — ver [LICENSE](LICENSE).
