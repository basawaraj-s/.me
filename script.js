window.__portfolioReady = false;
window.__portfolioQueue = [];
window.__onPortfolio = function (fn) {
    if (typeof fn !== 'function') return;
    if (window.__portfolioReady) fn();
    else window.__portfolioQueue.push(fn);
};

/* ============================================================
   AVATAR (pixel → photo iris)
   ============================================================ */
(() => {
    const AVATAR_PHOTO = 'photo.png';
    const HOVER_PHOTO = 'photo.png';

    const wrap = document.getElementById('avatar');
    const canvas = document.getElementById('art');
    const ctx = canvas.getContext('2d');
    const note = document.getElementById('note');

    const CFG = {
        src: AVATAR_PHOTO,
        hoverSrc: HOVER_PHOTO,
        zoom: 1.0,
        artCircle: 0.945,
        offsetX: 0,
        offsetY: 0,
        cellsAcross: 52,
        minCell: 2,
        fullAt: 0.62,
        maxSize: 0.94,
        minSize: 0.26,
        lift: 26,
        corner: 0.24,
        morphIn: 8,
        morphOut: 5.5,
        feather: 0.38,
        origin: 5,
        follow: 16,
        hold: 650,
        intro: true,
        introDelay: 400,
        introDur: 700,
    };

    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (REDUCED) CFG.morphIn = CFG.morphOut = 60;

    const mid = document.createElement('canvas');
    const mctx = mid.getContext('2d', { willReadFrequently: true });
    const midHover = document.createElement('canvas');
    const mhctx = midHover.getContext('2d', { willReadFrequently: true });

    const grid = document.createElement('canvas');
    const gctx = grid.getContext('2d', { willReadFrequently: true });
    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d');

    const TAU = Math.PI * 2;

    let D = 0, DPR = 1, cols = 0, cell = 0;
    let colourStr = null, shrink = null;
    let ax = null, ay = null, adc = null, aIdx = null, A = 0;
    let imgReady = false, hoverReady = false, needs = true, wasLive = true;
    let introOn = false, introT0 = 0, introEnd = 0;

    function makeFallbackCanvas(seed, palette) {
        const c = document.createElement('canvas');
        c.width = c.height = 640;
        const x = c.getContext('2d');
        x.fillStyle = '#0b0b12';
        x.fillRect(0, 0, 640, 640);

        let s = seed >>> 0;
        const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

        const cells = 26;
        const cw = 640 / cells;
        const cx = 320, cy = 320, R = 320;

        for (let j = 0; j < cells; j++) {
            for (let i = 0; i < cells; i++) {
                const px = (i + 0.5) * cw;
                const py = (j + 0.5) * cw;
                const dx = px - cx, dy = py - cy;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d > R * 1.02) continue;

                const edgeFade = 1 - Math.min(1, d / R);
                const v = rnd();
                if (v > 0.35 + edgeFade * 0.55) continue;

                x.fillStyle = palette[Math.floor(rnd() * palette.length)];
                x.globalAlpha = 0.55 + edgeFade * 0.45;
                const pad = 0.6 + rnd() * 1.4;
                x.fillRect(px - cw / 2 + pad, py - cw / 2 + pad, cw - pad * 2, cw - pad * 2);
            }
        }
        x.globalAlpha = 1;

        const g = x.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,.55)');
        x.fillStyle = g;
        x.beginPath();
        x.arc(cx, cy, R, 0, TAU);
        x.fill();
        return c;
    }

    const FB_DEFAULT = ['#1b1b2b', '#2a2a44', '#3a3a66', '#57578f', '#7a7ac0',
        '#c0c0e8', '#f2f2ff', '#ffd166', '#e6f01a'];
    const FB_HOVER = ['#1a0f2a', '#2e1a4a', '#4a2a7a', '#7a4aa8', '#c07ac0',
        '#f2b3e8', '#ffd166', '#e6f01a', '#f6f8fc'];

    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        D = wrap.clientWidth;
        if (!D) return;
        canvas.width = canvas.height = layer.width = layer.height = Math.round(D * DPR);
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        sample();
    }

    function sample() {
        cols = Math.max(8, Math.min(CFG.cellsAcross, Math.floor(D / CFG.minCell)));
        cell = D / cols;

        const n = cols * cols;
        grid.width = grid.height = cols;
        gctx.fillStyle = '#000';
        gctx.fillRect(0, 0, cols, cols);

        if (imgReady) {
            const dd = cols * CFG.zoom / CFG.artCircle;
            const cx = cols * 0.5 + CFG.offsetX * cols;
            const cy = cols * 0.5 + CFG.offsetY * cols;
            gctx.save();
            gctx.beginPath();
            gctx.arc(cols * 0.5, cols * 0.5, cols * 0.5 * 0.985, 0, TAU);
            gctx.clip();
            gctx.imageSmoothingEnabled = true;
            gctx.imageSmoothingQuality = 'high';
            gctx.drawImage(mid, 0, 0, mid.width, mid.height,
                cx - dd * 0.5, cy - dd * 0.5, dd, dd);
            gctx.restore();
        }

        let d = null;
        try { d = gctx.getImageData(0, 0, cols, cols).data; }
        catch (e) { d = null; }

        colourStr = new Array(n);
        shrink = new Float32Array(n);

        const L = CFG.lift;
        const INV_FULL = 1 / CFG.fullAt;

        for (let i = 0; i < n; i++) {
            if (d) {
                const o = i * 4;
                let r = d[o], g = d[o + 1], b = d[o + 2];
                if (r < L) r = L;
                if (g < L) g = L;
                if (b < L) b = L;
                colourStr[i] = 'rgb(' + r + ',' + g + ',' + b + ')';
                const lum = (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255;
                let u = 1 - lum * INV_FULL;
                if (u < 0) u = 0;
                shrink[i] = u * u * (3 - 2 * u);
            } else {
                colourStr[i] = 'rgb(40,40,40)';
                shrink[i] = 0.5;
            }
        }

        const mid0 = cols * 0.5, reachC = mid0 + 1;
        const xs = [], ys = [], ds = [], ids = [];
        for (let j = 0; j < cols; j++) {
            const ddy = j + 0.5 - mid0;
            const ddy2 = ddy * ddy;
            for (let i = 0; i < cols; i++) {
                const ddx = i + 0.5 - mid0;
                const dc = Math.sqrt(ddx * ddx + ddy2);
                if (dc > reachC) continue;
                xs.push((i + 0.5) * cell);
                ys.push((j + 0.5) * cell);
                ds.push(dc);
                ids.push(j * cols + i);
            }
        }
        A = xs.length;
        ax = Float32Array.from(xs);
        ay = Float32Array.from(ys);
        adc = Float32Array.from(ds);
        aIdx = Int32Array.from(ids);

        needs = true; wasLive = true;
    }

    function setNote(text) { note.textContent = text || ''; note.hidden = !text; }

    function prepareFromImage(image, targetCanvas, targetCtx) {
        const iw = image.naturalWidth, ih = image.naturalHeight;
        const side = Math.min(iw, ih);
        targetCanvas.width = targetCanvas.height = 640;
        targetCtx.clearRect(0, 0, 640, 640);
        targetCtx.imageSmoothingEnabled = true;
        targetCtx.imageSmoothingQuality = 'high';
        targetCtx.drawImage(image, (iw - side) * 0.5, (ih - side) * 0.5, side, side, 0, 0, 640, 640);
        return true;
    }

    function prepareFromCanvas(srcCanvas, targetCanvas, targetCtx) {
        targetCanvas.width = targetCanvas.height = 640;
        targetCtx.clearRect(0, 0, 640, 640);
        targetCtx.imageSmoothingEnabled = true;
        targetCtx.imageSmoothingQuality = 'high';
        targetCtx.drawImage(srcCanvas, 0, 0, 640, 640);
        return true;
    }

    function loadDefault(url, onDone) {
        const im = new Image();
        im.onload = () => {
            prepareFromImage(im, mid, mctx);
            imgReady = true;
            wrap.classList.add('loaded');
            setNote('');
            sample();
            onDone(true);
        };
        im.onerror = () => {
            prepareFromCanvas(makeFallbackCanvas(1337, FB_DEFAULT), mid, mctx);
            imgReady = true;
            wrap.classList.add('loaded');
            setNote('');
            sample();
            onDone(true);
        };
        im.src = url;
    }

    function loadHover(url, onDone) {
        const fallbackHover = () => {
            prepareFromCanvas(makeFallbackCanvas(9001, FB_HOVER), midHover, mhctx);
            hoverReady = true;
            onDone();
        };
        if (!url) { fallbackHover(); return; }

        const im = new Image();
        im.onload = () => {
            hoverReady = prepareFromImage(im, midHover, mhctx);
            onDone();
        };
        im.onerror = fallbackHover;
        im.src = url;
    }

    function startIntro() {
        if (CFG.intro && !REDUCED) {
            introOn = true;
            introT0 = performance.now();
            introEnd = introT0 + CFG.introDelay + CFG.introDur + 60;
            needs = true;
            wasLive = true;
        }
    }

    loadDefault(CFG.src, ok => {
        if (!ok) return;
        loadHover(CFG.hoverSrc, () => {
            window.__onPortfolio(startIntro);
        });
    });

    const iris = { h: 0, ox: 0, oy: 0 };
    let pointerOn = false, holdUntil = 0;
    let tx = 0, ty = 0, sx = 0, sy = 0;

    function setPointer(e) {
        const r = canvas.getBoundingClientRect();
        const k = r.width ? D / r.width : 1;
        tx = (e.clientX - r.left) * k;
        ty = (e.clientY - r.top) * k;
        if (!pointerOn) { sx = tx; sy = ty; pointerOn = true; }
    }
    wrap.addEventListener('pointermove', setPointer, { passive: true });
    wrap.addEventListener('pointerdown', setPointer, { passive: true });
    wrap.addEventListener('pointerup', e => {
        if (e.pointerType === 'touch') { pointerOn = false; holdUntil = performance.now() + CFG.hold; }
    });
    wrap.addEventListener('pointerleave', () => { pointerOn = false; });
    wrap.addEventListener('pointercancel', () => { pointerOn = false; });
    window.addEventListener('blur', () => { pointerOn = false; });

    function updateIris(dt, now) {
        const prev = iris.h;

        if (pointerOn) {
            const k = 1 - Math.exp(-dt * CFG.follow);
            sx += (tx - sx) * k;
            sy += (ty - sy) * k;
        }

        const on = pointerOn || now < holdUntil;

        if (on) {
            if (iris.h < 0.02) { iris.ox = sx; iris.oy = sy; }
            else {
                const k = 1 - Math.exp(-dt * CFG.origin);
                iris.ox += (sx - iris.ox) * k;
                iris.oy += (sy - iris.oy) * k;
            }
            iris.h += (1 - iris.h) * (1 - Math.exp(-dt * CFG.morphIn));
            if (iris.h > 0.999) iris.h = 1;
        } else if (iris.h > 0) {
            iris.h -= iris.h * (1 - Math.exp(-dt * CFG.morphOut));
            if (iris.h < 0.003) iris.h = 0;
        }

        return iris.h !== prev;
    }

    const ss = v => v * v * (3 - 2 * v);
    const cl = v => v < 0 ? 0 : v > 1 ? 1 : v;
    const hasRR = typeof ctx.roundRect === 'function';

    function drawPhoto(reach, F) {
        const pr = reach - F * 0.35;
        if (pr < 0.5) return;

        const source = hoverReady ? midHover : mid;
        lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        lctx.globalCompositeOperation = 'source-over';
        lctx.clearRect(0, 0, D, D);
        lctx.save();
        lctx.beginPath();
        lctx.arc(D * 0.5, D * 0.5, D * 0.5 * 0.99, 0, TAU);
        lctx.clip();
        lctx.imageSmoothingEnabled = true;
        lctx.imageSmoothingQuality = 'high';
        const dd = D * CFG.zoom / CFG.artCircle;
        lctx.drawImage(source, D * 0.5 + CFG.offsetX * D - dd * 0.5,
            D * 0.5 + CFG.offsetY * D - dd * 0.5, dd, dd);
        lctx.restore();

        lctx.globalCompositeOperation = 'destination-in';
        const g = lctx.createRadialGradient(iris.ox, iris.oy, 0, iris.ox, iris.oy, pr);
        const k = Math.max(0, (pr - F) / pr);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(k, 'rgba(0,0,0,1)');
        g.addColorStop(k + (1 - k) * 0.25, 'rgba(0,0,0,.84)');
        g.addColorStop(k + (1 - k) * 0.50, 'rgba(0,0,0,.50)');
        g.addColorStop(k + (1 - k) * 0.75, 'rgba(0,0,0,.16)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        lctx.fillStyle = g;
        lctx.fillRect(0, 0, D, D);

        ctx.drawImage(layer, 0, 0, D, D);
    }

    function render(now) {
        ctx.clearRect(0, 0, D, D);
        if (!colourStr) return;

        const F = CFG.feather * D;
        const half = D * 0.5;
        const Rmax = Math.hypot(iris.ox - half, iris.oy - half) + half;
        const reach = iris.h * (Rmax + F);
        const covered = iris.h >= 1;

        if (!covered) {
            const maxS = CFG.maxSize, minS = CFG.minSize;
            const maxE0 = 1.04;
            const invF = F > 0 ? 1 / F : 0;
            const colW = cols;
            const mid0 = colW * 0.5, reachC = mid0 + 1;
            const invRC = 1 / reachC;

            for (let a = 0; a < A; a++) {
                const px = ax[a], py = ay[a];
                const idx = aIdx[a];

                const w = iris.h > 0
                    ? ss(cl((reach - Math.hypot(px - iris.ox, py - iris.oy)) * invF))
                    : 0;

                let s = shrink[idx] * (1 - w);
                let grow = 1;

                if (introOn) {
                    let u = (now - introT0 - adc[a] * invRC * CFG.introDelay) / CFG.introDur;
                    if (u <= 0) continue;
                    if (u >= 1) u = 1;
                    else u = 1 - (1 - u) * (1 - u) * (1 - u);
                    grow = u;
                    const inv = 1 - u;
                    if (inv > s) s = inv;
                }

                const maxE = maxS + (maxE0 - maxS) * w;
                const sz = cell * (maxE + (minS - maxE) * s) * grow;
                if (sz < 0.4) continue;

                const cor = CFG.corner * (1 - w);
                const rad = sz * (cor + (0.5 - cor) * ss(cl((s - 0.15) / 0.6)));
                const x = px - sz * 0.5;
                const y = py - sz * 0.5;

                ctx.fillStyle = colourStr[idx];

                if (rad < 0.5) ctx.fillRect(x, y, sz, sz);
                else if (rad >= sz * 0.5 - 0.2) {
                    ctx.beginPath();
                    ctx.arc(px, py, sz * 0.5, 0, TAU);
                    ctx.fill();
                } else if (hasRR) {
                    ctx.beginPath();
                    ctx.roundRect(x, y, sz, sz, rad);
                    ctx.fill();
                } else {
                    ctx.beginPath();
                    ctx.arc(px, py, rad * 1.1, 0, TAU);
                    ctx.fill();
                }
            }
        }

        if (iris.h > 0 && imgReady) drawPhoto(reach, F);
    }

    let last = performance.now();
    function frame(now) {
        requestAnimationFrame(frame);
        const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
        last = now;

        const moving = imgReady ? updateIris(dt, now) : false;

        let intro = false;
        if (introOn) {
            if (now < introEnd) intro = true;
            else { introOn = false; needs = true; }
        }

        const live = moving || intro || needs;
        if (live || wasLive) render(now);
        wasLive = live;
        needs = false;
    }

    let rz = 0;
    new ResizeObserver(() => {
        cancelAnimationFrame(rz);
        rz = requestAnimationFrame(resize);
    }).observe(wrap);

    resize();
    requestAnimationFrame(frame);
})();

/* ============================================================
   GREETING
   ============================================================ */
(() => {
    const WORD_STEP = 560;
    const WORD_OUT = 190;
    const NICE_LEAD = 300;
    const NICE_HOLD = 1250;

    const body = document.body;
    const hellos = document.getElementById('hellos');

    const HELLOS = ['Hello', 'Hola', 'Bonjour', 'Ciao'];
    const items = HELLOS.map(word => {
        const el = document.createElement('div');
        el.className = 'hello-item';
        el.textContent = word;
        hellos.appendChild(el);
        return el;
    });

    const nice = document.createElement('div');
    nice.className = 'nice-message';
    nice.textContent = 'Have a nice day';
    hellos.appendChild(nice);

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const timers = [];
    let dead = false;
    const after = (ms, fn) => {
        const id = setTimeout(() => { if (!dead) fn(); }, ms);
        timers.push(id);
        return id;
    };
    const killTimers = () => {
        dead = true;
        timers.forEach(clearTimeout);
        timers.length = 0;
    };

    function splitChars(el) {
        const text = el.textContent;
        el.textContent = '';
        const frag = document.createDocumentFragment();
        const chars = [];
        for (const ch of text) {
            const span = document.createElement('span');
            span.className = 'char';
            if (ch === ' ') span.innerHTML = '&nbsp;';
            else span.textContent = ch;
            frag.appendChild(span);
            chars.push(span);
        }
        el.appendChild(frag);
        return chars;
    }

    function showOnlyNice() {
        for (const el of items) el.classList.remove('visible');
        nice.classList.add('visible');
    }

    function startGreeting() {
        body.classList.add('greeting-on');

        if (reduce) {
            showOnlyNice();
            after(1800, exitGreeting);
            return;
        }

        let i = 0;
        (function step() {
            if (i >= items.length) {
                after(NICE_LEAD, () => {
                    nice.classList.add('visible');
                    after(NICE_HOLD, exitGreeting);
                });
                return;
            }
            const cur = items[i++];
            cur.classList.add('visible');
            after(WORD_STEP, () => {
                cur.classList.remove('visible');
                after(WORD_OUT, step);
            });
        })();
    }

    let burst = false;
    function exitGreeting() {
        if (burst) return;
        burst = true;

        if (reduce) {
            body.classList.add('greeting-off');
            setTimeout(enterPortfolio, 300);
            return;
        }

        const visible = hellos.querySelectorAll('.hello-item.visible, .nice-message.visible');
        const all = [];
        for (const el of visible) all.push(...splitChars(el));

        if (!all.length) {
            body.classList.add('greeting-off');
            setTimeout(enterPortfolio, 300);
            return;
        }

        const cx = window.innerWidth * 0.5;
        const cy = window.innerHeight * 0.5;

        for (let n = 0; n < all.length; n++) {
            const ch = all[n];
            const r = ch.getBoundingClientRect();
            const mx = r.left + r.width * 0.5;
            const my = r.top + r.height * 0.5;

            let dx = mx - cx, dy = my - cy;
            const len = Math.hypot(dx, dy) || 1;
            dx /= len; dy /= len;

            const a = (Math.random() - 0.5) * 0.9;
            const ca = Math.cos(a), sa = Math.sin(a);
            const push = 300 + Math.random() * 520;

            const tx = (dx * ca - dy * sa) * push;
            const ty = (dx * sa + dy * ca) * push - 40;

            ch.style.setProperty('--tx', tx.toFixed(0) + 'px');
            ch.style.setProperty('--ty', ty.toFixed(0) + 'px');
            ch.style.setProperty('--rot', ((Math.random() - 0.5) * 720).toFixed(0) + 'deg');
            ch.style.setProperty('--delay', (Math.random() * 200).toFixed(0) + 'ms');
        }

        requestAnimationFrame(() => {
            hellos.classList.add('explode');
            body.classList.add('greeting-off');
        });

        setTimeout(enterPortfolio, 180);
    }

    let entered = false;
    function enterPortfolio() {
        if (window.__portfolioReady) return;
        window.__portfolioReady = true;
        entered = true;
        body.classList.add('reveal');
        const q = window.__portfolioQueue;
        while (q.length) {
            const fn = q.shift();
            try { fn(); } catch (e) { /* keep going */ }
        }
    }

    let finished = false;
    function finish() {
        if (finished) return;
        finished = true;
        body.setAttribute('aria-busy', 'false');
        startGreeting();
    }

    let skipped = false;
    function skip() {
        if (skipped || entered) return;
        skipped = true;
        killTimers();
        finished = true;
        burst = true;
        body.classList.add('greeting-on');
        body.setAttribute('aria-busy', 'false');
        showOnlyNice();
        setTimeout(() => {
            body.classList.add('greeting-off');
            enterPortfolio();
        }, 500);
    }

    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(ev =>
        window.addEventListener(ev, skip, { passive: true, once: true })
    );

    const begin = () => requestAnimationFrame(() => requestAnimationFrame(finish));

    if (document.fonts && document.fonts.ready) {
        Promise.race([
            document.fonts.ready,
            new Promise(r => setTimeout(r, 900))
        ]).then(begin).catch(begin);
    } else {
        begin();
    }
})();

/* ============================================================
   NAV · ROUTING · TRANSITIONS · CURSOR · TOAST
   ============================================================ */
(() => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch (e) { }
    }

    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const BASE_TITLE = document.title;

    const pill = document.getElementById('pill');
    const thumb = document.getElementById('pillThumb');
    const cursor = document.getElementById('cursor');
    const pageEl = document.getElementById('page');
    const items = pill.querySelectorAll('.item');
    const navItems = Array.from(pill.querySelectorAll('.item[data-page]'));
    const resumeBtn = document.getElementById('resumeBtn');
    const toastEl = document.getElementById('toast');

    const PAGE_LABELS = { me: 'Me', projects: 'Projects', experience: 'Experience' };
    let pageLabel = PAGE_LABELS.me;
    let onPageLabelChange = null;          // set by the cursor block
    const hasGsap = typeof window.gsap !== 'undefined';
    const animate = hasGsap && !REDUCED;

    /* ---------- Nav intro ---------- */
    window.__onPortfolio(() => {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            items.forEach(t => t.classList.add('in'));
            setTimeout(() => pill.classList.add('settled'), 700);
        }));
    });

    items.forEach(item => {
        item.addEventListener('pointerenter', (e) => {
            const r = item.getBoundingClientRect();
            const fromLeft = e.clientX < r.left + r.width / 2;
            item.style.setProperty('--fill-origin', fromLeft ? 'left center' : 'right center');
        });
    });

    /* ---------- Sliding active indicator ---------- */
    let activeNav = null;

    function moveThumb(item, animate) {
        if (!item) return;
        const place = () => {
            thumb.style.width = item.offsetWidth + 'px';
            thumb.style.height = item.offsetHeight + 'px';
            thumb.style.top = item.offsetTop + 'px';
            thumb.style.transform = 'translateX(' + item.offsetLeft + 'px)';
        };
        if (animate) {
            place();
        } else {
            thumb.style.transition = 'none';
            place();
            void thumb.offsetWidth;
            thumb.style.transition = '';
        }
        thumb.classList.add('ready');
    }

    window.addEventListener('resize', () => moveThumb(activeNav, false));

    function pop(el) {
        if (!el || REDUCED) return;
        el.classList.remove('pop');
        void el.offsetWidth;
        el.classList.add('pop');
        el.addEventListener('animationend', () => el.classList.remove('pop'), { once: true });
    }

    /* ---------- Routing & Transitions ---------- */
    const PAGES = ['me', 'projects', 'experience'];
    let currentPage = null;   // section currently in the DOM flow
    let targetId = null;      // page we are heading to
    let flow = null;          // active GSAP tween or timeline

    function setPage(id, push) {
        if (PAGES.indexOf(id) === -1) id = 'me';
        if (id === targetId) return;
        const next = document.getElementById('page-' + id);
        if (!next) return;

        const first = targetId === null;
        const prevIdx = first ? 0 : PAGES.indexOf(targetId);
        const dir = PAGES.indexOf(id) >= prevIdx ? 1 : -1;
        targetId = id;

        // UI chrome updates instantly
        navItems.forEach(i => i.classList.toggle('is-active', i.dataset.page === id));
        activeNav = navItems.find(i => i.dataset.page === id) || null;
        moveThumb(activeNav, !first);
        if (!first) pop(activeNav);

        document.title = id === 'me'
            ? BASE_TITLE
            : 'Basawaraj — ' + id.charAt(0).toUpperCase() + id.slice(1);

        if (push) { try { history.pushState(null, '', '#' + id); } catch (e) { } }

        pageLabel = PAGE_LABELS[id];
        if (onPageLabelChange) onPageLabelChange(dir);

        // Content: fade current out, then swap and play the entrance
        if (flow) { flow.kill(); flow = null; }
        const outgoing = currentPage;
        if (!outgoing || !animate) { swap(next, first); return; }

        flow = gsap.to(outgoing, {
            autoAlpha: 0, y: -8, duration: .22, ease: 'power2.in',
            onComplete: () => swap(next, false)
        });
    }

    function swap(next, first) {
        if (currentPage) {
            currentPage.classList.remove('is-active');
            if (hasGsap) gsap.set(currentPage, { clearProps: 'opacity,visibility,transform' });
        }
        next.classList.add('is-active');
        currentPage = next;
        pageEl.scrollTop = 0;
        if (!animate) return;
        flow = next.id === 'page-me' ? playMe(first) : enterGeneric(next);
    }

    function enterGeneric(section) {
        const els = section.querySelectorAll('[data-enter]');
        return gsap.fromTo(els,
            { autoAlpha: 0, y: 18 },
            { autoAlpha: 1, y: 0, duration: .7, stagger: .08, ease: 'power3.out',
              clearProps: 'opacity,visibility,transform' });
    }

    /* ---------- Me page: text splitting + timeline ---------- */
    function split(el, mode, masked) {
        if (el._split) return el._split;
        const text = el.textContent.replace(/\s+/g, ' ').trim();
        el.textContent = '';
        const sr = document.createElement('span');          // real text for screen readers
        sr.className = 'sr-only'; sr.textContent = text;
        const vis = document.createElement('span');         // animated copy
        vis.setAttribute('aria-hidden', 'true');
        el.append(sr, vis);

        const parts = mode === 'chars' ? [...text] : text.split(' ');
        const units = parts.map((p, i) => {
            const u = document.createElement('span');
            u.className = 'split-unit';
            u.textContent = p === ' ' ? '\u00A0' : p;
            if (masked) {
                const m = document.createElement('span');
                m.className = 'split-mask';
                m.appendChild(u);
                vis.appendChild(m);
            } else vis.appendChild(u);
            if (mode === 'words' && i < parts.length - 1) vis.appendChild(document.createTextNode(' '));
            return u;
        });
        return (el._split = { units, vis });
    }

    const heroEls = {
        band:   document.querySelector('.quality-band'),
        name:   document.querySelector('.quality-band-name'),
        quote:  document.querySelector('.quality-band-quote'),
        bio:    document.querySelector('.quality-bio'),
        avatar: document.querySelector('.quality-avatar')
    };
    let heroReady = false;

    function playMe(first) {
        const { band, name, quote, bio, avatar } = heroEls;
        const nameU  = split(name,  'chars', true).units;
        const quoteU = split(quote, 'words', true).units;
        const bioU   = split(bio,   'words', false).units;
        heroReady = false;
        band.classList.remove('is-done');

        gsap.set(band, { clipPath: 'inset(0 50% 0 50%)' });
        gsap.set([nameU, quoteU], { yPercent: 115 });
        gsap.set(bioU, { autoAlpha: 0, y: 14 });
        gsap.set(avatar, { autoAlpha: 0, scale: .9 });

        return gsap.timeline({
            delay: first ? .5 : 0,   // wait for the stage fade-in on first load
            defaults: { ease: 'power3.out' },
            onComplete: () => {
                band.classList.add('is-done');
                gsap.set(band, { clearProps: 'clipPath' });
                heroReady = true;
            }
        })
        .to(avatar, { autoAlpha: 1, scale: 1, duration: .9, ease: 'expo.out' }, 0.05)
        .to(band, { clipPath: 'inset(0 0% 0 0%)', duration: 1, ease: 'expo.inOut' }, 0.15)
        .to(nameU,  { yPercent: 0, duration: .8, stagger: .04, ease: 'power4.out' }, 0.8)
        .to(quoteU, { yPercent: 0, duration: .8, stagger: .06, ease: 'power4.out' }, 0.9)
        .to(bioU,   { autoAlpha: 1, y: 0, duration: .6, stagger: .018 }, 1.0);
    }

    /* Micro-interaction: letters of the name ripple upward on hover */
    heroEls.name.addEventListener('pointerover', (e) => {
        if (!heroReady || !animate) return;
        const u = e.target.closest('.split-unit');
        if (!u) return;
        const units = heroEls.name._split.units;
        const i = units.indexOf(u);
        const lift = [-22, -11, -5];
        units.forEach((el, j) => {
            const d = Math.abs(j - i);
            if (d > 2) return;
            gsap.fromTo(el, { yPercent: 0 },
                { yPercent: lift[d], duration: .18, delay: d * .04, ease: 'power2.out',
                  yoyo: true, repeat: 1, overwrite: 'auto' });
        });
    });

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const pageId = item.dataset.page;
            if (pageId) setPage(pageId, true);
        });
    });

    window.addEventListener('popstate', () => {
        const hash = window.location.hash.replace('#', '') || 'me';
        setPage(hash, false);
    });

    window.__onPortfolio(() => {
        const hash = window.location.hash.replace('#', '') || 'me';
        setPage(hash, false);
    });

    window.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || !window.__portfolioReady) return;
        const cur = currentPage ? PAGES.indexOf(currentPage.dataset.page) : 0;
        let next = -1;
        if (e.key === '1') next = 0;
        else if (e.key === '2') next = 1;
        else if (e.key === '3') next = 2;
        else if (e.key === 'ArrowRight') next = Math.min(cur + 1, PAGES.length - 1);
        else if (e.key === 'ArrowLeft') next = Math.max(cur - 1, 0);
        if (next > -1 && next !== cur) setPage(PAGES[next], true);
    });

    /* ---------- Toast + resume nudge ---------- */
    let toastT = 0;
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastT);
        toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
    }

    resumeBtn.addEventListener('click', () => {
        toast('Resume coming soon');
        if (REDUCED) return;
        resumeBtn.classList.remove('nudge');
        void resumeBtn.offsetWidth;
        resumeBtn.classList.add('nudge');
        resumeBtn.addEventListener('animationend', () => resumeBtn.classList.remove('nudge'), { once: true });
    });

    /* ---------- Custom cursor ---------- */
    if (matchMedia('(hover: hover) and (pointer: fine)').matches && !REDUCED && cursor) {
        document.documentElement.classList.add('has-cursor');

        const dot = cursor.querySelector('.dot');
        const label = cursor.querySelector('.label');

        let tx = 0, ty = 0, x = 0, y = 0, init = false;

        document.addEventListener('pointermove', (e) => {
            tx = e.clientX; ty = e.clientY;
            if (!init) {
                x = tx; y = ty; init = true;
                cursor.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';
                cursor.style.opacity = 1;
                showPageLabel(1);
            }

            const margin = 120;
            cursor.classList.toggle('flip-x', tx > window.innerWidth - margin);
            cursor.classList.toggle('flip-y', ty > window.innerHeight - margin);
        }, { passive: true });

        document.documentElement.addEventListener('mouseleave', () => { cursor.style.opacity = 0; });
        document.documentElement.addEventListener('mouseenter', () => { if (init) cursor.style.opacity = 1; });

        document.addEventListener('pointerdown', () => cursor.classList.add('down'));
        document.addEventListener('pointerup', () => cursor.classList.remove('down'));
        document.addEventListener('pointercancel', () => cursor.classList.remove('down'));
        window.addEventListener('blur', () => cursor.classList.remove('down'));

        (function loop() {
            const dx = tx - x, dy = ty - y;

            if (Math.abs(dx) > 0.03 || Math.abs(dy) > 0.03) {
                x += dx * 0.14;
                y += dy * 0.14;
                cursor.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0)';

                const speed = Math.min(Math.hypot(dx, dy), 30) / 30;
                const stretch = 1 + speed * 0.32;
                const squash = 1 - speed * 0.16;
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                dot.style.transform = 'rotate(' + angle + 'deg) scale(' + stretch + ', ' + squash + ') rotate(' + (-angle) + 'deg)';
            }

            requestAnimationFrame(loop);
        })();

        const STAGGER = 22;
        const OUT_DUR = 260;

        function buildCharSpan(text, dir) {
            const el = document.createElement('span');
            el.className = 'label__text';
            const chars = [...text];
            const n = chars.length;
            chars.forEach((ch, i) => {
                const s = document.createElement('span');
                s.textContent = ch === ' ' ? '\u00A0' : ch;
                const idx = dir >= 0 ? i : n - 1 - i;
                s.style.setProperty('--d', (idx * STAGGER) + 'ms');
                el.appendChild(s);
            });
            return el;
        }

        function swapLabel(text, dir) {
            if (!text) return;
            label.querySelectorAll('.label__text[data-leaving]').forEach(el => el.remove());

            const current = label.querySelector('.label__text:not([data-leaving])');
            if (current && current.textContent === text) return;

            const probe = buildCharSpan(text, 0);
            probe.style.cssText = 'position:absolute;visibility:hidden;left:0;top:0;';
            label.appendChild(probe);
            const targetWidth = probe.offsetWidth;
            probe.remove();

            label.style.width = label.offsetWidth + 'px';
            void label.offsetWidth;
            label.style.width = targetWidth + 'px';

            const next = buildCharSpan(text, dir);
            label.appendChild(next);

            if (current) {
                const kids = current.querySelectorAll(':scope > span');
                const n = kids.length;
                kids.forEach((s, i) => {
                    const idx = dir >= 0 ? i : n - 1 - i;
                    s.style.setProperty('--d', (idx * STAGGER) + 'ms');
                });
                void current.offsetWidth;
                current.dataset.leaving = '';
                const lastDelay = (n - 1) * STAGGER;
                setTimeout(() => current.remove(), OUT_DUR + lastDelay + 60);
            }
        }

        let hovering = false;
        let prevLeft = null;
        const HOVER_SEL = '.item, .footer-link';

        const labelFor = (t) => t.classList.contains('footer-link')
            ? t.textContent.trim().replace(/\s*↗\s*$/, '')
            : t.dataset.cursor;

        function showPageLabel(dir) {
            swapLabel(pageLabel, dir || 1);
            cursor.classList.add('active');
            cursor.classList.remove('on-item');
        }
        onPageLabelChange = (dir) => { if (init && !hovering) showPageLabel(dir); };

        document.addEventListener('pointerover', (e) => {
            const t = e.target.closest(HOVER_SEL);
            if (!t || t.contains(e.relatedTarget)) return;
            const text = labelFor(t);
            if (!text) return;
            hovering = true;
            const left = t.getBoundingClientRect().left;
            const dir = prevLeft === null ? 1 : (Math.sign(left - prevLeft) || 1);
            swapLabel(text, dir);
            cursor.classList.add('active', 'on-item');
            prevLeft = left;
        });

        document.addEventListener('pointerout', (e) => {
            const t = e.target.closest(HOVER_SEL);
            if (!t || t.contains(e.relatedTarget)) return;
            // moving straight onto another item: let pointerover handle it, no flicker
            if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest(HOVER_SEL)) return;
            hovering = false;
            showPageLabel(1);
        });

        document.querySelectorAll('.item').forEach(el => {
            el.addEventListener('focus', () => {
                if (!el.matches(':focus-visible')) return;
                hovering = true;
                swapLabel(el.dataset.cursor, 1);
                cursor.classList.add('active', 'on-item');
            });
            el.addEventListener('blur', () => { hovering = false; showPageLabel(1); });
        });
    }
})();

/* ============================================================
   TYPEWRITER
   ============================================================ */
(() => {
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function typeInto(el, { delay = 250, speed = 75, holdCursor = 2500 } = {}) {
        const text = el.dataset.text || el.textContent || '';
        el.textContent = '';
        el.setAttribute('aria-label', text);

        const chars = [...text].map(ch => {
            const s = document.createElement('span');
            s.className = 'type-char' + (REDUCED ? ' on' : '');
            s.setAttribute('aria-hidden', 'true');
            s.textContent = ch === ' ' ? '\u00A0' : ch;
            el.appendChild(s);
            return s;
        });
        if (REDUCED) return;

        const caret = document.createElement('span');
        caret.className = 'type-cursor';
        el.insertBefore(caret, el.firstChild);

        let i = 0;
        const tick = () => {
            if (i < chars.length) {
                chars[i].classList.add('on');
                chars[i].after(caret);
                i++;
                setTimeout(tick, speed + Math.random() * 40);
            } else {
                setTimeout(() => caret.classList.add('hidden'), holdCursor);
            }
        };
        setTimeout(tick, delay);
    }

    function watch(elId, sectionId) {
        const el = document.getElementById(elId);
        const section = document.getElementById(sectionId);
        if (!el || !section) return;
        let started = false;
        const start = () => {
            if (started || !section.classList.contains('is-active')) return;
            started = true;
            typeInto(el);
        };
        new MutationObserver(start).observe(section, { attributes: true, attributeFilter: ['class'] });
        window.__onPortfolio(start);
    }

    watch('projectsComingSoon', 'page-projects');
    watch('experienceComingSoon', 'page-experience');
})();
