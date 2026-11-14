'use strict';
// Derived, bounded geometry only. Access decisions and projection stay in world-exploration.
const {address,visualBounds,size,props,valid,objectLimit}=require('./remote/world-model');

function build(source) {
  if (!source || !Object.isFrozen(source) || Object.getOwnPropertySymbols(source).length) return null;
  const array=Array.isArray(source),prototype=Object.getPrototypeOf(source);
  if (prototype!==(array?Array.prototype:Object.prototype) && prototype!==null) return null;
  if (array && source.length>objectLimit) return null;
  const keys=Object.keys(source);
  if (keys.length>objectLimit || array && keys.length!==source.length) return null;
  const ordered=[],buckets=new Map(),byId=new Map();
  let memberships=0;
  for (let ordinal=0;ordinal<keys.length;ordinal++) {
    if (array && keys[ordinal]!==String(ordinal)) return null;
    const descriptor=Object.getOwnPropertyDescriptor(source,keys[ordinal]);
    if (!descriptor || !Object.hasOwn(descriptor,'value')) return null;
    const prop=descriptor.value;
    if (!prop || !Object.isFrozen(prop) ||
        ![Object.prototype,null].includes(Object.getPrototypeOf(prop))) return null;
    const fields=Object.getOwnPropertyDescriptors(prop);
    if (Object.values(fields).some(field=>!Object.hasOwn(field,'value'))) return null;
    const value=name=>fields[name]?.value;
    const id=value('id'),kind=value('kind'),x=value('x'),y=value('y'),turn=value('turn');
    if (typeof id!=='string' || typeof kind!=='string' || !valid(x) || !valid(y) ||
        ![0,1,2,3].includes(turn) || byId.has(id)) return null;
    for (const name of ['hidden','open']) if (value(name)!==undefined && typeof value(name)!=='boolean') return null;
    const covered=new Set([address(x,y)[0]]);
    if (Object.hasOwn(props,kind)) {
      const bounds=visualBounds(prop);
      if (!Object.values(bounds).every(Number.isFinite)) return null;
      const left=Math.floor(bounds.left/size),right=Math.ceil(bounds.right/size);
      const top=Math.floor(bounds.top/size),bottom=Math.ceil(bounds.bottom/size);
      if (right<=left || bottom<=top || (right-left)*(bottom-top)>16) return null;
      for (let cy=top;cy<bottom;cy++)for (let cx=left;cx<right;cx++)covered.add(cx+','+cy);
    }
    memberships+=covered.size;
    if (memberships>objectLimit*5) return null;
    ordered.push(prop);byId.set(id,prop);
    for (const key of covered) {
      if (!buckets.has(key)) buckets.set(key,[]);
      buckets.get(key).push(ordinal);
    }
  }
  return Object.freeze({
    select(keys) {
      const selected=new Set();
      for (const key of keys)for (const ordinal of buckets.get(key)||[])selected.add(ordinal);
      // Preserve source order independently of request order and shared chunk membership.
      return [...selected].sort((a,b)=>a-b).map(ordinal=>ordered[ordinal]);
    },
    find:id=>byId.get(id),
  });
}

module.exports=function createObjectIndexCache() {
  let entry;
  return {clear() {entry=undefined;},get(source) {
    if (entry?.source===source) return entry.index;
    entry=undefined;
    const index=build(source);
    if (index) entry={source,index};
    return index;
  }};
};
