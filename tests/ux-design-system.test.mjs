import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {join} from 'node:path';

const root=new URL('../public/',import.meta.url);
const file=name=>readFileSync(new URL(name,root),'utf8');

test('UI shell: design tokens, local scripts, icon and fonts are wired',()=>{
 const html=file('index.html');
 for(const asset of ['app.css','studio.css','refined.css','app.js','interface.js','icon.svg']){
  assert.match(html,new RegExp('/'+asset.replace('.','\\.')));
 }
 assert.match(html,/Instrument\+Sans/);
 assert.match(html,/<html lang="pt-BR">/);
 assert.match(html,/noindex, nofollow/);
 const css=file('refined.css');
 for(const className of ['.sidebar','.page-heading','.stat-card','.table-scroll','.cmd-dialog']){
  assert.ok(css.includes(className),className);
 }
 assert.match(css,/\[data-theme="dark"\]/);
 assert.match(css,/@media\(max-width:680px\)/);
 assert.match(css, /prefers-reduced-motion/);
});

test('UI controls: palette is local and reuses authorized CRM actions',()=>{
 const palette=file('interface.js');
 const app=file('app.js');
 for(const id of ['dashboard','orders','products','contacts','finance','settings']){
  assert.match(palette,new RegExp("section:'"+id+"'"));
 }
 assert.match(palette,/aria-modal="true"/);
 assert.match(palette,/e\.metaKey/);
 assert.match(palette,/e\.ctrlKey/);
 assert.match(palette,/dataset\.action/);
 assert.doesNotMatch(palette,/\bfetch\(/);
 assert.match(app,/const ICON_PATHS=/);
 assert.match(app,/data-command-open/);
 assert.match(app,/class="quick-create"/);
 assert.doesNotMatch(app,/\.nav-item'\)\.forEach\(btn=>btn\.onclick/);
});

test('PWA: branded app metadata and revised cache keys',()=>{
 const manifest=JSON.parse(file('manifest.webmanifest'));
 assert.match(manifest.name,/Macumbiinha/);
 assert.equal(manifest.display,'standalone');
 assert.ok(manifest.icons.some(icon=>icon.sizes==='192x192'));
 assert.ok(manifest.icons.some(icon=>icon.sizes==='512x512'));
 const icon=file('icon.svg');
 assert.match(icon,/<svg/);assert.match(icon,/stroke="#18392A"/);
 const sw=file('sw.js');
 for(const asset of ['refined.css','interface.js','icon.svg']){
  assert.ok(sw.includes(asset),asset);
 }
 assert.match(sw,/startsWith\('\/api\/\'/);
 assert.match(sw,/crm-shell-v5/);
});
