<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:cb0fb9fa7e75903e337a32f3078694e6452350c31400bd2b004fea8e81fc791a -->

# Personajes Astrales

En **Crear Personaje**, el dúo Astral aparece junto a los personajes originales. Selecciona su tarjeta y cambia entre Femenino y Masculino. Usa los poderes del Mago. Una partida con una apariencia retirada usa el modelo original de su clase; los personajes y sus objetos se conservan.

Los modelos y retratos se sirven desde `public/mugroup/personajes/mobilee` y forman parte de la instalación sin conexión. El archivo Blender de la carpeta 2 de [Personajes.zip](https://github.com/angelicamarin313555/Mobilee/blob/982b6e7ff1e0eb18a75b6e0b7c586bed2968f3c5/Personajes.zip) aporta la chaqueta. El cuerpo, el sombrero y los detalles completan el modelo. Para reconstruirlo desde la raíz con bpy 5.0.1, NumPy y Pillow: `python tools/mobilee/build.py /ruta/Personajes`.

## Publicar y recuperar

Publica el cliente en el mismo dominio y ruta y aumenta la versión de `public/ota-manifest.json` con cada entrega. La aplicación comprueba el service worker al abrirse, al volver a primer plano y al recuperar conexión. Una instalación anterior a 2.6 puede necesitar cerrarse completamente y volver a abrirse una vez.

Para dar recuperación entre dispositivos a los jugadores de Pages, despliega el servidor incluido sobre HTTPS, con almacenamiento persistente en `MU_BACKUP_DIR` y el origen de Pages permitido en `MU_BACKUP_ORIGINS`. Configura la variable de Actions `VITE_BACKUP_URL` con la URL base del servidor y vuelve a publicar. En selección de personaje, abre **Copia y recuperación de cuenta**, activa la copia y guarda el código. Tras la primera sincronización, se puede restaurar desde **Recuperar cuenta**. GitHub Pages por sí solo no almacena respaldos privados.


<!-- /coderabbit-ai-generated:v1 -->