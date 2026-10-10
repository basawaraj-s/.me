window.__portfolioReady = false;
window.__portfolioQueue = [];
window.__onPortfolio = function (fn) {
    if (typeof fn !== 'function') return;
    if (window.__portfolioReady) fn();
    else window.__portfolioQueue.push(fn);
};

/* ============================================================
   AVATAR (photo → Joyboy iris reveal on hover)
   ============================================================ */
(() => {
    const AVATAR_PHOTO = 'photo.png';
    const HOVER_PHOTO = 'Joyboy.jpg';

    const wrap = document.getElementById('avatar');
    if (!wrap) return;
    const canvas = document.getElementById('art');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const note = document.getElementById('note');

    // Configuration
    const CFG = {
        followSpeed: 18,    // Fluid cursor tracking speed
        morphIn: 9,         // Speed of iris opening on hover
        morphOut: 6.5,      // Speed of iris closing on leave
        feather: 0.38,      // Radial gradient edge softness ratio
        holdTouch: 1600,    // Touch hold duration in ms
    };

    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (REDUCED) {
        CFG.morphIn = 40;
        CFG.morphOut = 40;
    }

    // Images
    const baseImg = new Image();
    const hoverImg = new Image();
    let baseReady = false;
    let hoverReady = false;

    // Offscreen layer for masked composition
    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d');

    const TAU = Math.PI * 2;
    let D = 0, DPR = 1;
    let isHovered = false;
    let tx = 0, ty = 0;       // Target pointer position (CSS px)
    let ox = 0, oy = 0;       // Current iris center (CSS px)
    let h = 0;                // Reveal progress (0.0 to 1.0)
    let rafId = null;
    let lastTime = 0;
    let touchHoldTimer = null;

    function setNote(text) {
        if (!note) return;
        note.textContent = text || '';
        note.hidden = !text;
    }

    function drawCover(targetCtx, img, targetD) {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih) return;
        const side = Math.min(iw, ih);
        const sx = (iw - side) * 0.5;
        const sy = (ih - side) * 0.5;
        targetCtx.drawImage(img, sx, sy, side, side, 0, 0, targetD, targetD);
    }

    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        D = wrap.clientWidth;
        if (!D) return;

        const pixelSize = Math.round(D * DPR);
        if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
            canvas.width = canvas.height = pixelSize;
            layer.width = layer.height = pixelSize;
        }

        if (ox === 0 && oy === 0) {
            ox = tx = D * 0.5;
            oy = ty = D * 0.5;
        }

        render();
    }

    function render() {
        if (!D || !baseReady) return;

        ctx.save();
        ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
        ctx.clearRect(0, 0, D, D);

        // Clip to circular avatar
        ctx.beginPath();
        ctx.arc(D * 0.5, D * 0.5, D * 0.5, 0, TAU);
        ctx.clip();

        // 1. Draw base photo (Basawaraj's photo)
        drawCover(ctx, baseImg, D);

        // 2. Draw hover reveal (Joyboy) if active
        if (hoverReady && h > 0) {
            if (h >= 0.999) {
                // Fully revealed: draw directly without mask
                drawCover(ctx, hoverImg, D);
            } else {
                const half = D * 0.5;
                const Rmax = Math.hypot(ox - half, oy - half) + half;
                const F = D * CFG.feather;
                const reach = h * (Rmax + F);
                const pr = reach - F * 0.35;

                if (pr >= 0.5) {
                    const gradRadius = Math.max(0.5, pr);
                    lctx.save();
                    lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
                    lctx.clearRect(0, 0, D, D);

                    // Clip layer to circle
                    lctx.beginPath();
                    lctx.arc(D * 0.5, D * 0.5, D * 0.5, 0, TAU);
                    lctx.clip();

                    // Draw Joyboy on layer
                    drawCover(lctx, hoverImg, D);

                    // Apply soft radial iris mask
                    lctx.globalCompositeOperation = 'destination-in';
                    const g = lctx.createRadialGradient(ox, oy, 0, ox, oy, gradRadius);
                    const k = Math.max(0, Math.min(1, (gradRadius - F) / gradRadius));
                    g.addColorStop(0, 'rgba(0,0,0,1)');
                    g.addColorStop(k, 'rgba(0,0,0,1)');
                    g.addColorStop(k + (1 - k) * 0.25, 'rgba(0,0,0,0.84)');
                    g.addColorStop(k + (1 - k) * 0.50, 'rgba(0,0,0,0.50)');
                    g.addColorStop(k + (1 - k) * 0.75, 'rgba(0,0,0,0.16)');
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    lctx.fillStyle = g;
                    lctx.fillRect(0, 0, D, D);
                    lctx.restore();

                    // Composite layer onto main canvas 1:1 in physical pixels
                    ctx.save();
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.drawImage(layer, 0, 0);
                    ctx.restore();
                }
            }
        }

        ctx.restore();
    }

    function startLoop() {
        if (!rafId) {
            lastTime = performance.now();
            rafId = requestAnimationFrame(loop);
        }
    }

    function loop(now) {
        const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
        lastTime = now;

        let continueLoop = false;

        if (isHovered) {
            // Smoothly ease iris center toward cursor target
            const followK = 1 - Math.exp(-dt * CFG.followSpeed);
            ox += (tx - ox) * followK;
            oy += (ty - oy) * followK;

            // Expand iris toward 1.0
            const morphK = 1 - Math.exp(-dt * CFG.morphIn);
            h += (1 - h) * morphK;
            if (h > 0.998) {
                h = 1;
            } else {
                continueLoop = true;
            }

            // Keep tracking while cursor is moving
            if (Math.abs(tx - ox) > 0.2 || Math.abs(ty - oy) > 0.2) {
                continueLoop = true;
            }
        } else {
            // Contract iris toward 0.0
            const morphK = 1 - Math.exp(-dt * CFG.morphOut);
            h -= h * morphK;
            if (h < 0.003) {
                h = 0;
            } else {
                continueLoop = true;
            }
        }

        render();

        if (continueLoop) {
            rafId = requestAnimationFrame(loop);
        } else {
            rafId = null;
        }
    }

    function setPointerPos(e) {
        const rect = canvas.getBoundingClientRect();
        const scale = rect.width ? D / rect.width : 1;
        tx = (e.clientX - rect.left) * scale;
        ty = (e.clientY - rect.top) * scale;
        tx = Math.max(0, Math.min(D, tx));
        ty = Math.max(0, Math.min(D, ty));
    }

    function onPointerEnter(e) {
        setPointerPos(e);
        if (h < 0.05) {
            ox = tx;
            oy = ty;
        }
        isHovered = true;
        startLoop();
    }

    function onPointerMove(e) {
        setPointerPos(e);
        if (!isHovered) {
            if (h < 0.05) {
                ox = tx;
                oy = ty;
            }
            isHovered = true;
        }
        startLoop();
    }

    function onPointerLeave() {
        if (touchHoldTimer) return;
        isHovered = false;
        startLoop();
    }

    wrap.addEventListener('pointerenter', onPointerEnter);
    wrap.addEventListener('pointermove', onPointerMove, { passive: true });
    wrap.addEventListener('pointerleave', onPointerLeave);
    wrap.addEventListener('pointercancel', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);

    // Touch support
    wrap.addEventListener('touchstart', e => {
        if (e.touches && e.touches[0]) {
            setPointerPos(e.touches[0]);
            if (h < 0.05) {
                ox = tx;
                oy = ty;
            }
            isHovered = true;
            startLoop();

            clearTimeout(touchHoldTimer);
            touchHoldTimer = setTimeout(() => {
                touchHoldTimer = null;
                isHovered = false;
                startLoop();
            }, CFG.holdTouch);
        }
    }, { passive: true });

    // Preload images
    baseImg.onload = () => {
        baseReady = true;
        wrap.classList.add('loaded');
        setNote('');
        resize();
    };
    baseImg.onerror = () => {
        setNote('Image failed to load');
    };
    baseImg.src = AVATAR_PHOTO;

    hoverImg.onload = () => {
        hoverReady = true;
    };
    hoverImg.src = HOVER_PHOTO;

    // Observe size changes
    if (window.ResizeObserver) {
        new ResizeObserver(() => {
            resize();
        }).observe(wrap);
    } else {
        window.addEventListener('resize', resize, { passive: true });
    }

    if (window.__onPortfolio) {
        window.__onPortfolio(() => resize());
    }

    resize();
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
