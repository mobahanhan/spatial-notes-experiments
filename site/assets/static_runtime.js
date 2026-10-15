/* Offline transport for the unchanged experiment viewer, including file://. */
(() => {
  'use strict';
  const manifest = window.ESI_STATIC_MANIFEST;
  if (!manifest) throw Error('静态数据清单缺失');
  const values = new Map(), pending = new Map();
  function canonical(input) {
    const url = new URL(String(input), 'https://offline.invalid/');
    const sorted = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    return url.pathname + (sorted.length ? '?' + new URLSearchParams(sorted).toString() : '');
  }
  function register(key, value) { values.set(key, value); }
  function load(key) {
    if (values.has(key)) return Promise.resolve(values.get(key));
    if (!manifest.files[key]) return Promise.reject(Error('静态数据不存在：' + key));
    if (!pending.has(key)) pending.set(key, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(manifest.files[key], document.baseURI).href;
      script.onload = () => {
        script.remove();
        if (values.has(key)) resolve(values.get(key));
        else { pending.delete(key); reject(Error('静态数据未正确注册：' + key)); }
      };
      script.onerror = () => { script.remove(); pending.delete(key); reject(Error('静态数据读取失败：' + key)); };
      document.head.append(script);
    }));
    return pending.get(key);
  }
  function resourceURL(input) {
    const file = manifest.resources[canonical(input)];
    if (!file) throw Error('静态图片不存在：' + input);
    return new URL(file, document.baseURI).href;
  }
  async function dataFor(input) {
    const url = new URL(String(input), 'https://offline.invalid/');
    const id = url.searchParams.get('id') || manifest.catalog[0]?.id;
    if (url.pathname === '/api/catalog') return manifest.catalog;
    if (url.pathname === '/api/accuracy') return manifest.accuracy;
    if (url.pathname === '/api/data') {
      const hinted=manifest.run_geometry?.[id];
      const [row,prepared] = await Promise.all([load('run/' + id),hinted?load(hinted):Promise.resolve(null)]);
      const geometry = hinted===row.geometry_key?prepared:await load(row.geometry_key);
      return {...geometry, ...row.data};
    }
    if (url.pathname === '/api/model-input') {
      const frames = await load('inputs/' + id);
      const index = Number(url.searchParams.get('index'));
      if (!Number.isInteger(index) || index < 0 || index >= frames.length) throw Error('未知输入步骤');
      return frames[index];
    }
    throw Error('静态版没有此接口：' + url.pathname);
  }
  async function offlineFetch(input, options = {}) {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    let result;
    try { result = await dataFor(input); }
    catch (error) {
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return new Response(String(error.message || error), {status:404});
    }
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return new Response(JSON.stringify(result), {headers:{'Content-Type':'application/json; charset=utf-8'}});
  }
  window.ESIStatic = {register, resourceURL, canonical, dataFor};
  window.fetch = offlineFetch;
})();
