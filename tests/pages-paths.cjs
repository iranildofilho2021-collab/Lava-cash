const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../site');
const origin = 'https://example.invalid';
const base = origin + '/Lava-cash/';
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}
function verifyTarget(ref, from) {
  if (!ref || /^(?:#|data:|mailto:|tel:|javascript:)/.test(ref) || ref.includes('${')) return;
  const url = new URL(ref, new URL(from, base));
  if (url.origin !== origin) return;
  assert.ok(url.pathname.startsWith('/Lava-cash/'), `${from}: ${ref} escapes the project directory`);
  const local = decodeURIComponent(url.pathname.slice('/Lava-cash/'.length));
  assert.ok(fs.existsSync(path.join(root, local || 'index.html')), `${from}: missing ${ref}`);
}

test('all HTML assets and navigation resolve under the Pages project path', () => {
  for (const file of files(root).filter(f => f.endsWith('.html'))) {
    const name = path.relative(root, file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) verifyTarget(m[1], name);
  }
});

test('mobile links, action links, redirects and module imports resolve to existing files', () => {
  for (const file of files(root).filter(f => /\.(js|html)$/.test(f) && !f.includes('/vendor/'))) {
    const name = path.relative(root, file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/(?:href\s*:\s*|location\.href\s*=\s*|location\.(?:replace|assign)\(\s*)["']([^"']+)["']/g)) verifyTarget(m[1], 'index.html');
    for (const m of text.matchAll(/\bfrom\s*["'](\.[^"']+)["']/g)) verifyTarget(m[1], name);
  }
});

test('PWA start, scope, icons and shortcuts stay inside the Pages directory', () => {
  const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(new URL(m.scope, base).href, base);
  verifyTarget(m.start_url, 'manifest.json');
  for (const i of m.icons) verifyTarget(i.src, 'manifest.json');
  for (const s of m.shortcuts) verifyTarget(s.url, 'manifest.json');
});

test('legacy clean URLs redirect only known routes and retain query/hash', () => {
  const html = fs.readFileSync(path.join(root, '404.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  let target;
  const location = { pathname: '/Lava-cash/despesas', search: '?acao=nova-despesa', hash: '#form', replace: v => { target = v; } };
  vm.runInNewContext(script, { location, Set });
  assert.equal(target, '/Lava-cash/despesas.html?acao=nova-despesa#form');
  target = null; location.pathname = '/Lava-cash/https://evil.invalid';
  vm.runInNewContext(script, { location, Set });
  assert.equal(target, null);
});

test('expired session redirects to project login without looping on its root', () => {
  let source = fs.readFileSync(path.join(root, 'js/firebase-init.js'), 'utf8');
  source = source.slice(source.indexOf("window.addEventListener('supabase:auth-required'"), source.indexOf('// Inicia\n'));
  source = source.replaceAll('import.meta.url', JSON.stringify(base + 'js/firebase-init.js'));
  let callback, target;
  const window = { location: { pathname: '/Lava-cash/despesas.html', origin, replace: url => { target = url; } }, addEventListener: (_, fn) => { callback = fn; } };
  vm.runInNewContext(source, { window, URL, String }); callback();
  assert.equal(new URL(target).pathname, '/Lava-cash/index.html');
  assert.equal(new URL(target).searchParams.get('sessao'), 'expirada');
  for (const pathname of ['/Lava-cash/', '/Lava-cash/index.html']) {
    target = null; window.location.pathname = pathname; callback(); assert.equal(target, null);
  }
});

test('service worker activation preserves other applications on the same GitHub origin', async () => {
  const handlers = {}, deleted = [];
  const prefix = `lavacash:${base}:`;
  const self = { registration: { scope: base }, addEventListener: (name, fn) => { handlers[name] = fn; }, clients: { claim: async () => {} } };
  const caches = { keys: async () => ['another-app', prefix + 'old'], delete: async name => { deleted.push(name); } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), { self, caches, console, URL });
  let promise; handlers.activate({ waitUntil: value => { promise = value; } }); await promise;
  assert.deepEqual(deleted, [prefix + 'old']);
});

test('every application module and inline script passes JavaScript syntax checks', () => {
  for (const file of files(root).filter(f => f.endsWith('.js') && !f.includes('/vendor/'))) {
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(file), encoding: 'utf8' });
    assert.equal(result.status, 0, path.relative(root, file) + ': ' + result.stderr);
  }
  for (const file of files(root).filter(f => f.endsWith('.html'))) {
    for (const script of fs.readFileSync(file, 'utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(script[1], { filename: file });
  }
});
