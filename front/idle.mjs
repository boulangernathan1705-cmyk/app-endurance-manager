// A page left open without a gesture (on a second screen during a race…) stops refreshing itself after
// 15 minutes; the first click, key or scroll brings it back up to date.
const IDLE_AFTER_MS=15*60000;
let lastActivity=Date.now();
const wakers=new Set();

function activity(){
  const wasIdle=isIdle();
  lastActivity=Date.now();
  if(wasIdle)for(const wake of wakers)wake();
}
for(const type of ['pointerdown','keydown','wheel','touchstart','scroll'])addEventListener(type,activity,{passive:true,capture:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)activity();});

export function isIdle(){return Date.now()-lastActivity>IDLE_AFTER_MS;}
export function onWake(callback){wakers.add(callback);}
