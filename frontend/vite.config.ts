import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  // Monaco 随应用打包，首次用到编辑器时才动态 import（utils/monacoLocal）。提前预打包：
  // 否则开发时第一次打开 SQL 标签页会触发依赖重新优化，整页刷新
  optimizeDeps: {
    include: [
      'monaco-editor/esm/vs/editor/edcore.main.js',
      'monaco-editor/esm/vs/editor/editor.api.js',
      'monaco-editor/esm/vs/basic-languages/sql/sql.contribution.js',
    ],
  },
  resolve: {
    alias: [
      {
        // 仅匹配裸包名：antd 内部 `@ant-design/icons/es/*` 深层导入必须继续走原包，
        // 否则依赖优化阶段会尝试把子路径拼到适配层文件上而报 UNLOADABLE_DEPENDENCY
        find: /^@ant-design\/icons$/,
        replacement: fileURLToPath(new URL("./src/icons/antdIcons.tsx", import.meta.url)),
      },
    ],
  },
  server: {
    port: 5100,
    strictPort: true,
    host: '127.0.0.1',
    cors: true,
    hmr: {
      host: '127.0.0.1',
      port: 5100,
      protocol: 'ws',
    },
  },
  build: {
    target: ["es2022", "chrome100", "safari15"],
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
