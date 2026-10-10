import { buildApp } from './app.js';
import { pool } from '../../../packages/database/index.js';
if(!process.env.DATABASE_URL||!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw new Error('DATABASE_URL und starkes SESSION_SECRET erforderlich.');
const site=new URL(process.env.SITE_URL??'http://localhost:3000');
if(process.env.NODE_ENV==='production'&&(site.protocol!=='https:'||process.env.LEGAL_REVIEWED!=='true'||!['OPERATOR_NAME','OPERATOR_ADDRESS','OPERATOR_EMAIL','LEGAL_PRIVACY_TEXT','LEGAL_CONTRIBUTION_TERMS'].every(key=>process.env[key]?.trim())))throw new Error('Produktionsstart blockiert: HTTPS und geprüfte Betreiber-/Rechtstexte erforderlich.');
const app=await buildApp();
await app.listen({port:Number(process.env.PORT??3000),host:process.env.HOST??'127.0.0.1'});
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,async()=>{await app.close();await pool.end();process.exit(0);});
