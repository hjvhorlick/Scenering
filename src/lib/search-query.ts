const STOP = new Set('a an the and or of in on to for with from by is are was were this that as at into'.split(' '));
const stem = (w: string) => w.toLowerCase().replace(/ies$/,'y').replace(/(ses|xes|zes|ches|shes)$/,'').replace(/s$/,'');
export function broadenQuery(query: string, maxSteps = 4): string[] {
  const original = query.trim().replace(/\s+/g,' '); if (!original) return ['nature'];
  const words = original.split(' '), add = (x: string, out: string[]) => { x=x.trim(); if(x && !out.includes(x)) out.push(x); };
  const out: string[]=[]; add(original,out); add(words.filter(w=>!STOP.has(w.toLowerCase())).join(' '),out);
  const qualifiers = new Set(['beautiful','dramatic','stunning','scenic','peaceful','cinematic','high quality','photo','photograph','image','background']);
  add(words.filter(w=>!qualifiers.has(w.toLowerCase())&&!STOP.has(w.toLowerCase())).join(' '),out);
  add(words.filter(w=>!STOP.has(w.toLowerCase())).slice(-2).join(' '),out); add(words.filter(w=>!STOP.has(w.toLowerCase())).slice(-1)[0]||words[words.length-1]||original,out);
  return out.slice(0,Math.max(1,maxSteps));
}
export function matchFallbackPhotos(query: string, deck: readonly any[]): any[] {
  const terms=query.toLowerCase().split(/\W+/).filter(Boolean).map(stem); if(!terms.length)return [];
  return deck.map((x,i)=>({x,i,score:terms.reduce((n,t)=>n+(stem(String(x.category||''))===t?3:0)+(String(x.name||'').toLowerCase().split(/\W+/).some((w:string)=>stem(w)===t)?2:0),0)})).filter(y=>y.score>0).sort((a,b)=>b.score-a.score||a.i-b.i).map(y=>y.x);
}
