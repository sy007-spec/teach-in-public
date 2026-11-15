import {uid,token,passwordHash,fail} from './security.mjs';
// Only the course-specific teaching role is granted. Publication and role
// administration remain outside an invitation's authority.
export function grantInvitedInstructor(store,s,course,expires,share){
 const email=s.user.contact.trim().toLowerCase(),now=store.now();
 let account=store.get('SELECT * FROM instructors WHERE username=?',email);
 if(account&&(!account.enabled||account.expires<=now))fail(409,'Instructor account requires administrator reauthorization');
 if(!account){account={id:uid()};store.run('INSERT INTO instructors VALUES(?,?,?,?,?,?,?)',account.id,email,s.user.name,passwordHash(token()),1,expires,now);store.run('INSERT INTO instructor_users VALUES(?,?)',account.id,s.user_id)}
 else if(account.expires<expires)store.run('UPDATE instructors SET expires=? WHERE id=?',expires,account.id);
 const existing=store.get('SELECT * FROM instructor_grants WHERE instructor_id=? AND course_id=?',account.id,course);
 if(!existing){const capabilities={annotate:true,draft:true,publish:false,moderate:true,stats:true,versions:false,manage:false};store.run('INSERT INTO instructor_grants VALUES(?,?,?,?,?)',account.id,course,JSON.stringify(capabilities),expires,now)}
 else if(existing.expires<=now)fail(409,'Instructor grant requires administrator reauthorization');
 store.audit(s.user_id,'share.instructor-enrolled',{share,course,instructor:account.id,expires:existing?.expires||expires});
 return {ok:true,status:'approved',role:'instructor',expires:existing?.expires||expires};
}
