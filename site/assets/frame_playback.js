/* Shared, load-aware player for observation frames and recorded robot walks. */
(() => {
  'use strict';
  class Player {
    constructor(options) {
      this.options = options;
      this.image = options.image;
      this.index = -1;
      this.wanted = 0;
      this.playing = false;
      this.busy = false;
      this.error = '';
      this.active = true;
      this.request = 0;
      this.playToken = 0;
      this.timer = null;
      this.cache = new Map();
    }
    get count() { return Math.max(0, Number(this.options.count()) || 0); }
    get state() { return {index:this.index, wanted:this.wanted, count:this.count, playing:this.playing, busy:this.busy, error:this.error, active:this.active}; }
    notify() { this.options.onState?.(this.state); }
    load(url) {
      if (this.image.src === url && this.image.complete && this.image.naturalWidth > 0) return Promise.resolve(this.image);
      if (this.cache.has(url)) return this.cache.get(url);
      const image = this.options.makeImage ? this.options.makeImage() : new Image();
      image.decoding = 'async';
      const promise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => finish(Error('图片加载超时，请重试')), this.options.timeout || 30000);
        let finished = false;
        function finish(error) {
          if (finished) return;
          finished = true;
          clearTimeout(timeout);
          image.onload = image.onerror = null;
          if (error) reject(error); else resolve(image);
        }
        image.onerror = () => finish(Error('图片加载失败，请重试'));
        image.onload = async () => {
          try {
            if (image.decode) await image.decode();
            if (!(image.naturalWidth > 0)) throw Error('图片未能解码，请重试');
            finish();
          } catch (error) { finish(error); }
        };
        image.src = url;
      });
      this.cache.set(url, promise);
      promise.catch(() => { if (this.cache.get(url) === promise) this.cache.delete(url); });
      // Small look-ahead only: do not decode an entire experiment into memory.
      while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value);
      return promise;
    }
    url(index) {
      const route = this.options.url(index);
      if (!route) return null;
      const resolve = this.options.resolveURL || (value => window.ESIStatic ? window.ESIStatic.resourceURL(value) : value);
      return resolve(route);
    }
    display(image, index) {
      const surface = this.options.surface;
      if (surface) {
        // Paint the decoded RGB into a stable canvas. Replacing an <img> can
        // leave its old compositor layer visible while the 3D canvas advances.
        // Both canvases now receive their pixels in the same animation frame.
        if (image) {
          const width = image.naturalWidth, height = image.naturalHeight;
          if (!(width > 0 && height > 0)) throw Error('图片尺寸无效，请重试');
          if (surface.width !== width) surface.width = width;
          if (surface.height !== height) surface.height = height;
          surface.getContext('2d').drawImage(image, 0, 0, width, height);
        }
        surface.hidden = !image;
        surface.dataset.displayedFrame = String(index);
      }
      if (image && image !== this.image) {
        // Swap the already decoded element, so there is no blank intermediate
        // image and geometry/labels can be committed in the same browser task.
        for (const attribute of [...this.image.attributes]) {
          if (!['src', 'hidden'].includes(attribute.name)) image.setAttribute(attribute.name, attribute.value);
        }
        this.image.replaceWith(image);
        this.image = image;
      }
      // Keep the original image/URL available for inspection, not as a second
      // asynchronously painted visible layer when a synchronized surface exists.
      this.image.hidden = Boolean(surface) || !image;
      if (!image) this.image.removeAttribute('src');
      this.image.dataset.displayedFrame = String(index);
    }
    present(image, index, request) {
      return new Promise((resolve, reject) => {
        const paint = () => {
          if (request !== this.request || !this.active) { resolve(false); return; }
          try {
            this.display(image, index);
            this.index = index;
            this.busy = false;
            this.options.onCommit(index, this.image);
            if (this.playing && index === this.count - 1) this.pause();
            else this.notify();
            resolve(true);
          } catch (error) { reject(error); }
        };
        const requestFrame = this.options.requestFrame || window.requestAnimationFrame?.bind(window);
        if (requestFrame) requestFrame(paint); else paint();
      });
    }
    async seek(value, {playback = false} = {}) {
      if (!this.count) return false;
      const index = Math.max(0, Math.min(this.count - 1, Math.floor(Number(value) || 0)));
      this.wanted = index;
      if (!this.active) return false;
      if (index === this.index && !this.busy && !this.error) return true;
      const request = ++this.request;
      this.requestIsPlayback = playback;
      this.busy = true;
      this.error = '';
      this.notify();
      try {
        const url = this.url(index);
        const image = url ? await this.load(url) : null;
        if (request !== this.request || !this.active) return false;
        if (!await this.present(image, index, request)) return false;
        try { if (index + 1 < this.count) {
          const next = this.url(index + 1);
          if (next) this.load(next).catch(() => {});
        } } catch {} // A look-ahead failure must not invalidate the current frame.
        return true;
      } catch (error) {
        if (request !== this.request || !this.active) return false;
        this.busy = false;
        this.error = String(error.message || error);
        this.playing = false;
        this.playToken++;
        clearTimeout(this.timer);
        this.notify();
        return false;
      }
    }
    async play() {
      if (this.playing || !this.active || this.count < 2) return;
      this.playing = true;
      const token = ++this.playToken;
      this.notify();
      const start = this.index === this.count - 1 ? 0 : this.wanted;
      const ready = await this.seek(start, {playback:true});
      if (ready && token === this.playToken && this.playing) this.schedule(token);
    }
    schedule(token) {
      clearTimeout(this.timer);
      this.timer = setTimeout(async () => {
        if (token !== this.playToken || !this.playing || !this.active) return;
        if (this.busy) { this.schedule(token); return; }
        if (this.index + 1 >= this.count) { this.pause(); return; }
        const ready = await this.seek(this.index + 1, {playback:true});
        if (ready && token === this.playToken && this.playing) this.schedule(token);
      }, this.options.interval || 650);
    }
    pause() {
      this.playing = false;
      this.playToken++;
      clearTimeout(this.timer);
      if (this.busy && this.requestIsPlayback) {
        this.request++;
        this.busy = false;
        this.wanted = Math.max(0, this.index);
      }
      this.notify();
    }
    toggle() { if (this.playing) this.pause(); else return this.play(); }
    setActive(active) {
      this.active = active;
      if (!active) {
        this.pause();
        this.request++;
        this.busy = false;
        this.notify();
      } else if (this.count && (this.index < 0 || this.wanted !== this.index)) this.seek(this.wanted);
    }
    reset() {
      this.pause();
      this.request++;
      this.index = -1;
      this.wanted = 0;
      this.busy = false;
      this.error = '';
      this.cache.clear();
      this.image.hidden = true;
      this.image.removeAttribute('src');
      delete this.image.dataset.displayedFrame;
      if (this.options.surface) {
        this.options.surface.hidden = true;
        delete this.options.surface.dataset.displayedFrame;
      }
      this.notify();
    }
  }
  window.FramePlayback = {create:options => new Player(options)};
})();
