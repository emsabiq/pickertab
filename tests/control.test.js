const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const htmlPath = path.join(__dirname, '..', 'control.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptMatches = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)];
if (!scriptMatches.length) {
  throw new Error('Unable to locate inline script in control.html');
}
const inlineScript = scriptMatches[scriptMatches.length - 1][1];

function createStubElement() {
  return {
    children: [],
    style: {},
    className: '',
    textContent: '',
    innerHTML: '',
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    querySelector() {
      return { onclick: null };
    },
    querySelectorAll() {
      return [];
    },
    setAttribute() {},
  };
}

function createControlContext(options = {}) {
  const tabBody = Object.assign(createStubElement(), {
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  });
  const count = { textContent: '0' };
  const toastEl = createStubElement();
  const toastBody = { textContent: '' };
  const pin = { value: '' };
  const title = { value: '' };
  const type = { value: 'pdf' };
  const urlInput = { value: '' };
  const btnAdd = { onclick: null };
  const btnPublish = { onclick: null };
  const btnPick = { onclick: null };
  const pickerModalEl = createStubElement();
  const pickerBody = Object.assign(createStubElement(), {
    querySelectorAll() {
      return [];
    },
  });
  const crumb = Object.assign(createStubElement(), {
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  });
  const filterExt = { value: '', onchange: null };
  const search = { value: '', oninput: null };

  const elements = {
    tabBody,
    count,
    toast: toastEl,
    toastBody,
    pin,
    title,
    type,
    url: urlInput,
    btnAdd,
    btnPublish,
    btnPick,
    pickerModal: pickerModalEl,
    pickerBody,
    crumb,
    filterExt,
    search,
  };

  const document = {
    getElementById(id) {
      return elements[id] || null;
    },
    createElement() {
      return createStubElement();
    },
  };

  const localStorage = {
    store: new Map(),
    setItem(key, value) {
      this.store.set(String(key), String(value));
    },
    getItem(key) {
      return this.store.has(String(key)) ? this.store.get(String(key)) : null;
    },
    removeItem(key) {
      this.store.delete(String(key));
    },
  };

  const bootstrap = {
    Toast: class {
      constructor() {
        return {
          show() {},
        };
      }
    },
    Modal: class {
      constructor() {
        return {
          show() {},
          hide() {},
        };
      }
    },
  };

  function Sortable() {}

  const alertFn = typeof options.alert === 'function' ? options.alert : () => {};
  const fetchFn = typeof options.fetch === 'function'
    ? options.fetch
    : async () => ({ ok: false, status: 500, json: async () => ({}) });

  const windowObj = {
    document,
    localStorage,
    open() {},
  };

  const context = {
    console,
    document,
    window: windowObj,
    localStorage,
    bootstrap,
    Sortable,
    fetch: fetchFn,
    setTimeout,
    clearTimeout,
    alert: alertFn,
  };

  Object.assign(windowObj, {
    window: windowObj,
    document,
    localStorage,
    bootstrap,
    Sortable,
    btnAdd,
    btnPublish,
    btnPick,
    fetch: fetchFn,
    alert: alertFn,
  });

  Object.assign(context, {
    btnAdd,
    btnPublish,
    btnPick,
  });

  return context;
}

test('publishManifest retries when primary backend reports default fallback path', async () => {
  const context = createControlContext();
  vm.runInNewContext(inlineScript, context);

  assert.ok(context.window.__control, 'Control helpers should be exposed');
  const publishManifest = context.window.__control.publishManifest;
  assert.equal(typeof publishManifest, 'function', 'publishManifest should be a function');

  const responses = [
    {
      ok: true,
      status: 200,
      body: {
        ok: true,
        fallback: { type: 'alternate', path: '/tmp/manifest.json' },
        location: '/tmp/manifest.json',
      },
    },
    {
      ok: true,
      status: 200,
      body: {
        ok: true,
        manifest: { rev: 5, tabs: [], updatedAt: '2024-01-01T00:00:00.000Z' },
      },
    },
  ];

  let call = 0;
  const calledUrls = [];
  context.fetch = async (url) => {
    if (typeof url === 'string' && (url.includes('manifest.json') || url.includes('/api/manifest'))) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    }

    calledUrls.push(url);
    const res = responses[call];
    call += 1;
    if (!res) {
      throw new Error(`Unexpected fetch call for ${url}. Calls so far: ${calledUrls.join(', ')}`);
    }
    return {
      ok: res.ok,
      status: res.status,
      json: async () => res.body,
    };
  };

  const result = await publishManifest({ tabs: [], pin: '123456' });
  assert.equal(call, 2, 'should attempt the secondary endpoint when fallback is default temp path');
  assert.deepEqual(result, responses[1].body);
  assert.deepEqual(calledUrls, ['/api/save_manifest', '/save_manifest.php']);
});

test('publishManifest retries when default fallback path is only reported via location', async () => {
  const context = createControlContext();
  vm.runInNewContext(inlineScript, context);

  const publishManifest = context.window.__control.publishManifest;
  const responses = [
    {
      ok: true,
      status: 200,
      body: {
        ok: true,
        location: '/tmp/manifest.json',
      },
    },
    {
      ok: true,
      status: 200,
      body: {
        ok: true,
        manifest: { rev: 10, tabs: [], updatedAt: '2024-02-02T00:00:00.000Z' },
      },
    },
  ];

  let call = 0;
  const calledUrls = [];
  context.fetch = async (url) => {
    if (typeof url === 'string' && (url.includes('manifest.json') || url.includes('/api/manifest'))) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    }

    calledUrls.push(url);
    const res = responses[call];
    call += 1;
    if (!res) {
      throw new Error(`Unexpected fetch call for ${url}. Calls so far: ${calledUrls.join(', ')}`);
    }
    return {
      ok: res.ok,
      status: res.status,
      json: async () => res.body,
    };
  };

  const result = await publishManifest({ tabs: [], pin: '123456' });
  assert.equal(call, 2, 'should try the secondary endpoint after default fallback location');
  assert.deepEqual(result, responses[1].body);
  assert.deepEqual(calledUrls, ['/api/save_manifest', '/save_manifest.php']);
});

test('publishManifest retries when fallback.path is default temp path but location differs', async () => {
  const context = createControlContext();
  vm.runInNewContext(inlineScript, context);

  const publishManifest = context.window.__control.publishManifest;
  const responses = [
    {
      ok: true,
      status: 200,
      body: {
        ok: true,
        location: '/api/manifest',
        fallback: { type: 'alternate', path: '/tmp/manifest.json' },
      },
    },
    {
      ok: true,
      status: 200,
      body: {
        ok: true,
        manifest: { rev: 12, tabs: [], updatedAt: '2024-03-03T00:00:00.000Z' },
      },
    },
  ];

  let call = 0;
  const calledUrls = [];
  context.fetch = async (url) => {
    if (typeof url === 'string' && (url.includes('manifest.json') || url.includes('/api/manifest'))) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    }

    calledUrls.push(url);
    const res = responses[call];
    call += 1;
    if (!res) {
      throw new Error(`Unexpected fetch call for ${url}. Calls so far: ${calledUrls.join(', ')}`);
    }
    return {
      ok: res.ok,
      status: res.status,
      json: async () => res.body,
    };
  };

  const result = await publishManifest({ tabs: [], pin: '123456' });
  assert.equal(call, 2, 'should attempt backup endpoint if fallback.path is default temp path');
  assert.deepEqual(result, responses[1].body);
  assert.deepEqual(calledUrls, ['/api/save_manifest', '/save_manifest.php']);
});

test('publishManifest retries when backend reports file:// URL for default fallback path', async () => {
  const context = createControlContext();
  vm.runInNewContext(inlineScript, context);

  const publishManifest = context.window.__control.publishManifest;
  const responses = [
    {
      ok: true,
      status: 200,
      body: {
        ok: true,
        fallback: { type: 'alternate', path: 'file:///tmp/manifest.json' },
      },
    },
    {
      ok: true,
      status: 200,
      body: {
        ok: true,
        manifest: { rev: 13, tabs: [], updatedAt: '2024-04-04T00:00:00.000Z' },
      },
    },
  ];

  let call = 0;
  const calledUrls = [];
  context.fetch = async (url) => {
    if (typeof url === 'string' && (url.includes('manifest.json') || url.includes('/api/manifest'))) {
      return {
        ok: false,
        status: 404,
        json: async () => ({}),
      };
    }

    calledUrls.push(url);
    const res = responses[call];
    call += 1;
    if (!res) {
      throw new Error(`Unexpected fetch call for ${url}. Calls so far: ${calledUrls.join(', ')}`);
    }
    return {
      ok: res.ok,
      status: res.status,
      json: async () => res.body,
    };
  };

  const result = await publishManifest({ tabs: [], pin: '123456' });
  assert.equal(call, 2, 'should retry when backend returns file:// default fallback path');
  assert.deepEqual(result, responses[1].body);
  assert.deepEqual(calledUrls, ['/api/save_manifest', '/save_manifest.php']);
});

test('publish click handler surfaces backend error messages nested in objects', async () => {
  const alerts = [];
  const context = createControlContext({
    alert: (msg) => {
      alerts.push(msg);
    },
  });
  vm.runInNewContext(inlineScript, context);

  context.document.getElementById('pin').value = '7890';

  const responses = [
    {
      ok: false,
      status: 500,
      body: { error: { message: 'Backend primer down' } },
    },
    {
      ok: false,
      status: 502,
      body: { message: 'Backend sekunder offline' },
    },
  ];

  let call = 0;
  context.fetch = async (url, opts = {}) => {
    if (typeof url === 'string' && (url.includes('manifest.json') || url.includes('/api/manifest'))) {
      return { ok: false, status: 404, json: async () => ({}) };
    }

    if (opts && opts.method === 'POST') {
      const res = responses[call];
      call += 1;
      if (!res) {
        throw new Error(`Unexpected publish call for ${url}`);
      }
      return {
        ok: res.ok,
        status: res.status,
        json: async () => res.body,
      };
    }

    return { ok: false, status: 404, json: async () => ({}) };
  };

  await context.btnPublish.onclick();

  assert.equal(call, 2, 'should try both backends before surfacing failure');
  assert.equal(alerts.length, 1, 'should surface a single alert for the failure');
  assert.equal(
    alerts[0],
    'Gagal publish: Backend sekunder offline. Tidak ada backend yang dapat menyimpan manifest secara permanen.',
    'alert message should include backend-provided error text'
  );
});

test('publish click handler flattens complex object error payloads', async () => {
  const alerts = [];
  const context = createControlContext({
    alert: (msg) => {
      alerts.push(msg);
    },
  });
  vm.runInNewContext(inlineScript, context);

  context.document.getElementById('pin').value = '2468';

  const responses = [
    {
      ok: false,
      status: 500,
      body: { error: { detail: { info: { text: 'Disk read-only' } } } },
    },
    {
      ok: false,
      status: 500,
      body: { error: { detail: { reason: { message: 'Permission denied menulis manifest' } } } },
    },
  ];

  let call = 0;
  context.fetch = async (url, opts = {}) => {
    if (typeof url === 'string' && (url.includes('manifest.json') || url.includes('/api/manifest'))) {
      return { ok: false, status: 404, json: async () => ({}) };
    }

    if (opts && opts.method === 'POST') {
      const res = responses[call];
      call += 1;
      if (!res) {
        throw new Error(`Unexpected publish call for ${url}`);
      }
      return {
        ok: res.ok,
        status: res.status,
        json: async () => res.body,
      };
    }

    return { ok: false, status: 404, json: async () => ({}) };
  };

  await context.btnPublish.onclick();

  assert.equal(call, 2, 'should attempt both backends');
  assert.equal(alerts.length, 1, 'should surface a single alert');
  assert.equal(
    alerts[0],
    'Gagal publish: Permission denied menulis manifest. Tidak ada backend yang dapat menyimpan manifest secara permanen.',
    'alert should flatten nested object messages into readable text'
  );
});
