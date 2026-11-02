import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import {rmSync} from 'node:fs'
import {join} from 'node:path'

// Legacy research fixtures are retained locally but excluded from the site.
const legacyPaperAssets=[
 'cloud-paper.json','cloud-paper-daybook.json',
 'scalpstorm-report.json','scalpstorm-breakdown.json',
 'scalpstorm-breakdown.txt','scalpstorm-chat-report.txt'
]
export default defineConfig({
 plugins: [react(),{
  name:'atlas-retire-legacy-paper-public-assets',
  closeBundle(){for(const name of legacyPaperAssets)rmSync(join(import.meta.dirname,'dist',name),{force:true})}
 }],
 build: { outDir: 'dist', sourcemap: false }
})
