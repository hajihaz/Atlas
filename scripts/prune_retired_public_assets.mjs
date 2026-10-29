// An immutable source archive can remain in Git without being distributed by Vite.
// Never ship retired strategy account JSON to production static hosting.
import {unlink,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const dist=new URL('../frontend/dist/',import.meta.url);
const retired=['cloud-paper.json','cloud-paper-daybook.json','daytrader-nse-demo.json'];
for(const name of retired){
 const file=new URL(name,dist);
 try{const info=await stat(file);if(!info.isFile())throw Error('Unexpected retired asset type');
   await unlink(file);
 }catch(error){if(error?.code!=='ENOENT')throw error;}
}
console.log('Atlas public build excludes retired strategy artifacts:',retired.join(', '));
