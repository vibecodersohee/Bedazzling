import { defineConfig } from 'vite';

// GitHub Pages serves the site from /<repo-name>/, so the workflow passes VITE_BASE.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
});
