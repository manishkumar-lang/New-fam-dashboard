const crypto = require('crypto');

const MAIN_SHEET_ID = process.env.GOOGLE_SHEET_ID;
const REGISTRY_SHEET = 'Personal Users';
const DEFAULT_CLIENT_ID = '255689281984-2t3k3fe19srh84tnjqk3um3psfda58ie.apps.googleusercontent.com';
const MAX_PERSONAL_CONNECTIONS = 10;
let serviceTokenCache = {token:'', expiresAt:0};
let serviceTokenInflight = null;

function b64url(input) { return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_'); }
function json(statusCode, body, extraHeaders={}) { return { statusCode, headers: {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...extraHeaders}, body: JSON.stringify(body) }; }
function originHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const h = {};
  if (origin) h['Access-Control-Allow-Origin'] = origin;
  h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
  h['Access-Control-Allow-Methods'] = 'GET,POST,DELETE,OPTIONS';
  return h;
}
function sheetIdFromInput(value) {
  const s = String(value || '').trim();
  const m = s.match(/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  return '';
}

async function serviceToken(scope='https://www.googleapis.com/auth/spreadsheets') {
  const now=Math.floor(Date.now()/1000);
  if(serviceTokenCache.token && serviceTokenCache.scope===scope && serviceTokenCache.expiresAt-now>120) return serviceTokenCache.token;
  if(serviceTokenInflight) return serviceTokenInflight;
  serviceTokenInflight=(async()=>{
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    if (!email || !raw) throw new Error('Google service-account environment variables are missing.');
    const key = raw.replace(/\\n/g,'\n');
    const header = b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
    const claim = b64url(JSON.stringify({iss:email,scope,aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
    const signer = crypto.createSign('RSA-SHA256'); signer.update(`${header}.${claim}`);
    const assertion = `${header}.${claim}.${b64url(signer.sign(key))}`;
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),10000);
    try {
      const r = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(assertion)}`,signal:controller.signal});
      const j = await r.json().catch(()=>({}));
      if(!r.ok) throw new Error(`Google service-account token error: ${j.error_description||j.error||r.status}`);
      if(!j.access_token) throw new Error('Google service-account token response did not contain an access token.');
      serviceTokenCache={token:j.access_token,scope,expiresAt:now+Math.max(300,Number(j.expires_in)||3600)};
      return j.access_token;
    } finally { clearTimeout(timer); }
  })().finally(()=>{serviceTokenInflight=null;});
  return serviceTokenInflight;
}

async function verify(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) throw Object.assign(new Error('Google sign-in is required.'),{statusCode:401});
  const clientId = process.env.GOOGLE_CLIENT_ID || DEFAULT_CLIENT_ID;
  const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(m[1])}`);
  const j = await r.json().catch(()=>({}));
  if (!r.ok || j.aud !== clientId || j.email_verified !== 'true') throw Object.assign(new Error('Google ID token is invalid or expired.'),{statusCode:401});
  const allowed = (process.env.GOOGLE_ALLOWED_DOMAIN || 'wellversed.in').toLowerCase();
  const email = String(j.email||'').toLowerCase();
  if (allowed && !email.endsWith('@'+allowed)) throw Object.assign(new Error(`Only @${allowed} Google Workspace accounts are allowed.`),{statusCode:403});
  return {email,name:j.name||'',picture:j.picture||'',sub:j.sub};
}

async function gget(url, token, options={}) {
  let lastError=null;
  for(let attempt=1;attempt<=3;attempt++){
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12000);
    try {
      const r=await fetch(url,{...options,signal:controller.signal,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}});
      const text=await r.text(); let j={}; try{j=JSON.parse(text);}catch{}
      if(r.ok) return j;
      lastError=new Error(j.error?.message || j.error_description || `Google Sheets API error ${r.status}`);
      if(![408,429,500,502,503,504].includes(r.status)||attempt===3) throw lastError;
    } catch(e) {
      lastError=e instanceof Error?e:new Error(String(e));
      if(attempt===3) throw lastError;
    } finally { clearTimeout(timer); }
    await new Promise(resolve=>setTimeout(resolve,350*Math.pow(2,attempt-1)+Math.floor(Math.random()*150)));
  }
  throw lastError||new Error('Google Sheets API request failed.');
}

async function values(token, sid, range) {
  const u = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sid)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  const j = await gget(u,token); return j.values||[];
}
async function spreadsheet(token, sid) {
  return gget(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sid)}?includeGridData=false`,token);
}
async function batchValues(token, sid, ranges) {
  if(!ranges.length) return [];
  const out=[];
  for(let i=0;i<ranges.length;i+=40){
    const u=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sid)}/values:batchGet`);
    u.searchParams.set('majorDimension','ROWS');
    ranges.slice(i,i+40).forEach(r=>u.searchParams.append('ranges',r));
    const j=await gget(u.toString(),token); out.push(...(j.valueRanges||[]));
  }
  return out;
}
async function ensureRegistry(token) {
  const ss = await spreadsheet(token,MAIN_SHEET_ID);
  if ((ss.sheets||[]).some(s=>s.properties?.title===REGISTRY_SHEET)) return;
  await gget(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MAIN_SHEET_ID)}:batchUpdate`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{addSheet:{properties:{title:REGISTRY_SHEET}}}]})});
  await gget(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MAIN_SHEET_ID)}/values/${encodeURIComponent(REGISTRY_SHEET+'!A1:G1')}?valueInputOption=RAW`,token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({range:REGISTRY_SHEET+'!A1:G1',majorDimension:'ROWS',values:[['Email','Name','Sheet ID','Sheet URL','Label','Created At','Updated At']]})});
}
async function registryRows(token) {
  return values(token,MAIN_SHEET_ID,`'${REGISTRY_SHEET}'!A:G`);
}
async function appendRegistry(token,row) {
  const u = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MAIN_SHEET_ID)}/values/${encodeURIComponent(REGISTRY_SHEET+'!A:G')}:append`);
  u.searchParams.set('valueInputOption','RAW'); u.searchParams.set('insertDataOption','INSERT_ROWS');
  await gget(u.toString(),token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({majorDimension:'ROWS',values:[row]})});
}
async function updateRow(token,rowNumber,row) {
  const range = `${REGISTRY_SHEET}!A${rowNumber}:G${rowNumber}`;
  const u = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MAIN_SHEET_ID)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  await gget(u,token,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values:[row]})});
}
async function deleteRow(token,rowNumber) {
  const ss=await spreadsheet(token,MAIN_SHEET_ID);
  const sheet=(ss.sheets||[]).find(s=>s.properties?.title===REGISTRY_SHEET);
  if(!sheet) return;
  const sheetId=sheet.properties.sheetId;
  await gget(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MAIN_SHEET_ID)}:batchUpdate`,token,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requests:[{deleteDimension:{range:{sheetId,dimension:'ROWS',startIndex:rowNumber-1,endIndex:rowNumber}}}]})});
}

function normalizeRows(rows) {
  const clean = rows.map(r=>r.map(v=>v===undefined?'':v));
  while(clean.length && clean[clean.length-1].every(v=>v==='')) clean.pop();
  const headers=(clean[0]||[]).map((h,i)=>String(h||`Column ${i+1}`));
  const data=clean.slice(1).filter(r=>r.some(v=>String(v??'').trim()!==''));
  return {headers,rows:data.slice(0,500),totalRows:data.length};
}

async function readPersonalSheet(token, config) {
  const ss=await spreadsheet(token,config.sheetId);
  const sheets=ss.sheets||[];
  const ranges=sheets.map(sh=>`'${String(sh.properties.title).replace(/'/g,"''")}'`);
  const vals=await batchValues(token,config.sheetId,ranges);
  const tabs=sheets.map((sh,i)=>{
    const parsed=normalizeRows(vals[i]?.values||[]);
    return {sheetName:sh.properties.title,sheetId:sh.properties.sheetId,...parsed};
  }).filter(t=>t.totalRows || t.headers.length);
  return {sheetId:config.sheetId,url:`https://docs.google.com/spreadsheets/d/${config.sheetId}/edit`,title:ss.properties?.title||config.label||'Personal Sheet',label:config.label||'',tabs,totalRows:tabs.reduce((n,t)=>n+t.totalRows,0)};
}

exports.handler=async(event)=>{
  const h=originHeaders(event);
  if(event.httpMethod==='OPTIONS') return {statusCode:204,headers:h,body:''};
  try {
    if(!MAIN_SHEET_ID) throw new Error('GOOGLE_SHEET_ID is not configured.');
    const identity=await verify(event);
    const token=await serviceToken();
    await ensureRegistry(token);
    const rows=await registryRows(token);
    const mine=[];
    for(let i=1;i<rows.length;i++){
      const r=rows[i]||[]; if(String(r[0]||'').toLowerCase()!==identity.email) continue;
      const sid=sheetIdFromInput(r[2]); if(sid) mine.push({rowNumber:i+1,email:identity.email,name:r[1]||identity.name,sheetId:sid,sheetUrl:r[3]||`https://docs.google.com/spreadsheets/d/${sid}/edit`,label:r[4]||'',createdAt:r[5]||'',updatedAt:r[6]||''});
    }
    if(event.httpMethod==='GET'){
      const sheets=[]; const errors=[];
      for(const config of mine){
        try{ sheets.push(await readPersonalSheet(token,config)); }
        catch(e){ errors.push({sheetId:config.sheetId,label:config.label,error:e.message}); }
      }
      return json(200,{ok:true,user:identity,serviceAccountEmail:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||'',connections:mine.map(x=>({sheetId:x.sheetId,url:x.sheetUrl,label:x.label,createdAt:x.createdAt,updatedAt:x.updatedAt})),sheets,errors,generatedAt:new Date().toISOString() },h);
    }
    if(event.httpMethod==='POST'){
      let body={}; try{body=JSON.parse(event.body||'{}')}catch{}
      const sid=sheetIdFromInput(body.sheetUrl||body.sheetId||'');
      if(!sid) return json(400,{error:'Please provide a valid Google Sheets URL or Sheet ID.'},h);
      const label=String(body.label||'My Personal Sheet').trim().slice(0,100);
      const existing=mine.find(x=>x.sheetId===sid);
      if(!existing && mine.length>=MAX_PERSONAL_CONNECTIONS) return json(400,{error:`You can connect up to ${MAX_PERSONAL_CONNECTIONS} personal sheets.`},h);
      // Verify access now, so bad registrations never get stored.
      const preview=await readPersonalSheet(token,{sheetId:sid,label});
      const now=new Date().toISOString();
      const row=[identity.email,identity.name,sid,preview.url,label,existing?.createdAt||now,now];
      if(existing) await updateRow(token,existing.rowNumber,row); else await appendRegistry(token,row);
      return json(200,{ok:true,message:'Personal sheet connected.',connection:{sheetId:sid,url:preview.url,label,updatedAt:now},sheet:preview},h);
    }
    if(event.httpMethod==='DELETE'){
      let body={}; try{body=JSON.parse(event.body||'{}')}catch{}
      const sid=sheetIdFromInput(body.sheetUrl||body.sheetId||'');
      const existing=mine.find(x=>x.sheetId===sid);
      if(!existing) return json(404,{error:'That sheet is not connected to your account.'},h);
      await deleteRow(token,existing.rowNumber);
      return json(200,{ok:true,message:'Personal sheet disconnected.'},h);
    }
    return json(405,{error:'Method not allowed.'},h);
  } catch(e) {
    console.error('[personal-data]',e);
    return json(e.statusCode||500,{error:e.message||String(e)},h);
  }
};
