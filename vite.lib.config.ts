import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  plugins: [
    dts({
      include: ['src/lib.ts', 'src/types/**/*.ts', 'src/table/VirtualTable.ts'],
      outDir: 'dist/types',
      tsconfigPath: './tsconfig.lib.json',
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/lib.ts'),
      name: 'DTable',
      fileName: 'dtable',
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      // 无外部依赖，全部打包进去
      external: [],
      output: {
        // UMD 全局变量名
        globals: {},
        // CSS 统一输出为 dist/style.css
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) return 'style.css'
          return assetInfo.name ?? 'asset'
        },
      },
    },
    // 生成 sourcemap，方便调试
    sourcemap: true,
    // 清空 dist 目录
    emptyOutDir: true,
  },
})
