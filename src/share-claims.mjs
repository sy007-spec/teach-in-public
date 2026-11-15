import {fail} from './security.mjs';
export function shareClaims(store){
 store.db.exec(`CREATE TABLE IF NOT EXISTS share_claims(share_id TEXT PRIMARY KEY,instructor INTEGER NOT NULL,single_use INTEGER NOT NULL,claim_kind TEXT,claim_key TEXT,claimed TEXT);`);
 const get=id=>store.get('SELECT * FROM share_claims WHERE share_id=?',id);
 function assertAvailable(id,kind,key){const r=get(id);if(r?.instructor&&kind==='ppt')fail(403,'Instructor invitation requires classroom registration');if(r?.single_use&&r.claimed&&(r.claim_kind!==kind||r.claim_key!==key))fail(410,'Invitation already used')}
 function claim(id,kind,key){assertAvailable(id,kind,key);const r=get(id);if(r?.single_use&&!r.claimed){const result=store.run('UPDATE share_claims SET claim_kind=?,claim_key=?,claimed=? WHERE share_id=? AND claimed IS NULL',kind,key,store.now(),id);if(result.changes!==1)fail(410,'Invitation already used')}}
 function create(id,instructor,singleUse){store.run('INSERT INTO share_claims(share_id,instructor,single_use) VALUES(?,?,?)',id,instructor?1:0,singleUse?1:0)}
 return {get,create,assertAvailable,claim};
}
