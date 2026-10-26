# MesaDnd

Tablero táctil para las partidas de D&D: mapa con foto de fondo dividido en celdas y fichas redondas de jugadores y enemigos.

## Estructura

```
index.html              Pantallas de Preparar y de partida
css/styles.css          Estilos
js/app.js               Toda la lógica (jugadores, enemigos, galería de mapas, gestos, modo mesa)
assets/avatars/         Retratos por defecto (Mario, Maria)
assets/maps/            Mapas incluidos de serie (taberna)
manifest.webmanifest    Para instalarla en la tablet como app
```

## Ejecutarla en local

1. Abre la carpeta en Visual Studio Code.
2. Instala la extensión recomendada **Live Server** (VS Code la sugiere al abrir la carpeta).
3. Clic derecho en `index.html` → **Open with Live Server**.

No abras el `index.html` con doble clic: algunos navegadores bloquean el guardado (IndexedDB) en archivos locales.

## Dónde tocar

- Jugadores: constante `PLAYERS` al principio de `js/app.js` (nombre, clase, color del aro).
- Retratos por defecto: `DEF_AV` en `js/app.js` + imágenes en `assets/avatars/`.
- Mapa incluido: `TABERNA_SRC` y `BUILTIN` en `js/app.js`.
- Colores y tipografías: bloque `:root` al principio de `css/styles.css`.

## Datos guardados

Todo se guarda en el navegador de cada dispositivo: ajustes en `localStorage` (clave `mesa-isla-v1`) y las fotos de mapas subidas en IndexedDB (`mesa-isla`). Estas claves conservan el nombre antiguo a propósito: cambiarlas haría perder lo ya guardado. Lo que preparas en el ordenador no pasa solo a la tablet.
