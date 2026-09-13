const crypto = require('crypto');

const MAIN_SHEET_ID = process.env.GOOGLE_SHEET_ID;
// Exact KNO source identified from the user's FAM Index workbook.
const KNO_SHEET_ID = process.env.GOOGLE_KNO_SHEET_ID || '1ZcEVFG7FYZzYfipo53QUyuk8F_fSWRDQBn0WDtqxbjs';

// Matrix source IDs from the supplied FAM Index workbook. These are a safety
// fallback if Google Sheets does not expose rich-text hyperlink metadata through
// the Index API. New links added to Index are still discovered dynamically.
const FALLBACK_MATRIX_SOURCES = [
  '1zqwCLiJHdnW__XMuVinhx0pFCC9Aw8SdrF8AiJmahzM','1rgnJWiwDm69IzFlkHTGQwo9J8t_ujCc4S66ziqT8r8I','1lnc12IdsMOa_F93K-Rmj_yPR14aNzlKAUsEi61VPaM8','1OeSoxwytgRnzH5ZVC4WDXk7V_iCSPwBE5RR3AWhUtEI','1nis446Cr9276M_ckZe42d2dnYqik84lbA5JNGX7pZ4E','1G8OvoOjGTPO2xAbOjVCqgtzT3RZDz4h7X2ctU75UzwQ','1-na6iO1_TdWUeRn63YeQdUBm_NJlouKaDgrJAQwE8l0','1A3zOrjfPcURMiH_5a4363BhZI1nCgGJRDYyhVvDqoeg','1vpcQ2yIHMS3I6Xzt38y3gR8EvBhxSe6HYp4UohTl9uk','1g62gmWPprxVcjlzIBZHCvcHxtmDUV6XzTf4Tq3w6o0E','1-9a83zpk7r9MyC7aiA9p9-pRpbS0OaC_1hr-RZ_0FVg','1Q2s0b2ALaHoNOXrV4r56eVg4dsUO38nF_2mgWaunZlc','1xWwZC-8hmzZ_VMfu7xXzATri4bA5T8M7IPy0_7n7-6s','1-1lJGHfOCvT1Q7rCrwnp2lhLtrtEvdysuN_D8wQPDZY','1eAZuhjL9wYqx6bde0jOD6uzjrAIE4PYx-G3JijZ11N8','1jdNCOWRu0CfhRWWr5sg9hkQweFtPURSI2dxnaf4Dl8E','1FBQX4NG96ay__sIBbOkvXjVvkOO6TLtsUfrLJmqgvEs','1lopQSy852n5FdrXOZ3ZAPW8b6TGxEmxPpbXw_-Q0igs','1TQ2EJbTFsOCT1_26LPwHiSFaBmR5B1qW6uHUjV5mnEQ','1rjPhEmYXfY2WMpwvrRS3jXZtjAvwXprgTvkysXhLLig','1NTTlx3sVSOfbg14Im1VLTqi93b23Vm6B_y7EhHQKvms','1-2Lm1D0EUrjDMfPxIQN6Wk1YXIWTNG4K6FMdU0-IAAw','11jZft3rkYaJNEsdR3xjT5Fjy_0x8n1mlOBY7Lk2UgR0','1x4V4P5vhymVg0hAVOi-rxf9uOXDuehnN_0IDCuzoQ3k','1bmI1aTFno8LD3j412gByvhlxIaOIS1uokJAXfbXAGFc','17saS8x6SlV-OA1bLsMP-4vmAei8Ijz03tPgGIfkryck','1ZrTYzHZPfpePAyQntX5HPnHfC_WqKR6eU5x1_0KxAXA'
];

const CATEGORY_COLORS = {'Furniture':'#8b5cf6','Safety & Security':'#ef4444','Sanitary & Hygiene':'#06b6d4','IT Infrastructure':'#4f46e5','Pantry & Hospitality':'#f59e0b','Facility & Wellness':'#10b981','Uncategorized / General Procurement':'#64748b','Reference / Source Documents':'#0ea5e9'};
const DOCX_CONFIRMED = {'sink':'Sanitary & Hygiene','flooring':'Sanitary & Hygiene','outer building glass cleaning':'Sanitary & Hygiene','lab coat':'Sanitary & Hygiene','pest control':'Sanitary & Hygiene','discard material':'Sanitary & Hygiene','study chair':'Furniture','door closer':'Furniture','work station chair':'Furniture','office chairs':'Furniture','industrial dustbin':'Furniture','hdr rack':'Furniture','hdr racks':'Furniture','hdr racks 2':'Furniture','sofa':'Furniture','automatic door closer':'Furniture','desk organizer':'Furniture','sofa repair':'Furniture','fire extinguisher':'Safety & Security','fire extenguisher':'Safety & Security','ac':'Safety & Security','oil':'Safety & Security','cctv quotation':'Safety & Security'};
const KEYWORD_CATEGORIES = [['IT Infrastructure',['networking','firewall','access point','aruba','printer','printing press','it equipments','laptop','interactive panel','samsung led','non touch ifp','projector','aqm','smart aqi','broadband','internet','wireless display','wireless presentation','face recognition','screen stand','multi moniter','multi monitor','end user management','assets tracker','centerlized','centralized','fortigate','palo alto','ai smart camera','ai based cctv','ai interactive panel','benq']],['Furniture',['clothes stands','curtains','desk organizer','pantry utensils']],['Safety & Security',['fly killer','fly stop','water mist']],['Sanitary & Hygiene',['washing machine','water dispenser','water despenser','hand dryer','soap dispencer','metro sheet','pvc curtains','air purifier','industrial ro','vacuum filter','paints','shoe cover','dustcontrol carpet','glass cleaner','flooring outdoor']],['Pantry & Hospitality',['milk','coffee machine','high pressure machine','pantry area','pantry utensils']],['Facility & Wellness',['gym']]];
const SYN={vendorName:['vendor name','vendor','vender name','vonder name','supplier','company name','supplier company name','equipments name'],contactPerson:['contact person','contact person / email'],phone:['contact number','contect number','mobile','mob. no.','mob no','mobile no','mobile number','contact no','contact no.','contact','phone','phone no','contact details'],email:['email'],address:['address','location','complete address',"vendor's office / warehouse location"],city:['city'],state:['state'],pinCode:['pin code'],brand:['brand','brand name','oem brand','oem/brand'],productName:['product name','product','item','equipment name','solution name','model reference','asset name'],model:['model','model number','model name','camera model'],quantity:['qty','quantity','total qty','units','unit'],unitPrice:['unit price (₹)','price','rate','per/price','cost','basic cost','per item cost','unit price','value price','value offer price','approx cost','per piece rate','pr piece rate'],subtotal:['total','total price','total cost','total amount','sub total','amount (₹)','total unit cost (₹)'],gstPercent:['gst','gst (%)','gst%','18% gst','gst 18%'],gstAmount:['gst amount','per/gst'],grandTotal:['grand total','grand total (₹)','grand total rate','grand total charges'],freight:['cartage','cartage charge','freight'],installationCharge:['installation charge','installation charges','installation'],warranty:['warranty'],deliveryTime:['delivery time','tat','turnaround'],paymentTerms:['payment terms','payment term'],advance:['advance'],rating:['overall admin score','overall evaluation score','admin score'],pros:['pros','advantages','advantage','key advantages','key features'],cons:['cons','disadvantages','disadvantage','key limitations','limitations'],notes:['notes','remarks','additional notes'],sourceLink:['link','quotation','reference link','quotation link'],color:['color','colour'],material:['material','material/build','material / technology']};
const REV={}; for(const [k,a] of Object.entries(SYN)) for(const s of a) REV[s]=k;
function clean(v){if(v===null||v===undefined)return null;if(typeof v==='string'){const s=v.trim();if(!s||s.startsWith('=AI(')||s.startsWith('=GPT(')||s.toUpperCase().startsWith('#N/A')||s==='#REF!')return null;return s;}return v;}
function id(...p){return crypto.createHash('sha1').update(p.join('||')).digest('hex').slice(0,16);}
function normalizeHeader(h){if(!h)return null;const k=String(h).trim().toLowerCase().replace(/\s+/g,' ').replace(/:$/,'');return REV[k]||null;}
function cleanTitle(t){let x=String(t||'').replace(/^Copy of\s*/i,'');x=x.split(/\s*[|\u2013-]\s*(Vendor Matrix|Solution Matrix|Vendo|Ma$|Matri|Matr)/i)[0];x=x.replace(/\bVendor Matrix\b/ig,'').replace(/\bSolution Matrix\b/ig,'').replace(/\bWellversed\b/ig,'').replace(/[|]/g,'').replace(/\s+/g,' ').trim();return x||t;}
function categoryFor(title,fallback){const k=String(title).trim().toLowerCase().replace(/\s+/g,' ');if(DOCX_CONFIRMED[k])return [DOCX_CONFIRMED[k],'docx_confirmed'];for(const [dk,c] of Object.entries(DOCX_CONFIRMED))if(k.startsWith(dk)||(dk.startsWith(k)&&k.length>=4))return [c,'docx_confirmed'];for(const [c,ks] of KEYWORD_CATEGORIES)for(const kw of ks)if(k.includes(kw))return [c,'inferred_from_sheet_name'];return [fallback||'Uncategorized / General Procurement','index_or_inferred'];}
function descRow(headers,row){const nn=row.filter(v=>v!==null&&v!==undefined&&v!=='');if(nn.length<2)return false;const n=nn.filter(v=>typeof v==='string'&&v.length>12&&!/\d{4,}/.test(v)).length;return n/Math.max(1,nn.length)>0.5;}
function sheetType(headers){const h=headers.filter(Boolean).map(x=>String(x).toLowerCase()).join(' ').replace(/\s+/g,' ');if(headers[0]&&String(headers[0]).length>60)return'narrative_brief';if(headers[0]&&/step \d|sop|make sure both devices/i.test(String(headers[0])))return'sop_document';if(headers.filter(Boolean).length<=3)return'reference_table';if(/solution name|solution type/.test(h))return'solution_matrix';if(/vendor name|vender name|vonder name|supplier|contact number|mobile no|contect number/.test(h))return'vendor_matrix';if(/contact|address|phone|mob\.|mobile/.test(h))return'vendor_matrix';if(/brand|model|specification|technology|resolution|capacity|features|material/.test(h))return'solution_matrix';return'unclassified_table';}

function b64url(input){return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
function b64url(input){return Buffer.from(input).toString('base64').replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}

async function accessToken(){
  const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if(!email||!raw)throw new Error('Google service-account environment variables are missing.');
  const key=raw.replace(/\\n/g,'\n');
  const now=Math.floor(Date.now()/1000);
  const header=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const claim=b64url(JSON.stringify({iss:email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const signer=crypto.createSign('RSA-SHA256'); signer.update(`${header}.${claim}`);
  const sig=b64url(signer.sign(key));
  const assertion=`${header}.${claim}.${sig}`;
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:`grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${encodeURIComponent(assertion)}`});
  const j=await r.json();
  if(!r.ok)throw new Error(`Google service-account token error: ${j.error_description||j.error||r.status}`);
  return j.access_token;
}

async function verifyGoogleCredential(event){
  const auth=event.headers?.authorization||event.headers?.Authorization||'';
  const m=auth.match(/^Bearer\s+(.+)$/i);
  if(!m) throw Object.assign(new Error('Google sign-in is required before live Sheets data can be loaded.'),{statusCode:401});
  const clientId=process.env.GOOGLE_CLIENT_ID||'255689281984-s7sukng6nv6coshng1fqa4l1081qda4v.apps.googleusercontent.com';
  const r=await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(m[1])}`);
  const j=await r.json().catch(()=>({}));
  if(!r.ok || j.aud!==clientId || j.email_verified!=='true'){
    throw Object.assign(new Error('Google ID token is invalid or was issued for a different OAuth client.'),{statusCode:401});
  }
  const allowed=(process.env.GOOGLE_ALLOWED_DOMAIN||'wellversed.in').toLowerCase();
  if(allowed && !String(j.email||'').toLowerCase().endsWith('@'+allowed)){
    throw Object.assign(new Error(`Only @${allowed} Google Workspace accounts are allowed.`),{statusCode:403});
  }
  return {email:j.email,name:j.name||'',sub:j.sub};
}

async function gget(url,token){
  const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
  const text=await r.text(); let j={}; try{j=JSON.parse(text);}catch{}
  if(!r.ok)throw new Error(j.error?.message||`Google Sheets API error ${r.status}`);
  return j;
}
async function values(token,sid,range){
  const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sid)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`;
  const j=await gget(url,token); return j.values||[];
}
async function spreadsheet(token,sid){return gget(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sid)}?includeGridData=false`,token);}
async function batchValues(token,sid,ranges){
  if(!ranges.length)return [];
  const out=[];
  for(let i=0;i<ranges.length;i+=40){
    const u=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sid)}/values:batchGet`);
    u.searchParams.set('majorDimension','ROWS');
    ranges.slice(i,i+40).forEach(r=>u.searchParams.append('ranges',r));
    const j=await gget(u.toString(),token);
    out.push(...(j.valueRanges||[]));
  }
  return out;
}
function idsFromText(text){return [...String(text||'').matchAll(/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]+)/g)].map(m=>m[1]);}
async function indexSources(token){
  const j=await gget(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(MAIN_SHEET_ID)}?includeGridData=true&fields=sheets(properties(title),data(rowData(values(formattedValue,hyperlink,userEnteredValue))))`,token);
  const sh=(j.sheets||[]).find(x=>x.properties?.title==='Index')||j.sheets?.[0];
  const rows=sh?.data?.[0]?.rowData||[]; const out=[];
  for(const rd of rows.slice(1)){
    const cells=rd.values||[];
    const vals=cells.map(c=>c.formattedValue||c.effectiveValue?.stringValue||c.effectiveValue?.numberValue||'');
    const title=vals[0]||'', category=vals[1]||'', type=vals[2]||'', label=vals[3]||'', cat=vals[4]||'';
    if(!/vendor matrix|solution matrix/i.test(cat))continue;
    let ids=[];
    for(const c of cells){
      ids.push(...idsFromText(c.hyperlink||''));
      ids.push(...idsFromText(c.userEnteredValue?.formulaValue||''));
      ids.push(...idsFromText(c.formattedValue||''));
    }
    const uniq=[...new Set(ids)]; if(uniq[0])out.push({id:uniq[0],category,title,type,categoryType:cat||label});
  }
  const uniq=new Map(out.map(x=>[x.id,x]));
  if(!uniq.size) for(const sid of FALLBACK_MATRIX_SOURCES) uniq.set(sid,{id:sid,category:'',title:'FAM Matrix Source',type:'Sheets',categoryType:'Vendor/Solution Matrix'});
  return [...uniq.values()];
}

async function mapLimit(items,limit,fn){
  const out=new Array(items.length); let next=0;
  async function worker(){
    while(true){const i=next++; if(i>=items.length)return; try{out[i]=await fn(items[i],i);}catch(e){out[i]={__error:e};}}
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}

async function parseVendorSource(token,src){
  let ss; try{ss=await spreadsheet(token,src.id);}catch(e){return {records:[],refs:[],meta:[{sourceId:src.id,title:src.title,error:e.message}]};}
  const ranges=(ss.sheets||[]).map(sh=>`'${String(sh.properties.title).replace(/'/g,"''")}'`);
  const vr=await batchValues(token,src.id,ranges);
  const records=[],refs=[],meta=[];
  for(let idx=0;idx<(ss.sheets||[]).length;idx++){
    const sh=ss.sheets[idx], name=sh.properties.title, rows=(vr[idx]?.values||[]); if(!rows.length)continue;
    const cleanRows=rows.map(r=>r.map(clean)); while(cleanRows.length&&cleanRows[cleanRows.length-1].every(v=>v===null))cleanRows.pop(); if(!cleanRows.length)continue;
    const headers=cleanRows[0]||[], dataStart=cleanRows[1]&&descRow(headers,cleanRows[1])?2:1;
    const dataRows=cleanRows.slice(dataStart).filter(r=>r.some(v=>v!==null)); const st=sheetType(headers),productLine=cleanTitle(name),[cat,catSrc]=categoryFor(productLine,src.category);
    meta.push({sheetName:name,productLine,rowCount:dataRows.length,columnCount:headers.length,sheetType:st,category:cat,categorySource:catSrc,headers:headers.filter(Boolean),hasDescriptionRow:dataStart===2,sourceId:src.id});
    if(!['vendor_matrix','solution_matrix'].includes(st)){
      const preview=dataRows.slice(0,25).map((row,i)=>({rowIndex:i+dataStart+1,data:Object.fromEntries(headers.map((h,j)=>[String(h||''),row[j]]).filter(([h,v])=>h&&v!==null))})).filter(x=>Object.keys(x.data).length);
      if(preview.length)refs.push({id:id('remote',src.id,name,'refdoc'),title:productLine,docType:st,category:cat,categorySource:catSrc,headers:headers.filter(Boolean).map(String),previewRows:preview,truncated:dataRows.length>25,rowCount:dataRows.length,source:{sourceWorkbook:ss.properties.title,sourceSheet:name,sourceId:src.id},lastUpdated:new Date().toISOString(),deletedAt:null});
      continue;
    }
    const descriptions={}; if(dataStart===2)headers.forEach((h,j)=>{if(h&&cleanRows[1][j])descriptions[String(h)]=cleanRows[1][j];});
    dataRows.forEach((row,i)=>{
      const raw={},norm={},custom={};
      headers.forEach((h,j)=>{if(!h||row[j]===null)return;const hs=String(h).trim(),v=row[j];raw[hs]=v;const c=normalizeHeader(hs);if(c&&!norm[c])norm[c]=v;else custom[hs]=v;});
      if(!Object.keys(raw).length)return;
      const rowNum=i+dataStart+1;
      records.push({id:id('remote',src.id,name,rowNum,norm.vendorName||''),recordType:st,category:cat,categorySource:catSrc,productLine,normalized:norm,customFields:custom,rawRecord:raw,fieldDescriptions:descriptions,source:{sourceWorkbook:ss.properties.title,sourceSheet:name,sourceRow:rowNum,sourceId:src.id},lastUpdated:new Date().toISOString(),deletedAt:null,sheetLink:{url:`https://docs.google.com/spreadsheets/d/${src.id}`,confirmed:true}});
    });
  }
  return {records,refs,meta};
}

async function parseVendorSources(token,sources){
  const results=await mapLimit(sources,5,src=>parseVendorSource(token,src));
  return results.reduce((a,x)=>({records:a.records.concat(x?.records||[]),refs:a.refs.concat(x?.refs||[]),meta:a.meta.concat(x?.meta||[])}),{records:[],refs:[],meta:[]});
}

async function parseKno(token){
  let ss;
  try{ss=await spreadsheet(token,KNO_SHEET_ID);}catch(e){return {employees:[],docs:[],meta:[{sourceId:KNO_SHEET_ID,error:e.message}],error:e.message};}
  const employees=[],docs=[],meta=[]; let employeeNames=new Set();
  const employeeRows=await values(token,KNO_SHEET_ID,"'Employee Index'").catch(()=>[]);
  if(employeeRows.length){
    const headers=employeeRows[0],start=employeeRows[1]&&descRow(headers,employeeRows[1])?2:1;
    for(let i=start;i<employeeRows.length;i++){const row=employeeRows[i];if(!row.some(v=>clean(v)!==null))continue;const raw=Object.fromEntries(headers.map((h,j)=>[String(h||''),clean(row[j])]).filter(([h,v])=>h&&v!==null));if(Object.keys(raw).length){employees.push({id:id('remote-kno',KNO_SHEET_ID,'Employee Index',i+1),rawRecord:raw,source:{sourceWorkbook:ss.properties.title,sourceSheet:'Employee Index',sourceRow:i+1}});for(const v of Object.values(raw))if(typeof v==='string'&&v.trim())employeeNames.add(v.trim());}}
  }
  ['Arpan Chaudhary','Shivani Patel','Shivani Singh','Manas Kumar','Manish Kumar','Anand Kumar','Gauri','Shiv N Maurya','Shiv Maurya','Istikhar','Rohit Kumar','Saurabh','Saurabh Pandey','Nitesh','Ankit Sharma','Yash Tyagi','Yash','Prateek Kumar','Prateek','Subhan Raza','Priyanshu Saha','Priyanshu','Irfan Ansari','Muskan Singh','Saif Raza'].forEach(x=>employeeNames.add(x));
  const names=[...employeeNames].sort((a,b)=>b.length-a.length),extractEmp=n=>names.find(x=>n.toLowerCase().includes(x.toLowerCase()))||null;
  const sheets=(ss.sheets||[]).filter(sh=>sh.properties.title!=='Employee Index');
  const ranges=sheets.map(sh=>`'${String(sh.properties.title).replace(/'/g,"''")}'`);
  const vr=await batchValues(token,KNO_SHEET_ID,ranges);
  for(let idx=0;idx<sheets.length;idx++){
    const name=sheets[idx].properties.title,rows=vr[idx]?.values||[];if(!rows.length)continue;
    const headers=rows[0]||[],start=rows[1]&&descRow(headers,rows[1])?2:1,data=rows.slice(start).filter(r=>r.some(v=>clean(v)!==null));
    const emp=extractEmp(name);let topic=name.replace(/^\s*(SM|VM|RM|CR)\.?\s*/i,'').replace(emp?new RegExp(emp,'ig'):/$^/,'').replace(/^[\s\-\.]+/,'').replace(/\s+/g,' ').trim()||'General';
    const m=/^\s*([A-Z]{2})[\.\s]/.exec(name),docType={SM:'Solution / Study Matrix',VM:'Vendor Matrix',RM:'Requirement Matrix',CR:'Comparative Research'}[m&&m[1]]||'Research / Reference';
    meta.push({sheetName:name,rowCount:data.length,columnCount:headers.length,docType,employee:emp,topic});
    const preview=data.slice(0,8).map((r,i)=>({rowIndex:i+start+1,data:Object.fromEntries(headers.map((h,j)=>[String(h||''),clean(r[j])]).filter(([h,v])=>h&&v!==null))})).filter(x=>Object.keys(x.data).length);
    if(preview.length)docs.push({id:id('remote-kno',KNO_SHEET_ID,name),title:topic+(emp?` — ${emp}`:''),docType,employee:emp,topic,rowCount:data.length,headers:headers.filter(Boolean).map(String),previewRows:preview,truncated:data.length>8,source:{sourceWorkbook:ss.properties.title,sourceSheet:name,sourceRow:1},lastUpdated:new Date().toISOString(),deletedAt:null});
  }
  return {employees,docs,meta,error:null};
}

exports.handler=async(event)=>{
  const origin=event.headers?.origin||event.headers?.Origin||'';
  const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
  if(origin)headers['Access-Control-Allow-Origin']=origin;
  headers['Access-Control-Allow-Headers']='Content-Type, Authorization';
  if(event.httpMethod==='OPTIONS')return{statusCode:204,headers,body:''};
  try{
    const identity=await verifyGoogleCredential(event);
    if(!MAIN_SHEET_ID)throw new Error('GOOGLE_SHEET_ID is not configured.');
    const token=await accessToken();
    const sources=await indexSources(token);
    if(!sources.length)throw new Error('No Vendor/Solution Matrix Google Sheets were found in the FAM Index sheet.');
    const v=await parseVendorSources(token,sources);
    const k=await parseKno(token);
    const vm=v.records.filter(r=>r.recordType==='vendor_matrix'),sm=v.records.filter(r=>r.recordType==='solution_matrix');
    if(!vm.length && !sm.length)throw new Error('The service account could not read any Vendor/Solution Matrix source sheets. Share the source sheets with the service account as Viewer.');
    const vi=new Map();
    for(const r of vm){
      const n=r.normalized.vendorName;if(!n||typeof n!=='string')continue;const key=n.trim().toLowerCase();
      if(!vi.has(key))vi.set(key,{id:id('vendor',key),vendorName:n.trim(),categories:new Set(),productLines:new Set(),phones:new Set(),locations:new Set(),recordIds:[]});
      const x=vi.get(key);x.categories.add(r.category);x.productLines.add(r.productLine);if(r.normalized.phone)x.phones.add(String(r.normalized.phone));if(r.normalized.address)x.locations.add(String(r.normalized.address));x.recordIds.push(r.id);
    }
    const vendors=[...vi.values()].map(x=>({id:x.id,vendorName:x.vendorName,categories:[...x.categories].sort(),productLines:[...x.productLines].sort(),phones:[...x.phones].sort(),locations:[...x.locations].sort(),recordIds:x.recordIds,recordCount:x.recordIds.length})).sort((a,b)=>a.vendorName.localeCompare(b.vendorName));
    const categories=[...new Set(vm.map(x=>x.category))].sort(),now=new Date().toISOString();
    const bundle={meta:{generatedAt:now,sourceFiles:['Google Sheets live source'],vendorWorkbookSheetCount:v.meta.length,knoWorkbookSheetCount:k.meta.length,vendorMatrixRecordCount:vm.length,solutionMatrixRecordCount:sm.length,distinctVendorCount:vendors.length,categoryCount:categories.length,knowledgeBaseDocCount:k.docs.length,referenceDocCount:v.refs.length,employeeCount:k.employees.length,sourceSpreadsheetCount:sources.length,remote:true,signedInAs:identity.email,sourceWarnings:[...v.meta.filter(x=>x.error||x.warning),...(k.error?[{sourceId:KNO_SHEET_ID,error:k.error}]:[])]},categories,vendors,vendorMatrixRecords:vm,solutionMatrixRecords:sm,vendorSheetsMeta:v.meta,knoSheetsMeta:k.meta,employees:k.employees,knowledgeBaseDocs:k.docs,referenceDocs:v.refs,categoryMappingReference:{id:id('remote-index'),title:'FAM Google Sheets Index',docType:'category_mapping_reference',tabs:sources,source:{spreadsheetId:MAIN_SHEET_ID}}};
    return{statusCode:200,headers,body:JSON.stringify(bundle)};
  }catch(e){
    console.error('[fam-data]',e);
    return{statusCode:e.statusCode||500,headers,body:JSON.stringify({error:e.message||String(e)})};
  }
};
