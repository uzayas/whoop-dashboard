import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' sorgt dafür, dass die App auch unter
// https://<user>.github.io/<repo>/ korrekt lädt.
export default defineConfig({
  plugins: [react()],
  base: './',
});
