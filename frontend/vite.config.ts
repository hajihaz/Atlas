import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// Prevent serving archived five-strategy records in dev or preview.
const archived=new Set(['/cloud-paper.json','/cloud-paper-daybook.json','/daytrader-nse-demo.json'])
function guard(req:any,res:any,next:()=>void){
 const path=(req.url??'/').split('?')[0]
 if(!archived.has(path)){next();return}
 res.statusCode=410
 res.setHeader('Cache-Control','no-store')
 res.setHeader('Content-Type','application/json; charset=utf-8')
 res.end(JSON.stringify({error:'strategy_retired',activeStrategyId:'scalpstorm_x_0940'}))
}
export default defineConfig({
 plugins:[react(),{name:'scalpstorm-only-archive-guard',configureServer(s){s.middlewares.use(guard)},configurePreviewServer(s){s.middlewares.use(guard)}}],
 build:{outDir:'dist',sourcemap:false},
})
