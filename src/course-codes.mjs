import crypto from 'node:crypto';
import {normalizeCode,passwordValid,digest} from './security.mjs';

// Display copies never replace the existing authentication hashes.
export function courseCodes(store){
 store.db.exec('CREATE TABLE IF NOT EXISTS course_display_codes(course_id TEXT PRIMARY KEY REFERENCES courses(id),sealed TEXT NOT NULL)');
 const key=()=>crypto.createHash('sha256').update('course-display-v1\0'+store.setting('codeKey')).digest();
 function remember(id,input){
  const c=store.get('SELECT code_hash,code_lookup FROM courses WHERE id=?',id),code=normalizeCode(input);
  if(!c||c.code_lookup!==digest(store.setting('codeKey')+code)||!passwordValid(code,c.code_hash))throw Error('Course code does not match');
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv);cipher.setAAD(Buffer.from(id));
  const sealed=Buffer.concat([iv,cipher.update(code,'utf8'),cipher.final(),cipher.getAuthTag()]).toString('base64');
  store.run('INSERT INTO course_display_codes VALUES(?,?) ON CONFLICT(course_id) DO UPDATE SET sealed=excluded.sealed',id,sealed);
 }
 function read(id){
  const row=store.get('SELECT sealed FROM course_display_codes WHERE course_id=?',id);if(!row)return null;
  try{const b=Buffer.from(row.sealed,'base64');if(b.length<29)return null;const decipher=crypto.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));decipher.setAAD(Buffer.from(id));decipher.setAuthTag(b.subarray(-16));const code=Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]).toString('utf8');const c=store.get('SELECT code_lookup FROM courses WHERE id=?',id);return c?.code_lookup===digest(store.setting('codeKey')+code)?code:null;}catch{return null}
 }
 return {remember,read};
}
