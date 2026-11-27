<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:166cb6c9dbed4efdf96205590a474ae8b9c8afc3d659634e8f747b79a15f8c00 -->

# Personajes Flyff y Madrigal integrados

Integración en el juego MU existente, preparada para la rama `coderabbit/analyze-and-run-game/dba2b9e1`. Los recursos de ejecución forman parte del repositorio; el juego no requiere descargarlos desde GitHub durante la partida.

## Contenido conectado

- BK (`DK`), Elfo/Elfa (`ELF`), Mago/Maga (`DW`), Dark Lord (`DL`) y Magic Gladiator (`MG`), cada clase en masculino y femenino: diez variantes con vestimenta básica.
- Mallas GLB con texturas integradas, esqueleto nativo de 30 huesos y 13 clips: reposo, caminar, correr, cuatro fases de salto, golpe recibido, muerte, ataque y tres fases de lanzamiento. Las acciones del juego utilizan reposo/carrera, salto, golpe, ataque y lanzamiento; disponer del clip de muerte no añade un sistema nuevo de muerte/reaparición.
- Seis habilidades existentes por clase enlazadas a efectos y sonidos convertidos: 30 asociaciones, 32 WAV disponibles. Se conserva el cálculo de daño, costes, combos, recompensas y zonas seguras del juego.
- Yelmo, torso, pantalones, manos, pies, arma y escudo visibles por pieza. Al retirar o agotar una prenda se muestra el cuerpo base correspondiente. Los golpes desgastan armadura equipada; reparar cuesta 1 Zen por punto de durabilidad. El desgaste se guarda por identificador del ítem para no afectar un reemplazo.
- **19 modelos de armas/escudos** y **diez familias de conjuntos × dos sexos**: 39 GLB adicionales. La selección por nombre/set está en `public/flyff/equipo.json`. Son equivalentes visuales de Flyff asociados al inventario MU; los nombres MU no implican que sean sus modelos originales. Las prendas comparten el esqueleto animado; armas y escudos siguen los anclajes de mano/escudo. Se conserva el brillo por mejora y las alas preexistentes. Los ítems sin asociación usan la apariencia básica disponible; no todos los ítems, alas y mascotas tienen un modelo exclusivo.
- Al romperse el equipo se desprende su geometría en la pose actual. Torso y pantalones utilizan una simulación ligera de tela mediante restricciones entre vértices; las demás piezas caen como fragmentos rígidos. Máximo ocho fragmentos por actor, con retirada tras cuatro segundos. No hay corte arbitrario de polígonos, desgarro topológico ni física completa de ropa; la tela desprendida usa un plano de contacto local.
- Mundo continuo de **3.072 × 3.072 metros (9,44 km²)**, dividido en 36 sectores. Incluye 234 modelos y 10.950 colocaciones, vegetación, construcciones, agua y cráter con lava. Las repeticiones se agrupan por modelo/sector; se liberan sectores, materiales propios y modelos que dejan de utilizarse.
- Cuatro destinos del mismo mundo: **Flaris, Villa del Robledal, Puerto de Bruma y Cráter de Ceniza**. Las tres poblaciones tienen zonas seguras de 720 m de lado. Son puntos de llegada del mismo mundo compartido. Los seis mapas MU anteriores siguen disponibles.
- Colisiones con triángulos nativos, consulta de suelo en plataformas/rampas, comprobación de altura libre y barrido para evitar atravesar paredes delgadas. Los huecos de puertas dependen de la geometría original; un edificio sin interior modelado no adquiere uno automáticamente. No se añade natación.
- NPC y monstruos existentes conectados al terreno; 24.000 registros de monstruos con selección espacial de los cercanos. No se dibujan 24.000 modelos simultáneamente.
- Los nuevos personajes empiezan en Flaris. Las partidas anteriores conservan su mapa; si no guardaron sexo se interpretan como masculinos. La selección permite diez personajes por cuenta. Durabilidad, sexo y destino se guardan en Dexie y viajan por los canales de sincronización existentes.

## Uso y comprobaciones

```bash
bun install --frozen-lockfile
bun run dev
bun run verify:flyff
bun run test:flyff
bun run lint
bun run build
```

En creación selecciona clase y Masculino/Femenino. Dentro del juego abre **Mapas / Madrigal** para viajar. **J** o **Saltar** realizan el salto; Espacio conserva el ataque anterior. En Inventario puedes retirar, equipar y reparar. El primer gesto habilita audio; volumen y silencio respetan Ajustes. Se muestra un estado de carga durante entrada/viaje y el destino se guarda después de cargar correctamente.

Para regenerar los 39 modelos de equipo se necesita Python con NumPy y Pillow:

```bash
python3 tools/flyff/build-equipment.py
```

El descargador comprueba cada archivo contra el identificador Git de la referencia fijada. La caché puede elegirse con `FLYFF_SOURCE_CACHE`; no necesita credenciales del juego.

`?headless=1` es exclusivamente un diagnóstico de desarrollo con Babylon NullEngine. No dibuja personajes ni sustituye WebGL en producción. Con esa entrada abierta y una cuenta de pruebas, la regresión de equipo/anclajes/tela/carga puede ejecutarse en el navegador compartido:

```bash
coderabbit-agent-browser eval --stdin < scripts/flyff-browser-check.js
```

Este diagnóstico cambia el actor y el mapa del Preview. La comprobación estática de recursos y las seis pruebas de colisión se ejecutan sin navegador.

## Verificación y límites

Pasaron TypeScript, compilación de producción/PWA, referencias de recursos, diez variantes/13 clips, salto, visibilidad independiente, persistencia/desgaste/reparación, 30 asociaciones de habilidades, daño, cuatro destinos, precarga de sectores y regreso a Lorencia. Dos clientes WebSocket locales conservaron sexo, destino y equipo. Los 32 WAV se decodificaron con Web Audio en una comprobación anterior; sus archivos no cambiaron.

También se probaron veinte variantes de conjunto, 38 cambios de arma/escudo, correspondencia de anclajes con las armas originales en seis variantes, caída/deformación de prendas sin modificar la malla original, eliminación de fragmentos y descarte de actualizaciones de aspecto obsoletas. Doce recargas de sectores mantuvieron estables las cantidades de mallas, materiales y texturas. Los 39 GLB adicionales pasaron el validador glTF sin errores ni avisos.

Los 856 archivos de recursos y avisos (unos 124 MB sin comprimir) están en producción y en el precache PWA. Esto comprueba el empaquetado; la instalación offline completa en Android no se ha probado. La compilación mantiene el aviso de tamaño del paquete Babylon.

**No está verificado al 100%:** el Chromium compartido de esta tarea carece de WebGL/WebGL2. Las comprobaciones del motor se hicieron con NullEngine; quedan pendientes renderizado GPU, aspecto final de partículas y rendimiento/memoria/input en un teléfono real. Los fotogramas del laboratorio anterior no prueban el renderizado de esta integración.

Los efectos y agua son adaptaciones para Babylon; los objetos ambientales animados se mantienen estáticos. El efecto fuente `magician_fire_casting` carece de una textura original y no está seleccionado en las habilidades. No se afirma equivalencia total con el motor original de Flyff.

## Archivos y procedencia

- `public/flyff/`: recursos, configuraciones y avisos originales.
- `src/game/FlyffContent.ts`: conexión con actores, equipo, audio, efectos y streaming.
- `src/game/flyff/EquipmentAppearance.ts`: prendas y armas por ítem, sexo y anclaje.
- `src/game/flyff/SurfaceCollision.ts`: índice espacial y consultas de colisión/suelo.
- `src/game/flyff/GarmentFragment.js`: caída y tela desprendida.
- `src/game/flyff/runtime.js`: reproductor de recursos convertidos.
- `src/game/flyff/recipes.ts`: asociaciones de habilidades.
- `scripts/check-flyff-assets.mjs`, `scripts/flyff-collision.test.mjs`, `scripts/flyff-browser-check.js`: comprobaciones reproducibles.
- `tools/flyff/`: conversión de equipo y adquisición de recursos fijados.

Referencia pública `ed3ath/flyff-web-mmo`, revisión `7986e75c884174892edc98cc2151df7fcda331fd`. Se conservan los avisos en `public/flyff/licencias/`: la licencia del código no concede automáticamente derechos sobre recursos propietarios de Flyff. No se afirma autorización para redistribuirlos.


<!-- /coderabbit-ai-generated:v1 -->
