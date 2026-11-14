'use strict';
(() => {
 const id=new URLSearchParams(location.search).get('game') || 'default';
 const tableView = /^\/tv\/?$/.test(location.pathname);
 if (tableView) document.documentElement.dataset.tableView = '';
 window.currentCampaignId=id;
 const scopedUrl=value=>{
  const url=new URL(value,location.href);
  if(url.host===location.host && (url.pathname.startsWith('/api/') || url.pathname==='/ws')){
   url.searchParams.set('game',id);
   if(tableView)url.searchParams.set('view','table');
  }
  return url.href;
 };
 const nativeFetch=window.fetch.bind(window);
 window.fetch=(input,options)=>{
  const url=scopedUrl(input instanceof Request ? input.url : input);
  const request=input instanceof Request ? new Request(url,input) : url;
  return nativeFetch(request,tableView ? {...options,credentials:'omit'} : options);
 };
 const NativeSocket=window.WebSocket;
 window.WebSocket=class extends NativeSocket {constructor(url,protocols){super(scopedUrl(url),protocols);}};
 // Separate saved character selection, initiative and map settings in each campaign.
 const get=Storage.prototype.getItem,set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
 const key=k=>id==='default'?k:'campaign:'+id+':'+k;
 Storage.prototype.getItem=function(k){return get.call(this,key(k));};
 Storage.prototype.setItem=function(k,v){return set.call(this,key(k),v);};
 Storage.prototype.removeItem=function(k){return remove.call(this,key(k));};
 document.addEventListener('DOMContentLoaded',async()=>{
  if (tableView) return;
  const builderBack = document.getElementById('builder-back');
  if (builderBack) {
   builderBack.href = '/?game=' + encodeURIComponent(id);
   document.getElementById('builder-world').href = builderBack.href + '&view=maps#world-map-editor';
   return;
  }
  const bar=document.createElement('div');bar.id='campaign-toolbar';bar.style.cssText='padding:10px 16px;background:#19211e;color:#eee4ce;display:flex;gap:10px;align-items:center;flex-wrap:wrap';
  const label=document.createElement('label');label.textContent='Кампания: ';const select=document.createElement('select');select.setAttribute('aria-label','Выбор кампании');label.append(select);bar.append(label);document.body.prepend(bar);
  const error=document.createElement('span');error.setAttribute('role','status');bar.append(error);
  const navigate=game=>{const url=new URL(location.href);url.searchParams.set('game',game);url.searchParams.delete('character');location.assign(url);};
  try {
   const response=await fetch('/api/campaigns');if(!response.ok)throw Error('Кампания недоступна');const data=await response.json();
   for(const c of data.campaigns){const option=document.createElement('option');option.value=c.id;option.textContent=c.name;option.selected=c.id===id;select.append(option);}select.onchange=()=>navigate(select.value);
   if(location.pathname==='/' || location.pathname.startsWith('/dm/')){
    const form=document.createElement('form'),input=document.createElement('input'),button=document.createElement('button');input.placeholder='Название новой кампании';input.required=true;input.maxLength=80;input.setAttribute('aria-label','Название новой кампании');button.textContent='Создать кампанию';
    const pack = document.createElement('select');
    pack.setAttribute('aria-label','Стартовый набор');
    pack.append(new Option('Пустая кампания',''),new Option('Гоблинские войны','goblin-wars'));
    form.append(input,pack,button);bar.append(form);
    form.onsubmit=async event=>{event.preventDefault();button.disabled=true;try{const res=await fetch('/api/campaigns',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:input.value,pack:pack.value})});if(!res.ok)throw Error('Не удалось создать кампанию');navigate((await res.json()).id);}catch(e){error.textContent=e.message;button.disabled=false;}};
   }
   // Keep links to player/TV views in the selected campaign, including links added later.
   document.addEventListener('click',event=>{const a=event.target.closest('a');if(!a)return;const url=new URL(a.href,location.href);if(url.origin===location.origin && ['/player','/tv','/remote/player','/dm/access.html'].includes(url.pathname)){url.searchParams.set('game',id);a.href=url.href;}},true);
  }catch(e){error.textContent=e.message;}
 });
})();
