import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import {rmSync} from 'node:fs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tsc=createRequire(import.meta.url).resolve('typescript/bin/tsc');
const output=resolve(root,'.runtime-check');
const env={...process.env,NODE_ENV:'test',VERCEL:'1'};
for(const key of ['NODE_OPTIONS','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NOTION_TOKEN','ADMIN_PASSWORD','SESSION_SECRET'])delete env[key];
try{
 execFileSync(process.execPath,[tsc,'-p','tsconfig.runtime.json'],{cwd:root,stdio:'inherit'});
 const code=`
 import {createServer} from 'node:http';
 import assert from 'node:assert/strict';
 import handler from './.runtime-check/api/index.js';
 const server=createServer((req,res)=>void handler(req,res));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 try {const r=await fetch('http://127.0.0.1:'+server.address().port+'/api/index?__pps_path=/api/session');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\\/json/);const value=await r.json();assert.equal(value.authenticated,false);assert.equal(value.configured,false);console.log('PASS: emitted JavaScript function returns session JSON without tsx');}
 finally {await new Promise(r=>server.close(r));}
 `;
 execFileSync(process.execPath,['--input-type=module','-e',code],{cwd:root,env,stdio:'inherit',timeout:30000});
}finally{rmSync(output,{recursive:true,force:true})}
