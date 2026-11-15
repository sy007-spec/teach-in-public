import {fail} from './security.mjs';
export function shareClaims(store){
 store.db.exec(`CREATE TABLE IF NOT EXISTS share_claims(share_id TEXT PRIMARY KEY,instructor INTEGER NOT NULL,single_use INTEGER NOT NULL,claim_kind TEXT,claim_key TEXT,claimed TEXT);
 CREATE TABLE IF NOT EXISTS share_invitation_windows(share_id TEXT PRIMARY KEY,expires TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS share_instructor_receipts(share_id TEXT,user_id TEXT,created TEXT NOT NULL,PRIMARY KEY(share_id,user_id));`);
 // Preserve previous recipients before converting instructor links to timed multi-recipient invitations.
 store.run("INSERT OR IGNORE INTO share_instructor_receipts SELECT share_id,claim_key,claimed FROM share_claims WHERE instructor=1 AND claimed IS NOT NULL AND claim_kind='classroom'");
 store.run("INSERT OR IGNORE INTO share_invitation_windows SELECT c.share_id,strftime('%Y-%m-%dT%H:%M:%fZ',p.created,'+1 day') FROM share_claims c JOIN ppt_shares p ON p.id=c.share_id WHERE c.instructor=1");
 store.run('UPDATE share_claims SET single_use=0,claim_kind=NULL,claim_key=NULL,claimed=NULL WHERE single_use<>0 OR claimed IS NOT NULL');
 const get=id=>store.get('SELECT c.*,w.expires AS invitation_expires FROM share_claims c LEFT JOIN share_invitation_windows w ON w.share_id=c.share_id WHERE c.share_id=?',id);
 function assertAvailable(id,kind,key){const r=get(id);if(r?.instructor&&kind==='ppt')fail(403,'Instructor invitation requires classroom registration');if(r?.instructor&&(!r.invitation_expires||r.invitation_expires<=store.now()))fail(410,'Instructor invitation expired')}
 const received=(id,user)=>!!store.get('SELECT 1 FROM share_instructor_receipts WHERE share_id=? AND user_id=?',id,user);
 function claim(id,kind,key){assertAvailable(id,kind,key);if(get(id)?.instructor)store.run('INSERT OR IGNORE INTO share_instructor_receipts VALUES(?,?,?)',id,key,store.now())}
 function create(id,instructor,singleUse,invitationHours=24){store.run('INSERT INTO share_claims(share_id,instructor,single_use) VALUES(?,?,0)',id,instructor?1:0);if(instructor)store.run('INSERT INTO share_invitation_windows VALUES(?,?)',id,new Date(Date.now()+invitationHours*3600000).toISOString())}
 return {get,create,assertAvailable,claim,received};
}
