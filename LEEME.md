# La vida de un Ingeniero Civil: servidor online

Esta carpeta es el juego completo con su servidor. La página detecta sola que está en el servidor y activa **Crear sala** y **Unirse con código**.

## Probarlo en tu computador (opcional)

1. Instala Node.js 18 o superior desde https://nodejs.org
2. Abre una terminal en esta carpeta y ejecuta:
   ```
   npm install
   npm start
   ```
3. Abre http://localhost:3000. Otros dispositivos de tu misma red wifi pueden entrar con la IP de tu computador, por ejemplo http://192.168.1.20:3000

## Publicarlo gratis en Render

1. **Crea una cuenta en GitHub** (https://github.com/signup).
2. **Crea un repositorio:** botón **New**, ponle de nombre `vida-ingeniero-civil` y déjalo en **Public**. Marca "Add a README file" y crea el repositorio.
3. **Sube los archivos:** en el repositorio, entra a **Add file → Upload files** y arrastra el *contenido* de esta carpeta: `server.js`, `engine.js`, `package.json`, `LEEME.md` y la carpeta `public` con su `index.html`. No subas `node_modules`. Al final presiona **Commit changes**.
4. **Crea una cuenta en Render** (https://render.com) con el botón "GitHub", para que quede conectada.
5. En Render: **New + → Web Service**, elige el repositorio `vida-ingeniero-civil` y completa:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
6. Presiona **Deploy Web Service**. En 2 o 3 minutos te da una dirección como `https://vida-ingeniero-civil.onrender.com`. Esa es la página que compartes con tus compañeros.

## Bueno saberlo

- En el plan gratis, Render apaga el servidor después de 15 minutos sin uso. La primera persona que entre después espera cerca de un minuto mientras se enciende.
- Si el servidor se reinicia, las salas en curso se pierden.
- Para actualizar el juego, sube los archivos nuevos al mismo repositorio (Add file → Upload files). Render vuelve a publicar solo.
- Si alguien se desconecta, al volver a abrir la página entra de nuevo a su partida. Mientras está fuera, su turno se juega en automático después de 20 segundos.
