// Portable equivalent of src/build.sh; the shell manifest remains the source of order.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=path.join(root,'src');
const manifest=fs.readFileSync(path.join(src,'build.sh'),'utf8').match(/PARTS="([^"]+)"/)[1].split(/\s+/);
const read=name=>fs.readFileSync(path.join(src,name),'utf8');
const body=manifest.map(read).join('\n');
const app=read('17_app.js');
const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:body+'\n'+app.split('</script>')[0],encoding:'utf8'});
if(result.status!==0){process.stderr.write(result.stderr);process.exit(result.status||1);}
fs.writeFileSync(path.join(root,'index.html'),read('00_head.html')+'\n'+body+'\n'+app);
console.log('BUILD_OK');
