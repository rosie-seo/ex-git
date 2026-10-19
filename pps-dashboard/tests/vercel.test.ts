import {test} from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import handler,{restoreRoute} from '../server/vercel-handler.ts';
test('Vercel rewrite preserves API/source routes and query parameters',()=>{
 const req:any={url:'/api/index?__pps_path=%2Fapi%2Fdashboard&end=2026-10-16'};
 assert.equal(restoreRoute(req),'/api/dashboard?end=2026-10-16');
 const q:any={url:'/api/index',query:{__pps_path:'/api/dashboard',end:'2026-10-16'}};assert.equal(restoreRoute(q),'/api/dashboard?end=2026-10-16');assert.equal(q.query.__pps_path,undefined);
 assert.equal(restoreRoute({url:'/api/index?__pps_path=/source/example.pdf'} as any),'/source/example.pdf');
 assert.throws(()=>restoreRoute({url:'/api/index?__pps_path=https://wrong.test/api/session'} as any));
});
test('Rewritten session and unknown API return JSON, never the SPA HTML',async()=>{
 process.env.NODE_ENV='test';delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
 const server=createServer((req,res)=>void handler(req,res));server.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as any).port}`;
 try{const session=await fetch(base+'/api/index?__pps_path=/api/session');assert.equal(session.status,200);assert.match(session.headers.get('content-type')!,/application\/json/);assert.equal((await session.json()).configured,false);
 const unknown=await fetch(base+'/api/index?__pps_path=/api/not-present');assert.equal(unknown.status,401);assert.match(unknown.headers.get('content-type')!,/application\/json/);
 const file=await fetch(base+'/api/index?__pps_path=/source/wbs-v1.7.pdf');assert.equal(file.status,401);assert.match(file.headers.get('content-type')!,/application\/json/);
 }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()))}
});
