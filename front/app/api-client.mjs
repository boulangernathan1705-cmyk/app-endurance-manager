// HTTP transport for the race workspace, including its conditional reads and diagnostics.
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const tick = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
function networkFailure(error) {
  return error instanceof TypeError || /networkerror|failed to fetch|load failed/i.test(String(error?.message || error || ''));
}
function onlineLabel() {
  return typeof navigator === 'undefined' ? 'inconnu' : (navigator.onLine ? 'oui' : 'non');
}
function diagnosticMessage(path,method,stage,extra='') {
  return `Connexion au service impossible. Diagnostic : ${method} ${path} · ${stage} · navigateur en ligne : ${onlineLabel()}${extra ? ` · ${extra}` : ''}`;
}
export function reportClientError({kind='network',path='',method='',message='',detail=''}) {
  try {
    const payload=JSON.stringify({kind,page:location.pathname.slice(0,160),apiPath:String(path).slice(0,160),method:String(method).slice(0,12),message:String(message).slice(0,500),detail:String(detail).slice(0,1000),userAgent:navigator.userAgent.slice(0,500),viewport:`${innerWidth}x${innerHeight}`,online:navigator.onLine!==false});
    // One report per error: the beacon when the browser accepts it, a keepalive fetch otherwise.
    try { if (navigator.sendBeacon?.('/telemetry/client-error',new Blob([payload],{type:'text/plain;charset=UTF-8'}))) return; } catch {}
    fetch('/telemetry/client-error',{method:'POST',credentials:'same-origin',cache:'no-store',keepalive:true,headers:{'Content-Type':'text/plain;charset=UTF-8'},body:payload}).catch(()=>{});
  } catch {}
}
function xhrApi(path,method,data,priorDetail='') {
  return new Promise((resolve,reject) => {
    const started=tick();
    const request = new XMLHttpRequest();
    request.open(method,path,true);
    request.withCredentials=true;
    request.setRequestHeader('Accept','application/json');
    if (method !== 'GET') request.setRequestHeader('Content-Type','application/json');
    request.onload=()=>{
      const elapsed=Math.round(tick()-started);
      let result;
      try { result=JSON.parse(request.responseText || '{}'); }
      catch { const error=Error(diagnosticMessage(path,method,'réponse XHR illisible',`statut ${request.status} · ${elapsed} ms · ${request.responseText?.length||0} caractères`)); reportClientError({path,method,message:error.message,detail:`${priorDetail}; xhr status ${request.status}; ${elapsed}ms; chars ${request.responseText?.length||0}`}); reject(error); return; }
      if (request.status < 200 || request.status >= 300) { reject(Error(result.error || `Cette action a échoué (${request.status}).`)); return; }
      resolve(result);
    };
    request.onerror=()=>{const elapsed=Math.round(tick()-started);const error=Error(diagnosticMessage(path,method,'fetch ×2 + secours XHR en échec',`statut XHR 0 · ${elapsed} ms`));reportClientError({path,method,message:error.message,detail:`${priorDetail}; xhr error status 0; ${elapsed}ms`});reject(error);};
    request.ontimeout=()=>{const elapsed=Math.round(tick()-started);const error=Error(diagnosticMessage(path,method,'fetch ×2 + secours XHR expiré',`délai 12 s · ${elapsed} ms`));reportClientError({path,method,message:error.message,detail:`${priorDetail}; xhr timeout; ${elapsed}ms`});reject(error);};
    request.timeout=12000;
    request.send(method==='GET'?null:JSON.stringify(data||{}));
  });
}
export async function api(path,method='GET',data,conditional=null) {
  const attempts=[];
  // Only reads are tried again: a creation whose answer was lost may already be saved (no duplicate race).
  const tries=method==='GET'?2:1;
  for (let attempt=0;attempt<tries;attempt++) {
    const started=tick();
    try {
      const headers=method==='GET'?{'Accept':'application/json'}:{'Accept':'application/json','Content-Type':'application/json'};
      if (method==='GET' && conditional?.tag && conditional.data) headers['If-None-Match']=conditional.tag;
      const response = await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers,body:method==='GET'?undefined:JSON.stringify(data||{})});
      if (response.status===304 && conditional?.tag && conditional.data) return structuredClone(conditional.data);
      const elapsed=Math.round(tick()-started);
      const text=await response.text();
      const bytes=new TextEncoder().encode(text).length;
      let result;
      try { result=JSON.parse(text); }
      catch { const error=Error(`Le service partagé ne répond pas correctement (${method} ${path}, statut ${response.status}, ${bytes} octets).`);reportClientError({path,method,message:error.message,detail:`fetch ${attempt+1}; ${elapsed}ms; status ${response.status}; ${bytes} bytes; server ${response.headers.get('X-Endurance-Approx-Bytes')||'n/a'}`});throw error; }
      if (!response.ok) throw Error(result.error || `Cette action a échoué (${response.status}).`);
      if (conditional && method==='GET') {
        conditional.tag=response.headers.get('ETag')||'';
        conditional.data=conditional.tag?structuredClone(result):null;
      }
      return result;
    } catch (error) {
      const elapsed=Math.round(tick()-started);
      if (!networkFailure(error)) throw error;
      attempts.push(`fetch ${attempt+1}: ${elapsed}ms ${String(error?.message || error || 'erreur réseau').slice(0,90)}`);
      if (attempt+1<tries) await wait(250);
    }
  }
  const priorDetail=attempts.join(' | ');
  if (method!=='GET') {
    const error=Error('Connexion au service impossible : ta demande n’a peut-être pas été enregistrée. Actualise la page pour vérifier avant de réessayer.');
    reportClientError({path,method,message:diagnosticMessage(path,method,'envoi en échec, non renvoyé'),detail:priorDetail});
    throw error;
  }
  // XHR is an unconditional fallback; an older tag must never label its newer response.
  if (conditional) { conditional.tag=''; conditional.data=null; }
  try { return await xhrApi(path,method,data,priorDetail); }
  catch (error) {
    if (/Diagnostic :/.test(String(error?.message || ''))) throw error;
    const wrapped=Error(diagnosticMessage(path,method,'secours XHR en échec',priorDetail));
    reportClientError({path,method,message:wrapped.message,detail:priorDetail});
    throw wrapped;
  }
}
