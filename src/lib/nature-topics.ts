import { pickRandomSample } from './image-picker';
export const NATURE_TOPICS = ['mountain sunrise','alpine lake','misty forest','ocean waves','desert dunes','waterfall','tropical beach','autumn forest','snowy peaks','green valley','canyon landscape','river through forest','wildflower meadow','coastal cliffs','night sky','milky way','aurora borealis','starry desert','moon landscape','blue sky clouds','storm clouds','pink sunset sky','golden hour sky','sun rays through clouds','cloudscape','morning fog','volcanic landscape','glacier','savanna sunset','rainforest','island lagoon','cherry blossoms','bamboo forest','lavender field','rolling hills','moonlit mountains','earth from space'];
let queue:string[]=[];
export const TOPICS_PER_OPEN=3;
export function resetNatureTopicRotation(){queue=[];}
export function nextNatureTopics(n:number,rng=Math.random){const out:string[]=[];while(out.length<n){if(!queue.length)queue=pickRandomSample(NATURE_TOPICS,NATURE_TOPICS.length,rng);out.push(queue.shift()!);}return out;}
