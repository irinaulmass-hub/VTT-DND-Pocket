'use strict';
// Local read-only Canvas comparison. Run alongside browser-qa.cjs in the browser's host.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const scene = require('./fixtures/visual-shores-scene.cjs')();
const root = path.resolve(__dirname,'..');
const base = '7de13c6f5fcc6e9d5d29eb2c402bada8f515b566';
const before = execFileSync('git',['show',base+':remote/world-art.js'],{cwd:root});
if(process.env.VISUAL_QA_DATA_DIR) {
  const dir=path.resolve(process.env.VISUAL_QA_DATA_DIR);
  if(path.dirname(dir)!==os.tmpdir() || !/^vtt-browser-qa-[A-Za-z0-9]+$/.test(path.basename(dir)) ||
      !fs.lstatSync(dir).isDirectory() || !fs.existsSync(path.join(dir,'campaigns.json')))
    throw new Error('Use only the disposable DATA_DIR printed by browser-qa.cjs');
  const store = require('../world-store')(name=>path.join(dir,name));
  if(!store.readDraft('50000000-0000-0000-0000-000000000001',[]))store.writeDraft({id:'50000000-0000-0000-0000-000000000001',name:'Графика · Река и поселение',revision:0,...scene});
}
const page = `<!doctype html><meta charset="utf-8"><title>Canvas · Сравнение графики</title>
<style>body{overflow:hidden;margin:0;background:#18201c;color:#e8dec5;font:15px system-ui}header{padding:12px;display:flex;gap:10px;align-items:center}button,select{padding:8px;background:#303b31;color:#fff;border:1px solid #73816a;border-radius:4px}canvas{display:block;width:100vw;height:calc(100vh - 110px)}#results{height:40px;overflow:auto;overflow-wrap:anywhere;margin:8px 12px;white-space:pre-wrap;font:13px monospace}</style>
<header><strong id="version"></strong><select id="scene" aria-label="Кадр"><option value="village">Поселение</option><option value="river">Река и мост</option><option value="forest">Дорога и лес</option><option value="buildings">Постройки</option></select><select id="scale" aria-label="Масштаб"><option>24</option><option>42</option><option>64</option><option>15</option></select><button id="compare">До / после</button><button id="bench">Замер отрисовки</button></header><canvas aria-label="Реальная Canvas-отрисовка тестовой сцены"></canvas><pre id="results">База ${base.slice(0,7)} · одна геометрия, камера и масштаб</pre>
<script src="/remote/world-model.js"></script><script src="/remote/world-decor.js"></script><script src="/art.js?version=VERSION"></script><script src="/remote/world-view.js"></script><script>
const base='${base}',data=SCENE, params=new URLSearchParams(location.search), version=params.get('version')||'after';
document.querySelector('#version').textContent=version==='before'?'ДО · '+ '${base.slice(0,7)}':'ПОСЛЕ · рабочий код';
const canvas=document.querySelector('canvas');canvas.width=innerWidth;canvas.height=innerHeight-110;const view=createWorldView(canvas),select=document.querySelector('#scene'),scale=document.querySelector('#scale');
select.value=params.get('scene')||'village';scale.value=params.get('scale')||'24';
function camera(){const cameras={village:[0,0],river:[-14,0],forest:[16,0],buildings:[2,-7]};const [x,y]=cameras[select.value];return{x,y,scale:+scale.value};}
function change(){view.data(data);view.setCamera(camera());}
select.onchange=change;scale.onchange=change;const initialStart=performance.now();render();const initialRenderMs=performance.now()-initialStart;change();
document.querySelector('#compare').onclick=()=>location.href='/?version='+(version==='before'?'after':'before')+'&scene='+select.value+'&scale='+scale.value;
function render(){const ctx=canvas.getContext('2d'),c=camera(),w=canvas.width,h=canvas.height;ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#e8dec5';ctx.fillRect(0,0,w,h);ctx.translate(w/2,h/2);ctx.scale(c.scale,c.scale);ctx.translate(-c.x,-c.y);const area={left:Math.floor(c.x-w/2/c.scale),right:Math.ceil(c.x+w/2/c.scale),top:Math.floor(c.y-h/2/c.scale),bottom:Math.ceil(c.y+h/2/c.scale)};for(let y=area.top;y<area.bottom;y++)for(let x=area.left;x<area.right;x++){const t=WorldMap.get(data.chunks,x,y);if(t)WorldArt.paintTile(ctx,data.chunks,x,y,t);}const layout=WorldMap.structures(data.objects);for(const p of data.objects)if(WorldMap.boundsIntersect(WorldMap.visualBounds(p),area))WorldArt.paintProp(ctx,p,false,layout);ctx.getImageData(0,0,1,1);}
document.querySelector('#bench').onclick=()=>{const rows=[];for(let i=0;i<25;i++){const start=performance.now();render();rows.push(performance.now()-start);}const warm=rows.slice(5).sort((a,b)=>a-b);const result={version,base,camera:camera(),canvas:[canvas.width,canvas.height],objects:data.objects.length,tiles:Object.values(data.chunks).reduce((n,c)=>n+Object.keys(c).length,0),initialRenderMs,firstMeasuredMs:rows[0],medianMs:(warm[9]+warm[10])/2,p95Ms:warm[18],rowsMs:rows,userAgent:navigator.userAgent};document.querySelector('#results').textContent=JSON.stringify(result);};
</script>`;
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page.replace('VERSION',url.searchParams.get('version')==='before'?'before':'after').replace('SCENE',JSON.stringify(scene)));}
  else if(url.pathname==='/art.js'){res.setHeader('Content-Type','text/javascript');res.end(url.searchParams.get('version')==='before'?before:fs.readFileSync(path.join(root,'remote/world-art.js')));}
  else if(['/remote/world-model.js','/remote/world-decor.js','/remote/world-view.js'].includes(url.pathname)){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(path.join(root,url.pathname)));}
  else {res.writeHead(404);res.end();}
}).listen(3101,'127.0.0.1',()=>console.log('Read-only visual comparison: http://127.0.0.1:3101/?version=before'));
