const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const root = path.resolve(__dirname, '../site');
const source = fs.readFileSync(path.join(root, 'js/supabase-store.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'despesas.html'), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
function section(s,a,b) { return s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a))); }
function storage() { const map = new Map(); return { get length(){return map.size},key:i=>[...map.keys()][i], getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k) }; }
function context(extra={}) {
 const c={localStorage:storage(),navigator:{},crypto:webcrypto,console:{log(){},warn(){},error(){}},window:{LavaCashOwnerMode:{uid:'owner',isOwnerUser:()=>true},dispatchEvent(){}},setTimeout,clearTimeout,setInterval,clearInterval,AbortController,URL,CustomEvent:class{},supabaseConfig:{url:'https://example.invalid',publishableKey:'public-test'},...extra};
 vm.createContext(c);
 vm.runInContext(source.replace(/^import .*;\r?\n/gm,'').replace('export async function initStore','async function initStore')+`\ninitialized=true;auth={currentUser:{uid:'owner',getIdTokenResult:async()=>({token:'mock-token',claims:{role:'authenticated'}})}};`,c);
 return c;
}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}

test('all JS and inline HTML scripts parse',()=>{
 for(const file of ['js/supabase-store.js','js/auth-service.js','js/firebase-init.js','sw.js']) {
  const s=fs.readFileSync(path.join(root,file),'utf8').replace(/^import .*;\s*$/gm,'').replace(/export async function/g,'async function').replace(/import\.meta\.url/g,"'https://example.invalid/Lava-cash/js/firebase-init.js'");new vm.Script(s,{filename:file});
 }
 for(const file of ['despesas.html','index.html']) for(const m of fs.readFileSync(path.join(root,file),'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(m[1],{filename:file});
});
test('queue acknowledges only the operation actually sent',async()=>{
 const c=context(),started=deferred(),gate=deferred();c.writeRemoteItem=async()=>{started.resolve();await gate.promise};
 c.enqueuePendingWrite('lav1_despesas','set',{},[{id:'first'}]);const flushing=c.flushPendingWrites();await started.promise;
 const added=c.enqueuePendingWrite('lav1_despesas','set',{},[{id:'new'}]);gate.resolve();await flushing;
 assert.equal(c.readPendingWrites().length,1);assert.equal(c.readPendingWrites()[0].id,added);
});
test('queue preserves immutable data rather than reading a changed cache',async()=>{
 const c=context();let captured;c.writeRemoteItem=async(k,v)=>{captured=plain(v)};
 const payload=[{id:'A',valor:10}];c.enqueuePendingWrite('lav1_despesas','set',{},payload);payload[0].valor=999;
 c.localStorage.setItem('lav1_despesas',JSON.stringify([{id:'B'}]));await c.flushPendingWrites();assert.deepEqual(captured,[{id:'A',valor:10}]);
});
test('failed older operation blocks later operations for the same key',async()=>{
 const c=context();const values=[];c.writeRemoteItem=async(k,v)=>{values.push(v);throw Error('network')};
 c.enqueuePendingWrite('k','set',{},1);c.enqueuePendingWrite('k','set',{},2);await c.flushPendingWrites();assert.deepEqual(values,[1]);assert.equal(c.readPendingWrites().length,2);
});
test('legacy queue is preserved without replaying unknown snapshots',async()=>{
 const c=context();let calls=0;c.writeRemoteItem=async()=>calls++;
 c.localStorage.setItem('irancash_pending_supabase_writes',JSON.stringify([{key:'lav1_despesas',operation:'set',allowDecrease:true}]));await c.flushPendingWrites();assert.equal(calls,0);assert.equal(c.readPendingWrites().length,1);
});
test('pending writes from another uid are not sent',async()=>{
 const c=context();vm.runInContext("auth.currentUser.uid='other'",c);c.enqueuePendingWrite('k','set',{},1);vm.runInContext("auth.currentUser.uid='owner'",c);
 let calls=0;c.writeRemoteItem=async()=>calls++;await c.flushPendingWrites();assert.equal(calls,0);
});
test('concurrent flush events send an operation once',async()=>{
 const c=context(),gate=deferred();let calls=0;c.writeRemoteItem=async()=>{calls++;await gate.promise};c.enqueuePendingWrite('k','set',{},1);
 const a=c.flushPendingWrites(),b=c.flushPendingWrites();gate.resolve();await Promise.all([a,b]);assert.equal(calls,1);
});
test('queue reports quota failure instead of claiming durable storage',()=>{
 const c=context();c.localStorage.setItem=()=>{throw Error('QuotaExceededError')};assert.throws(()=>c.enqueuePendingWrite('k','set',{},[]),/Quota/);
});
test('snapshot deletion without selected IDs is blocked before database writes',async()=>{
 const c=context();let calls=0;c.loadFinanceRows=async()=>{calls++;return []};await assert.rejects(c.writeFinance({scopeCategory:'despesas',scopeLaundryId:'lav1'},[],{allowDecrease:true}),/IDs/);assert.equal(calls,0);
});
test('explicit deletion targets selected IDs and laundry only',async()=>{
 const c=context();const requests=[];c.request=async(t,o)=>{requests.push(plain(o));return {data:o.method==='DELETE'?[{id_legado:'A'}]:[]}};
 const n=await c.deleteFinanceItems('lav1_despesas',['A']);assert.equal(n,1);assert.equal(requests[0].query.lavanderia_id,'eq.lav1');assert.equal(requests[0].query.id_legado,'in.("A")');assert.equal(requests[0].prefer,'return=representation');
});
test('deletion denied by RLS is not reported as success',async()=>{
 const c=context();c.request=async(t,o)=>({data:o.method==='DELETE'?[]:[{id_legado:'A'}]});await assert.rejects(c.deleteFinanceItems('lav1_despesas',['A']),/RLS/);
});
test('editing a remotely deleted expense never creates it again',async()=>{
 const c=context();c.loadFinanceRows=async()=>[];let calls=0;c.request=async()=>{calls++};await assert.rejects(c.saveExpenseChanges('lav1_despesas',[{before:{id:'A'},after:{id:'A',valor:10}}]),/excluída/);assert.equal(calls,0);
});
test('concurrent changes reject stale edits',async()=>{
 const c=context();c.loadFinanceRows=async()=>[{id_legado:'A',dados_origem:{id:'A',atualizadoEm:'new'},atualizado_em:'new'}];await assert.rejects(c.saveExpenseChanges('lav1_despesas',[{before:{id:'A',atualizadoEm:'old'},after:{id:'A',valor:10}}]),/alterada/);
});
test('updates use conditional PATCH, never an upsert that recreates a deletion',async()=>{
 const c=context();let request;c.loadFinanceRows=async()=>[{id_legado:'A',dados_origem:{id:'A',atualizadoEm:'old'},atualizado_em:'2026-11-03T00:00:00Z'}];c.request=async(t,o)=>{request=o;return {data:[{id_legado:'A'}]}};
 await c.saveExpenseChanges('lav1_despesas',[{before:{id:'A',atualizadoEm:'old'},after:{id:'A',valor:20}}]);assert.equal(request.method,'PATCH');assert.equal(request.query.atualizado_em,'eq.2026-11-03T00:00:00Z');assert.equal(request.query.id_legado,'eq.A');
});
test('row changed between read and PATCH raises conflict',async()=>{
 const c=context();c.loadFinanceRows=async()=>[{id_legado:'A',dados_origem:{id:'A'},atualizado_em:'x'}];c.request=async()=>({data:[]});await assert.rejects(c.saveExpenseChanges('lav1_despesas',[{before:{id:'A'},after:{id:'A',valor:20}}]),/alterada/);
});
test('new insert uses ignore-duplicates and requires a returned record',async()=>{
 const c=context();let req;c.loadFinanceRows=async()=>[];c.request=async(t,o)=>{req=o;return {data:[]}};await assert.rejects(c.saveExpenseChanges('lav1_despesas',[{before:null,after:{id:'A',valor:20}}]),/alterada/);assert.match(req.prefer,/ignore-duplicates/);
});
test('retrying an already created identical expense is idempotent',async()=>{
 const c=context();const raw={id:'A',valor:20,criadoEm:'old',atualizadoEm:'old'};c.loadFinanceRows=async()=>[{id_legado:'A',dados_origem:raw}];let calls=0;c.request=async()=>calls++;
 const changes=[{before:null,after:{id:'A',valor:20,criadoEm:'new',atualizadoEm:'new'}}];await c.saveExpenseChanges('lav1_despesas',changes);assert.equal(calls,0);assert.equal(changes[0].after.atualizadoEm,'old');
});
test('partial series update reports confirmed IDs',async()=>{
 const c=context();c.loadFinanceRows=async()=>[];c.request=async(t,o)=>{if(o.body[0].id_legado==='B')throw Error('503');return {data:[{id_legado:'A'}]}};
 await assert.rejects(c.saveExpenseChanges('lav1_despesas',[{after:{id:'A'}},{after:{id:'B'}}]),e=>{assert.deepEqual(plain(e.completedIds),['A']);return /1 alteração/.test(e.message)});
});
test('Firebase claim mismatch is refreshed once and rejected with a specific error',async()=>{
 const c=context();let count=0;c.tokenResult=async()=>{count++;return {token:'x',claims:{}}};vm.runInContext('auth.currentUser.getIdTokenResult=tokenResult',c);await assert.rejects(c.getAccessToken(),e=>e.code==='supabase/role-mismatch');assert.equal(count,2);
});
test('page remote reconciliation replaces stale cache and preserves recovery data',async()=>{
 let cache=[{id:'deleted-A',valor:10}];const backups=[];
 const c={Map,Date,JSON,Error,window:{},ensureArrayCacheHydrated:async()=>cache,getCachedArray:()=>cache,preservarCopiaLocal:(k,v)=>backups.push(plain(v)),persistArrayCache:async(k,v)=>cache=plain(v),getStorageKey:()=> 'lav1_despesas',atualizarOpcoesAno(){},renderDespesasDaPrimeiraPagina(){}};vm.createContext(c);
 vm.runInContext(section(html,'    async function aplicarDespesasRemotas','    async function setupFirebaseSync'),c);
 await c.aplicarDespesasRemotas('lav1_despesas',[]);assert.deepEqual(cache,[]);assert.deepEqual(backups,[[{id:'deleted-A',valor:10}]]);
});
test('page save waits for remote success and leaves cache unchanged on failure',async()=>{
 const cache=[{id:'A',valor:10}];let persisted=false;
 const c={Map,JSON,Error,Promise,getStorageKey:()=> 'lav1_despesas',getCachedArray:()=>cache,window:{FirebaseStore:{saveExpenseChanges:async()=>{throw Error('503')}}},setStatusDespesasFirebase(){},persistArrayCache:async()=>{persisted=true}};vm.createContext(c);
 vm.runInContext('let despesasFirebaseWriteChain=Promise.resolve();\n'+section(html,'    async function saveDespesas','    async function removerDespesasSelecionadas'),c);
 await assert.rejects(c.saveDespesas([{id:'A',valor:20}]),/503/);assert.equal(persisted,false);assert.equal(cache[0].valor,10);
});
test('page save only sends changes, not unrelated cached records',async()=>{
 const cache=[{id:'A',valor:10},{id:'B',valor:20}];let changes;
 const c={Map,JSON,Error,Promise,getStorageKey:()=> 'lav1_despesas',getCachedArray:()=>cache,window:{FirebaseStore:{saveExpenseChanges:async(k,v)=>{changes=plain(v)}}},setStatusDespesasFirebase(){},persistArrayCache:async()=>{}};vm.createContext(c);
 vm.runInContext('let despesasFirebaseWriteChain=Promise.resolve();\n'+section(html,'    async function saveDespesas','    async function removerDespesasSelecionadas'),c);
 await c.saveDespesas([{id:'A',valor:15},{id:'B',valor:20}]);assert.equal(changes.length,1);assert.equal(changes[0].after.id,'A');
});

test('financial reconciliation keeps divergent drafts without resurrecting remote deletions',()=>{
 const c=context();
 const remote=c.reconcileFinanceSnapshot('lav1_despesas',[{id:'deleted',valor:10}],[]);
 assert.deepEqual(plain(remote),[]);
 const saved=JSON.parse(c.localStorage.getItem('lavacash_recovery_lav1_despesas'));
 assert.deepEqual(saved.snapshots[0].dados,[{id:'deleted',valor:10}]);
 c.reconcileFinanceSnapshot('lav1_despesas',[{id:'deleted',valor:10}],[]);
 assert.equal(JSON.parse(c.localStorage.getItem('lavacash_recovery_lav1_despesas')).snapshots.length,1);
});

test('reconciliation fails before replacing data when recovery storage is full',()=>{
 const c=context();c.localStorage.setItem=()=>{throw Error('QuotaExceededError')};
 assert.throws(()=>c.reconcileFinanceSnapshot('lav1_despesas',[{id:'draft'}],[]),/Quota/);
});

test('legacy expenses without timestamps still reject stale changes',async()=>{
 const c=context();c.loadFinanceRows=async()=>[{id_legado:'A',dados_origem:{id:'A',valor:20},atualizado_em:'version'}];
 c.request=async()=>{throw Error('unexpected write')};
 await assert.rejects(c.saveExpenseChanges('lav1_despesas',[{before:{id:'A',valor:10},after:{id:'A',valor:30}}]),/alterada/);
});

test('receipt save cannot report a queued write as a completed cloud save',async()=>{
 const receipts=fs.readFileSync(path.join(root,'receitas.html'),'utf8');
 let cached=false;
 const c={window:{FirebaseStore:{isAuthenticated:()=>true,setItem:async()=>false}},getStorageKey:()=> 'lav1_receitas',persistArrayCache:async()=>{cached=true},Error,Date};vm.createContext(c);
 vm.runInContext('let _importSaving=false;let ultimaSincronizacaoReceitasEm=0;\n'+section(receipts,'    async function saveReceitas','    // Format currency'),c);
 await assert.rejects(c.saveReceitas([{id:'A'}]),/pendente/);assert.equal(cached,false);
});
