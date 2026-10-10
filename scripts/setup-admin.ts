import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { hashPassword,encrypt } from '../apps/server/src/auth.js';
import { pool,rows } from '../packages/database/index.js';
if(!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)throw new Error('SESSION_SECRET fehlt.');
const rl=createInterface({input:process.stdin,output:process.stdout});
try {
 if((await rows('SELECT id FROM admins WHERE role=?',['owner'])).length)throw new Error('Product Owner existiert bereits.');
 const email=(await rl.question('E-Mail des Product Owners: ')).trim();
 // Password is read from stdin without echo by a temporary raw-mode handler.
 if(!process.stdin.isTTY)throw new Error('Interaktives Terminal erforderlich.');
 process.stdout.write('Passwort (mindestens 16 Zeichen, verdeckt): ');rl.close();
 const password=await new Promise<string>((resolve,reject)=>{let value='';process.stdin.setRawMode(true);process.stdin.resume();const receive=(b:Buffer)=>{for(const ch of b.toString()){if(ch==='\u0003'){finish();reject(new Error('Abgebrochen'));return;}if(ch==='\r'||ch==='\n'){finish();resolve(value);return;}if(ch==='\u007f'||ch==='\b')value=value.slice(0,-1);else value+=ch;}};const finish=()=>{process.stdin.off('data',receive);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');};process.stdin.on('data',receive);});
 if(password.length<16||!/^\S+@\S+\.\S+$/.test(email))throw new Error('Ungültige Zugangsdaten.');
 const secret=new OTPAuth.Secret({size:20});
 await pool.execute('INSERT INTO admins(id,email,password_hash,totp_secret,role) VALUES(?,?,?,?,?)',[randomUUID(),email,hashPassword(password),encrypt(secret.base32),'owner']);
 console.log('Einmalig in der Authenticator-App hinterlegen; sicher offline verwahren:');
 console.log(new OTPAuth.TOTP({issuer:'Community',label:email,secret}).toString());
}finally{rl.close();await pool.end();}
