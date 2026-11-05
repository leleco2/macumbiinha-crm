/** Build branded raster icons from the canonical SVG mark.
 *  Run before preview/deploy to keep PWA icons visually consistent.
 *  The SVG is the sole editable source of truth.
 */
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const dir=new URL('../public/',import.meta.url);
const logo=await readFile(new URL('icon.svg',dir));
for(const size of [192,512]){
 const output=new URL(`icon-${size}.png`,dir);
 await sharp(logo).resize(size,size,{fit:'contain'}).png({compressionLevel:9,palette:true,colours:128}).toFile(fileURLToPath(output));
 const info=await sharp(fileURLToPath(output)).metadata();
 if(info.width!==size||info.height!==size)throw new Error(`Ícone inválido: ${output}`);
 console.log(`Ícone atualizado: ${size}×${size}`);
}
