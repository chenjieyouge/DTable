import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@': `${__dirname}/src`,
    },
  },
  server: {
    host: '0.0.0.0',  // 允许外部访问
    proxy: {
      "/api": {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
