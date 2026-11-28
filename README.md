<!-- coderabbit-ai-generated:v1 -->.

<!-- coderabbit-ai-generated-section:v1:2fb7eb4a18185e4bcf0327c578fa7c473ac056b8408e290acc6ff2ad6d4d714b -->

<!-- coderabbit-ai-generated-section:v1:f5bd1837fe274a15d10059730f94c8741693cf9ad5d899da7a6f94a87ea12f59 -->

# MuGro-up'

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:fef764a3793c4f84c9c75364b741b4e75a807a61a0f1c6956f6646dffebcc63e -->

Juego 3D para navegador e instalación Web/APK-WEB (PWA). Esta migración parte de [Mu-GruoUp-V1](https://github.com/faneittealejandro501/Mu-GruoUp-V1) en la revisión `f1fb523cb6d8378e644cb03e80091ef7123d9af7`.

<!-- /coderabbit-ai-generated:v1 -->

## Arrancar

Requiere Node 24 y Bun 1.4.2.

```sh
bun install --frozen-lockfile
bun run dev
```

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:00b33e463a30285f0710d68d68a238beb8a801b8bcdd600e06af8b90aee6a3f2 -->

Abre `http://localhost:3000/`. Crea una cuenta para guardar una partida en el dispositivo. La web no muestra la lista de cuentas locales; la APK-WEB instalada puede recordar el último ID sin guardar la contraseña en el formulario.

### Administración en el juego

Configura en el servidor Node `MU_ADMIN_PASSWORD` con una contraseña nueva de al menos 16 caracteres, guardada como secreto del entorno. Abre el acceso del juego con el ID **Adonyhdp** y ese secreto. La cuenta de administración se recupera rotando el secreto del servidor. El panel permite editar estadísticas y grupos de monstruos, posiciones y tiendas de NPC, e invasiones. Al publicar, los clientes conectados consultan los cambios cada 15 segundos; el mapa activo retira monstruos, NPC y botín del suelo por dos segundos y vuelve a cargarlos. Los grupos manuales se añaden a las patrullas distribuidas por el mapa. Los inventarios, personajes y registros de jefes derrotados se conservan.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:ac186358d1bcf506cf03e46ff86d500c0e7509d7a9a64dc212db056236a6d282 -->

El panel publica al servidor y la web y APK-WEB reciben la revisión automáticamente. Para guardar un cambio también en el código fuente, usa **Exportar configuración para Git**, guarda el archivo como `ADMIN/live-world.json` y revisa el diff antes de publicarlo. La descarga contiene la configuración del mundo.

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

```sh
bun run typecheck:app
bun run verify:flyff
bun run build
bun run test:release
bun run start
```

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:944843e23123a58d7c01f55925e143341d81c46622bcb97b371e59d726827459 -->

GitHub Actions comprueba el proyecto y genera un artefacto descargable llamado **mugroup-web**. Para publicar el juego, abre **Settings → Pages** en el repositorio y elige **GitHub Actions** como fuente. En GitHub Free, Pages requiere un repositorio público; para conservarlo privado se necesita un plan compatible. Cambiar la visibilidad publica el código y sus recursos: el propietario debe decidirlo. Si Pages no está configurado, la compilación se conserva y la publicación mostrará el paso pendiente.

La Web y la PWA comprueban actualizaciones de la ubicación instalada al recuperar la conexión. En **Web / APK-WEB → Comprobar descarga sin conexión**, espera a que se complete la primera instalación antes de cerrar el juego. La partida se guarda por origen del navegador; para trasladarla del sitio anterior al nuevo, exporta e importa el archivo local o usa la copia privada.

<!-- /coderabbit-ai-generated:v1 -->

## Copia privada y salas

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:f3499918a1cde39fc6899a291a654fdd508cf10815c640cab5300caa5a4f0e4a -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:8bb92cff5402417bba038be5132ace540885350a2b9236e5b124af65f15d3513 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:43495f7f9916aa1d04a15a5b0d9548197ac5708a21e14d83139b56342f5e2c89 -->

GitHub Pages publica el cliente web instalable y server-connection.json. Ese archivo indica dónde está el servidor privado de cuentas.

Sin servidor de cuentas, la web sigue funcionando sin conexión después de instalarse. El ID, los personajes y sus objetos quedan en el dispositivo o navegador donde juegas. Allí puedes recuperar el acceso con las dos respuestas locales. Para cambiar de dispositivo sin servidor, exporta el respaldo en **Web / APK-WEB** e impórtalo en el otro antes de iniciar sesión. Una instalación nueva no puede recuperar por ID una partida que nunca se respaldó.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:df098903b1f4ca1450b796d876aa81fb1301d202ca048d2374e874917d2141b5 -->

Al recuperar la conexión, APK-WEB reintenta el respaldo pendiente. Si el navegador admite sincronización en segundo plano, también puede enviar los cambios con la ventana cerrada al servidor oficial de la cuenta vinculada. En los demás navegadores, o con un servidor elegido manualmente, abre el juego con conexión y espera a ver «Copia privada al día».

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:6fa46c870e3a0432a8e8c3cd44b33987122cebc9c0e75233c12dd4dfacfd3a0d -->

1. En un servidor con Node 24 y Bun 1.4.2, obtén esta revisión y ejecuta `bun install --frozen-lockfile`, `bun run build` y `bun run start`. Pon un proxy HTTPS delante del puerto 3000 (o usa el puerto de tu hospedaje con `PORT`).

   También puedes crear el servicio con el Blueprint de Render incluido en `render.yaml` (instancia con disco de pago). Configura los dos secretos indicados en el paso 2 y conserva el disco al actualizar. Si ya tienes cuentas en otro servidor, conserva sus archivos y su clave de recuperación al migrar. El servicio queda listo cuando `/api/account-service` responde con estado 200.


<!-- /coderabbit-ai-generated:v1 -->
<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:1cf1e5126a5a8b56a73865967a0df7331fe22d202817294b48080d429e0699ad -->

2. Configura `MU_BACKUP_DIR` y `MU_WORLD_FILE` en un volumen persistente. Habilita `MU_BACKUP_ORIGINS` y `MU_WORLD_ORIGINS` con `https://mugro-up.github.io`. Genera `MU_RECOVERY_KEY` con `openssl rand -hex 32` y guarda una copia privada junto a los respaldos. Para ADMIN, configura una contraseña nueva con `MU_ADMIN_PASSWORD`.
3. En GitHub → Settings → Secrets and variables → Actions → Variables, define `VITE_BACKUP_URL` con el origen HTTPS del servidor, sin ruta final. Ejecuta **Deploy GitHub Pages**. Puedes verificar la conexión consultando `/MuGro-Up/server-connection.json` en Pages y `/api/ota/manifest` en el servidor.

<!-- /coderabbit-ai-generated:v1 -->

Las cuentas se verifican y respaldan de forma privada. Abre una cuenta existente en el dispositivo donde se creó y espera que sincronice; después podrás iniciar sesión con ese ID o recuperarlo con una sola respuesta y una contraseña nueva. Las preguntas se habilitan al volver a sincronizar. Si el servidor está apagado, se puede seguir jugando con una cuenta ya guardada en ese dispositivo. Con conexión el servidor reserva un ID por cuenta; si dos dispositivos crean el mismo ID sin conexión, el primer respaldo reserva el nombre. La otra partida queda en su dispositivo y puede exportarse desde **Web / APK-WEB**. Conserva el mismo origen y el mismo volumen al migrar el servidor.

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:6d4621f0ebbef0e38453a7cb79cbd42dc2ed234dd03512e69ecc790578e90799 -->

## Instalar APK-WEB

Abre la web con conexión y pulsa **Instalar APK-WEB**. Mantén la página abierta hasta que se guarde el cliente completo. La web y su instalación usan el mismo origen. Para migrar una partida del antiguo instalador nativo, exporta su respaldo antes de desinstalarlo e impórtalo desde el panel de la web.

<!-- /coderabbit-ai-generated:v1 -->

## Contenido y ajustes

- `ADMIN/world-rules.json`: radio de detalles, velocidad base, ajustes de mapas y radio seguro de hasta 500 m. Las capitales bloquean el combate y la entrada de monstruos.
- `ADMIN/monsters.json`: `groups` permite elegir `map`, `monsterId`, `x`, `z`, `count`, `roamRadius`, `hp`, `damage`, `xp`, `zen`, `respawnSeconds` y los tipos de botín en `drops`. Las coordenadas de juego van de 0 a 3072. <!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:57f43f7004c1726d944e22624258302cd11233e56d543e0ecf94c4ff791d49a2 -->

Los grupos no aparecen dentro de una capital. En `drops` puedes usar también identificadores de equipo, como `shop_sw_dragon`; la pieza recogida se guarda en la mochila. En `ADMIN/item-options.json`, `byItem` acepta esos mismos identificadores para ajustar daño, defensa, magia, precio, suerte y opción excelente de las nuevas piezas. Por ejemplo: `"byItem": {"shop_sw_dragon": {"luck": false, "excellentOpt": ""}}`.

<!-- /coderabbit-ai-generated:v1 -->
- `ADMIN/npcs.json`: ubicación y rol del comerciante. Opcionalmente, `stock` es un objeto con identificadores del catálogo como claves y precios enteros en Zen como valores.
- `ADMIN/items.json` y `ADMIN/item-options.json`: multiplicador de precio y aspecto de mejoras, brillos y alas. Los 40 conjuntos artesanales comparten modelos de armadura existentes con acabados distintos y armas originales generadas por el juego.
- **Ajustes → Editar botones HUD**: selecciona la tarjeta de objetivo o el cuadro de daño para redimensionarlo. Puedes arrastrar ambos y mover la barra con su asa.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:4dc51e6d720b2ec4a53a588044e5c337dc018ac91489ef11513a5d9cae616cd6 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:e1d6e24c87f4b275534c371071376868cab3b523b572817aabc5998c831a3e99 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:66a2f574b6d506abeb0095c31f15fcc6653c50ea9b6a75c9346da2f0288b25ca -->

Las reglas base de ADMIN viajan en cada compilación. El panel publica cambios de monstruos, NPC e invasiones cuando hay un servidor configurado. En el juego, Hellpe activa el ataque automático y Combo elige la secuencia. En APK-WEB, espera a que se complete la descarga antes de desconectarte.

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:2b75c09f88a0c7c163a860fc7cdd0d366d816efb168de085069e918e27455ff2 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:c1ca9399acc3671599261b7eb6667b0738ec8400866bbf479d8fa9aebe63915f -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:b96cd116aa201579a1970ba2adbcacc95861619f35821b7b32d83a25edef0eef -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:9eacd2726aca17499e0e5cb022b62c682e1c8e807b1c6a7a01eedfce2ff58be8 -->

Madrigal es un terreno común de 9,44 km² con cuatro regiones y cuatro portales interactivos en cada capital. Se puede caminar de una región a otra sin cargar un mapa nuevo. El minimapa marca los campamentos; la tienda muestra el retrato, el precio y las estadísticas de cada pieza disponible.

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:c4607456c9863d5858b43456bef0531d68dd533569528d7c7ead524e1b583273 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:bc0363c2607bdfa3ce1db4607b7ef9558433539a45a4ed166d4b35a2de18bde0 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:e6198a5be214da8d46625022fb23b7bc1fa661702e7be220ff49f07ea91caf9c -->

La publicación de esta rama usa [FlyffGroup-OnOff](https://jesusalejando725.github.io/FlyffGroup-OnOff/). Para trasladar una partida guardada en [MuGro-Up](https://mugro-up.github.io/MuGro-Up/) o en [Mu-GruoUp-V1](https://faneittealejandro501.github.io/Mu-GruoUp-V1/), abre **Web / APK-WEB → Exportar Respaldo (.json)** en el sitio anterior. En el nuevo, usa **Importar Respaldo (.json)** para restaurar los personajes y su inventario.

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:4e03097d6e41a69e37020e3f1a4e98d2bf3cbb9da1b736ef5fe0e92d82905871 -->

Referencias para el desarrollo: [FlyffWeb](https://github.com/marciobremer/FlyffWeb) y [flyff-web-mmo](https://github.com/ed3ath/flyff-web-mmo).

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:470ae6fddd0ad4c5429b8caa2a65ead53d44370acee09b5485c67c47c51bcf09 -->

## Progresión de Madrigal y economía

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:45a5fdbf1b74f052a9c29daffe419cd25fa4685d986814ec8ce6fc993a0ab845 -->

| Región | Nivel de monstruos | Radio seguro de llegada |
| --- | ---: | ---: |
| Flaris | 1–27 | 90 m |
| Villa del Robledal | 28–48 | 500 m |
| Puerto de Bruma | 49–76 | 250 m |
| Cráter de Ceniza | 77–99 | 100 m |

Los cuatro territorios comparten el mismo mapa. Los campamentos de cinco monstruos tienen sus centros separados al menos 100 m y ocupan suelo apto para cazar. En Cráter de Ceniza cada NPC tiene además una zona segura de 20 m. Los monstruos de campamento reaparecen en su punto original a los 4 segundos por defecto. Las invasiones y las reglas publicadas por administración conservan su configuración propia.

Los HP, la fuerza, la energía y la defensa aumentan con el nivel. La energía se consume en los ataques especiales. Los monstruos de nivel muy superior reciben menos daño hasta que el héroe gana niveles o resets. La tarjeta de objetivo muestra sus valores activos.

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:1a176ee43fe4be7687c0a5eb71068830366e051512efb21a4d43eab705ca6e9f -->

**Hellpe** busca enemigos a 25 m, se acerca, usa combos cuando tiene MP y AG, se cura según los ajustes y se acerca al botín situado a 5 m según los filtros de recogida. Puedes tomar el control con el teclado o el joystick.

### Inventario, tiendas y poderes

La mochila abre la vista 3D del mismo modelo que muestra el comerciante y el que se usa al equipar el objeto. Desde la mochila, abre **Atributos** y usa los botones **+** junto al atributo. Las partidas, el reparto de puntos y los precios de la economía anterior conservan su comportamiento.

Las ofertas originales compatibles se añadieron a seis comerciantes. Las categorías de la tienda separan armas, escudos, conjuntos, alas, joyería, mascotas y consumibles según la oferta del NPC. Las piezas de conjunto se venden por separado. Las tres representaciones del ítem se resuelven en [market-assets.json](public/mugroup/market-assets.json). Algunas alas de la economía personalizada usan apariencias existentes: el juego señala cuál. Los nombres personalizados sin correspondencia en la fuente pueden conservar un icono genérico.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:4ecde9bcbd153ee2e315f11fa5ce5479e1dec3dc25c964a63b5c6d093c46202c -->

Elfo usa las animaciones y sonidos originales de arco, hielo y curación; Blade Knight usa animaciones de espada para Estocada y Barrido. Se conservaron los identificadores de habilidades guardados. Los importadores en `tools/world/` toman sus archivos de la revisión de Flyff fijada en el repositorio.

Los clientes [Flawkee](https://github.com/Flawkee/FlyffUniverse-WebClient/blob/887758f648f2a2d9a3a7cf298798c68fb98bca28/FlyffWCForm.cs#L43) e [ils94](https://github.com/ils94/FlyffUAndroid/blob/3967df867f3fa0095f0e26d28aeb30f959c756fb/app/src/main/java/com/droidev/flyffuwebviewclient/MainActivity.java#L45) cargan el juego oficial en un navegador integrado. Sus repositorios no contienen las pantallas, inventarios ni archivos de poderes o criaturas del juego oficial. Este juego usa los iconos y medios ya integrados en [mugroup](public/mugroup/) y los modelos locales configurados en [worldInvasions.ts](src/data/worldInvasions.ts).

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

[La tabla de economía](src/data/flyffEconomy.ts) define el botín y los precios en Penya (Zen en el HUD). Los monstruos normales sueltan consumibles, materiales y equipo común; los grupos normales configurados por administración no pueden soltar equipo competitivo. Los jefes dan una pieza común garantizada y tienen tiradas independientes de joyería, equipo raro y objetos exclusivos. Las piezas que en la tabla original exigen más de nivel 99 se equipan a nivel 99. Los precios de armadura publicados son por pieza.

El modelo, las animaciones y los sonidos de Beast Overlord Khan se convirtieron de la [referencia fijada de Flyff](https://github.com/ed3ath/flyff-web-mmo/tree/7986e75c884174892edc98cc2151df7fcda331fd/reference/resource). Guan Yu Spike Shield queda reservado a Guan Yu Heavyblade; no está disponible mientras ese jefe no esté en el mundo.

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

<!-- /coderabbit-ai-generated:v1 -->

La [integración anterior](INTEGRACION-RECURSOS.md) se conserva como registro histórico. Los avisos de los recursos importados se conservan en `public/mugroup/licencias/`. Se mantuvieron recursos ya incluidos en el proyecto; el archivo externo de referencia no se incorporó en bloque.


<!-- /coderabbit-ai-generated:v1 -->
