import type { IncomingMessage, ServerResponse } from 'node:http';
type RoutedRequest = IncomingMessage & {query?:Record<string,string|string[]|undefined>};
/** Vercel rewrites may replace req.url with the function destination. Keep the original route explicit. */
export function restoreRoute(req:RoutedRequest) {
 const url=new URL(req.url||'/', 'http://localhost');
 const queryPath=req.query?.__pps_path;
 const route=(Array.isArray(queryPath)?queryPath[0]:queryPath)||url.searchParams.get('__pps_path');
 if(route){
  const target=new URL(route,'http://localhost');
  if(target.origin!=='http://localhost'||!/^\/(api|source)(\/|$)/.test(target.pathname))throw Error('Invalid API route');
  url.pathname=target.pathname;
 }
 for(const [key,value] of Object.entries(req.query||{})){
  if(key==='__pps_path'||url.searchParams.has(key)||value===undefined)continue;
  for(const entry of Array.isArray(value)?value:[value])url.searchParams.append(key,entry);
 }
 url.searchParams.delete('__pps_path');
 req.url=url.pathname+url.search;
 if(req.query)delete req.query.__pps_path;
 return req.url;
}
export default async function handler(req:RoutedRequest,res:ServerResponse){
 try{restoreRoute(req)}catch{res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'잘못된 API 경로입니다.'}));return}
 try{const {app}=await import('./index.js');app(req,res)}
 catch(e){console.error('API bootstrap failure:',(e as Error).name);res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'서버 초기화에 실패했습니다. Vercel 함수 로그와 Node 버전을 확인하세요.'}))}
}
