import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import pkg from './package.json';

// Ruta base de publicación. Por defecto '/' (desarrollo local o dominio propio).
// GitHub Pages sin dominio propio (https://ramonmorillo.github.io/carmo/): CARMO_BASE_PATH=/carmo/
// (lo fija el workflow de despliegue).
const basePath = process.env.CARMO_BASE_PATH?.trim() || '/';

export default defineConfig({
  plugins: [react()],
  base: basePath,
  // Versión de la app registrada en el manifiesto de cada exportación (+ commit si lo aporta el build).
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}${process.env.GITHUB_SHA ? `+${process.env.GITHUB_SHA.slice(0, 7)}` : ''}`),
  },
});
