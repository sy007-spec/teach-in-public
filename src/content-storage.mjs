// Logical bytes of persisted content, including historical copies. Authentication
// and operational metadata remain writable so a full classroom can still be read.
export function contentStorage(store,hosting){
 if(!hosting)return {sync(){},describe:()=>null};
 const tables=['project_deliveries','lark_group_qa','lark_question_cards','assist_kb_messages','assist_kb_cards','assist_kb_vectors','public_presentations','versions','business_materials','material_sources','image_attachments','notes','questions','ai_answers','knowledge_chunks','knowledge_approvals','knowledge_indexes','preparation_documents','materials_documents','materials_revisions','materials_assets','materials_jobs','materials_packs','annotations','discussion_context','discussion_translations','question_edits','faq','faq_revisions','backup_restore_archives'];
 store.db.exec('PRAGMA recursive_triggers=ON; CREATE TABLE IF NOT EXISTS content_storage(id INTEGER PRIMARY KEY CHECK(id=1),used INTEGER NOT NULL,cap INTEGER NOT NULL);');
 store.transaction(()=>{
 const fresh=!store.get('SELECT id FROM content_storage WHERE id=1');
 if(fresh)store.run('INSERT INTO content_storage VALUES(1,0,0)');
 store.run('UPDATE content_storage SET used=0 WHERE id=1');
 for(const table of tables){if(store.get("SELECT type FROM sqlite_master WHERE name=?",table)?.type!=='table'){for(const event of ['INSERT','UPDATE','DELETE'])store.db.exec('DROP TRIGGER IF EXISTS storage_'+table+'_'+event);continue}const columns=store.all('PRAGMA table_info('+table+')').map(c=>c.name);if(!columns.length)continue;
 const bytes=prefix=>columns.map(c=>'COALESCE(length(CAST('+prefix+'"'+c+'" AS BLOB)),0)').join('+');
 store.run('UPDATE content_storage SET used=used+(SELECT COALESCE(SUM('+bytes('')+'),0) FROM '+table+') WHERE id=1');
 for(const event of ['INSERT','UPDATE','DELETE'])store.db.exec('DROP TRIGGER IF EXISTS storage_'+table+'_'+event);
 for(const [event,delta]of [['INSERT',bytes('NEW.')],['UPDATE','('+bytes('NEW.')+')-('+bytes('OLD.')+')'],['DELETE','-('+bytes('OLD.')+')']])store.db.exec('CREATE TRIGGER IF NOT EXISTS storage_'+table+'_'+event+' AFTER '+event+' ON '+table+' BEGIN SELECT CASE WHEN ('+delta+')>0 AND (SELECT used+('+delta+')>cap FROM content_storage WHERE id=1) THEN RAISE(ABORT,\'classroom_storage_full\') END; UPDATE content_storage SET used=used+('+delta+') WHERE id=1; END;');
 }
 });
 function sync(){const cap=hosting.status().tier==='advanced'?500000000:100000000;store.run('UPDATE content_storage SET cap=? WHERE id=1 AND cap<>?',cap,cap)}
 sync();return {sync,describe:()=>store.get('SELECT used,cap FROM content_storage WHERE id=1')};
}
