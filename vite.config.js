import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The adaptive tracks call the Anthropic API from the browser with your own key.
//
// Two ways to supply it, and the difference matters:
//   1. Settings → AI key, stored in localStorage. Portable, and never touches
//      the source tree or the build output. This is the real mechanism.
//   2. ANTHROPIC_KEY in .env — a DEV-ONLY convenience so you don't have to paste
//      it every time on this machine. It is injected only when running `npm run
//      dev`; a production build always gets an empty string, so `npm run build`
//      output can never carry your key. (.env is gitignored.)
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const devKey = command === 'serve' ? env.ANTHROPIC_KEY || '' : ''
  return {
    plugins: [react()],
    define: { __DEV_ANTHROPIC_KEY__: JSON.stringify(devKey) },
    server: { port: 5173 },
  }
})
