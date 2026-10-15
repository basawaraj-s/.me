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
    let initialized = false;
    let prevD = 0;

    function setNote(text) {
        if (!note) return;
        note.textContent = text || '';
        note.hidden = !text;
    }

    function drawCover(targetCtx, img, targetD) {
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        if (!iw || !ih || targetD <= 0) return;
        const side = Math.min(iw, ih);
        const sx = (iw - side) * 0.5;
        const sy = (ih - side) * 0.5;
        targetCtx.drawImage(img, sx, sy, side, side, 0, 0, targetD, targetD);
    }

    function resize() {
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        D = wrap.clientWidth;
        if (!D) return;

        const pixelSize = Math.max(1, Math.round(D * DPR));
        if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
            canvas.width = canvas.height = pixelSize;
            layer.width = layer.height = pixelSize;
        }

        if (!initialized) {
            ox = tx = D * 0.5;
            oy = ty = D * 0.5;
            initialized = true;
        } else if (prevD && prevD !== D) {
            const scale = D / prevD;
            ox = Math.min(D, Math.max(0, ox * scale));
            oy = Math.min(D, Math.max(0, oy * scale));
            tx = Math.min(D, Math.max(0, tx * scale));
            ty = Math.min(D, Math.max(0, ty * scale));
        }
        prevD = D;

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
                const reach = h * (Rmax + F * 1.5);
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
    wrap.addEventListener('pointercancel', () => {
        if (touchHoldTimer) {
            clearTimeout(touchHoldTimer);
            touchHoldTimer = null;
        }
        isHovered = false;
        startLoop();
    });
    window.addEventListener('blur', () => {
        if (touchHoldTimer) {
            clearTimeout(touchHoldTimer);
            touchHoldTimer = null;
        }
        isHovered = false;
        startLoop();
    });

    // Keyboard focus support for accessibility
    wrap.addEventListener('focus', () => {
        isHovered = true;
        tx = ox = D * 0.5;
        ty = oy = D * 0.5;
        startLoop();
    });
    wrap.addEventListener('blur', () => {
        isHovered = false;
        startLoop();
    });

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
        if (isHovered || h > 0) {
            render();
            startLoop();
        }
    };
    hoverImg.src = HOVER_PHOTO;

    // Observe size changes
    if (window.ResizeObserver) {
        new ResizeObserver(() => {
            resize();
        }).observe(wrap);
    }
    window.addEventListener('resize', resize, { passive: true });

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
            const len = Math.hypot(dx, dy);
            if (len >= 1) {
                dx /= len;
                dy /= len;
            } else {
                const angle = (n / Math.max(1, all.length)) * Math.PI * 2;
                dx = Math.cos(angle);
                dy = Math.sin(angle);
            }

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

    const skipEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    function removeSkipListeners() {
        skipEvents.forEach(ev => window.removeEventListener(ev, skip));
    }

    function enterPortfolio() {
        if (window.__portfolioReady) return;
        window.__portfolioReady = true;
        removeSkipListeners();
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
        removeSkipListeners();
        killTimers();
        finished = true;
        burst = true;
        body.setAttribute('aria-busy', 'false');
        showOnlyNice();
        setTimeout(() => {
            body.classList.add('greeting-off');
            enterPortfolio();
        }, 500);
    }

    skipEvents.forEach(ev =>
        window.addEventListener(ev, skip, { passive: true })
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
   NAV · ROUTING · TRANSITIONS · TOAST
   ============================================================ */
(() => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
        try { window.lucide.createIcons(); } catch (e) { }
    }

    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const BASE_TITLE = document.title;

    const pill = document.getElementById('pill');
    const thumb = document.getElementById('pillThumb');
    const pageEl = document.getElementById('page');
    const items = pill.querySelectorAll('.item');
    const navItems = Array.from(pill.querySelectorAll('.item[data-page]'));
    const resumeBtn = document.getElementById('resumeBtn');
    const toastEl = document.getElementById('toast');

    const PAGE_LABELS = { me: 'Me', projects: 'Projects', experience: 'Experience' };
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

    function moveThumb(item, withTransition) {
        if (!item) return;
        const place = () => {
            thumb.style.width = item.offsetWidth + 'px';
            thumb.style.height = item.offsetHeight + 'px';
            thumb.style.top = item.offsetTop + 'px';
            thumb.style.transform = 'translateX(' + item.offsetLeft + 'px)';
        };
        if (withTransition) {
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
        navItems.forEach(i => {
            const isCur = i.dataset.page === id;
            i.classList.toggle('is-active', isCur);
            i.setAttribute('aria-selected', isCur ? 'true' : 'false');
        });
        activeNav = navItems.find(i => i.dataset.page === id) || null;
        moveThumb(activeNav, !first);
        if (!first) pop(activeNav);

        document.title = id === 'me'
            ? BASE_TITLE
            : 'Basawaraj — ' + id.charAt(0).toUpperCase() + id.slice(1);

        if (push) { try { history.pushState(null, '', '#' + id); } catch (e) { } }

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
        if (!el) return { units: [], vis: null };
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
        if (!band || !name || !quote || !bio || !avatar) return;
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
    if (heroEls.name) {
        heroEls.name.addEventListener('pointerover', (e) => {
            if (!heroReady || !animate || !heroEls.name._split) return;
            const u = e.target.closest('.split-unit');
            if (!u) return;
            const units = heroEls.name._split.units;
            const i = units.indexOf(u);
            if (i === -1) return;
            const lift = [-22, -11, -5];
            units.forEach((el, j) => {
                const d = Math.abs(j - i);
                if (d > 2) return;
                gsap.fromTo(el, { yPercent: 0 },
                    { yPercent: lift[d], duration: .18, delay: d * .04, ease: 'power2.out',
                      yoyo: true, repeat: 1, overwrite: 'auto',
                      onComplete: () => gsap.set(el, { yPercent: 0 }) });
            });
        });
    }

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
        if (e.target && e.target.matches && e.target.matches('input, textarea, select, [contenteditable="true"]')) return;
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
        toast('Resume · soon');
        if (REDUCED) return;
        resumeBtn.classList.remove('nudge');
        void resumeBtn.offsetWidth;
        resumeBtn.classList.add('nudge');
        resumeBtn.addEventListener('animationend', () => resumeBtn.classList.remove('nudge'), { once: true });
    });
})();

/* ============================================================
   TYPEWRITER
   ============================================================ */
(() => {
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

    function typeInto(el, { delay = 250, speed = 75, holdCursor = 2500 } = {}) {
        const text = el.dataset.text || el.textContent.trim() || '';
        el.textContent = '';
        el.setAttribute('aria-label', text);

        // Visual animation container hidden from screen readers to prevent duplicated speech
        const vis = document.createElement('span');
        vis.className = 'type-visual';
        vis.setAttribute('aria-hidden', 'true');
        el.appendChild(vis);

        const chars = [...text].map(ch => {
            const s = document.createElement('span');
            s.className = 'type-char' + (REDUCED ? ' on' : '');
            s.textContent = ch === ' ' ? '\u00A0' : ch;
            vis.appendChild(s);
            return s;
        });
        if (REDUCED) return;

        const caret = document.createElement('span');
        caret.className = 'type-cursor';
        caret.setAttribute('aria-hidden', 'true');
        vis.insertBefore(caret, vis.firstChild);

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

    /* ============================================================
       THEME SLIDER & REAL-TIME DUAL-THEME TRANSITION
       ============================================================ */
    const themeSlider = document.getElementById('themeSlider');
    const themeHandle = document.getElementById('themeHandle');
    const themeSplitLine = document.getElementById('themeSplitLine');
    const stageEl = document.getElementById('stage') || document.body;

    if (themeHandle) {
        let isDragging = false;
        let didDrag = false;
        let startX = 0;
        let currentX = 0;
        let pendingX = 0;
        let targetTheme = 'light';
        let animating = false;
        let splitLayer = null;
        let stageRect = null;
        let maxDragW = 0;
        let rafId = null;

        function getTheme() {
            return document.documentElement.dataset.theme || 'light';
        }

        function getSide() {
            if (themeSlider && themeSlider.dataset.side) {
                return themeSlider.dataset.side;
            }
            return getTheme() === 'dark' ? 'left' : 'right';
        }

        function updateSide() {
            const side = getTheme() === 'dark' ? 'left' : 'right';
            if (themeSlider) themeSlider.dataset.side = side;
        }

        function updateHandleA11y() {
            const isDark = getTheme() === 'dark';
            themeHandle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
            themeHandle.setAttribute('aria-pressed', isDark ? 'false' : 'true');
        }

        updateSide();
        updateHandleA11y();

        function createSplitLayer(target) {
            if (splitLayer) {
                splitLayer.remove();
                splitLayer = null;
            }

            stageRect = stageEl.getBoundingClientRect();
            const stageW = stageRect.width || (window.innerWidth - 16);
            const handleW = themeHandle.offsetWidth || 24;
            maxDragW = Math.max(10, stageW - handleW);
            const side = getSide();

            // 1. Full-screen split container with target theme variables
            splitLayer = document.createElement('div');
            splitLayer.className = 'theme-split-layer';
            splitLayer.dataset.theme = target;

            // 2. Clone stage and copy exact visual state
            const clone = stageEl.cloneNode(true);
            clone.dataset.theme = target;

            // Prefix IDs in clone to avoid collisions while keeping structure intact
            clone.querySelectorAll('[id]').forEach(el => {
                el.id = 'split-clone-' + el.id;
            });

            // Synchronize canvas pixels (avatar portrait)
            const origArt = document.getElementById('art');
            const cloneArt = clone.querySelector('canvas');
            if (origArt && cloneArt) {
                cloneArt.width = origArt.width;
                cloneArt.height = origArt.height;
                const ctx = cloneArt.getContext('2d');
                if (ctx) ctx.drawImage(origArt, 0, 0);
            }

            // Synchronize scroll position
            const origPage = document.getElementById('page');
            const clonePage = clone.querySelector('.page');
            if (origPage && clonePage) {
                clonePage.scrollTop = origPage.scrollTop;
            }

            splitLayer.appendChild(clone);

            // Initial clip depending on starting side
            if (side === 'left') {
                const initCut = stageRect.left;
                splitLayer.style.clipPath = 'inset(0 calc(100% - ' + initCut + 'px) 0 0)';
                if (themeSplitLine) {
                    themeSplitLine.style.transform = 'translate3d(' + (initCut - 1) + 'px, 0, 0)';
                }
            } else {
                const initCut = stageRect.right;
                splitLayer.style.clipPath = 'inset(0 0 0 ' + initCut + 'px)';
                if (themeSplitLine) {
                    themeSplitLine.style.transform = 'translate3d(' + (initCut - 1) + 'px, 0, 0)';
                }
            }

            document.body.appendChild(splitLayer);

            if (themeSplitLine) {
                themeSplitLine.classList.add('is-active');
            }
        }

        function setSplitPosition(x) {
            currentX = x;
            const side = getSide();
            const stageW = stageRect ? stageRect.width : (stageEl.clientWidth || (window.innerWidth - 16));
            const handleW = themeHandle.offsetWidth || 24;
            const maxTravel = Math.max(1, stageW - handleW);
            const progress = Math.max(0, Math.min(1, x / maxTravel));

            if (side === 'left') {
                themeHandle.style.transform = 'translate3d(' + x + 'px, -50%, 0)';
                const stageLeft = stageRect ? stageRect.left : 8;
                // Mathematically exact boundary: starts at stageLeft, passes handle center, finishes at stageRight
                const cutX = stageLeft + x + handleW * progress;

                if (splitLayer) {
                    splitLayer.style.clipPath = 'inset(0 calc(100% - ' + cutX + 'px) 0 0)';
                }
                if (themeSplitLine) {
                    themeSplitLine.style.transform = 'translate3d(' + (cutX - 1) + 'px, 0, 0)';
                }
            } else {
                themeHandle.style.transform = 'translate3d(' + (-x) + 'px, -50%, 0)';
                const stageRight = stageRect ? stageRect.right : (window.innerWidth - 8);
                // Mathematically exact boundary: starts at stageRight, passes handle center, finishes at stageLeft
                const cutX = stageRight - x - handleW * progress;

                if (splitLayer) {
                    splitLayer.style.clipPath = 'inset(0 0 0 ' + cutX + 'px)';
                }
                if (themeSplitLine) {
                    themeSplitLine.style.transform = 'translate3d(' + (cutX - 1) + 'px, 0, 0)';
                }
            }
        }

        function renderFrame() {
            rafId = null;
            if (!isDragging && !animating) return;
            setSplitPosition(pendingX);
        }

        function cleanUpSplit() {
            if (splitLayer) {
                splitLayer.remove();
                splitLayer = null;
            }
            if (themeSplitLine) {
                themeSplitLine.classList.remove('is-active');
                themeSplitLine.style.transform = '';
            }
            themeHandle.style.transition = '';
            themeHandle.style.transform = '';
            animating = false;
        }

        function finishTransition(target) {
            document.documentElement.classList.add('no-theme-transition');
            document.documentElement.dataset.theme = target;
            try { localStorage.setItem('theme', target); } catch (e) {}

            // Dock handle to the new side
            const newSide = target === 'dark' ? 'left' : 'right';
            if (themeSlider) themeSlider.dataset.side = newSide;

            themeHandle.style.transition = 'none';
            themeHandle.style.transform = '';

            if (splitLayer) {
                splitLayer.remove();
                splitLayer = null;
            }
            if (themeSplitLine) {
                themeSplitLine.classList.remove('is-active');
                themeSplitLine.style.transform = '';
            }

            updateHandleA11y();

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    document.documentElement.classList.remove('no-theme-transition');
                    animating = false;
                });
            });
        }

        function animateSplit(fromX, toX, duration, easeStr, onComplete) {
            animating = true;
            if (typeof gsap !== 'undefined' && !REDUCED) {
                const proxy = { x: fromX };
                gsap.to(proxy, {
                    x: toX,
                    duration: duration / 1000,
                    ease: easeStr || 'power2.out',
                    onUpdate: () => setSplitPosition(proxy.x),
                    onComplete: () => {
                        animating = false;
                        if (onComplete) onComplete();
                    }
                });
            } else {
                const startTime = performance.now();
                function step(now) {
                    const progress = Math.min(1, (now - startTime) / duration);
                    const eased = 1 - Math.pow(1 - progress, 3);
                    const val = fromX + (toX - fromX) * eased;
                    setSplitPosition(val);
                    if (progress < 1) {
                        requestAnimationFrame(step);
                    } else {
                        animating = false;
                        if (onComplete) onComplete();
                    }
                }
                requestAnimationFrame(step);
            }
        }

        function triggerToggle() {
            if (animating) return;
            const cur = getTheme();
            targetTheme = cur === 'dark' ? 'light' : 'dark';
            createSplitLayer(targetTheme);
            const stageW = stageRect ? stageRect.width : (stageEl.clientWidth || (window.innerWidth - 16));
            const handleW = themeHandle.offsetWidth || 24;
            const maxTravel = Math.max(1, stageW - handleW);
            animateSplit(0, maxTravel, 420, 'power2.inOut', () => finishTransition(targetTheme));
        }

        function onPointerMove(e) {
            if (!isDragging || animating) return;
            const side = getSide();
            const dx = side === 'left' ? (e.clientX - startX) : (startX - e.clientX);
            const maxTravel = maxDragW || (stageEl.clientWidth - 24 || window.innerWidth - 40);
            pendingX = Math.max(0, Math.min(maxTravel, dx));
            if (pendingX > 4) {
                didDrag = true;
            }
            if (!rafId) {
                rafId = requestAnimationFrame(renderFrame);
            }
        }

        function onPointerEnd(e) {
            if (!isDragging) return;
            isDragging = false;
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }

            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerEnd);
            window.removeEventListener('pointercancel', onPointerEnd);

            themeHandle.classList.remove('is-dragging');
            document.body.classList.remove('is-theme-dragging');

            const maxTravel = maxDragW || (stageEl.clientWidth - 24 || window.innerWidth - 40);
            const threshold = Math.max(48, Math.min(180, maxTravel * 0.25));

            if (!didDrag || pendingX <= 4) {
                // Click gesture: animate real-time split sweep across full screen
                triggerToggle();
            } else if (pendingX >= threshold) {
                // Dragged past threshold: complete the wipe to the opposite edge and dock there
                const remainingW = maxTravel - currentX;
                const dur = Math.max(180, Math.min(380, (remainingW / maxTravel) * 400));
                animateSplit(currentX, maxTravel, dur, 'power2.out', () => finishTransition(targetTheme));
            } else {
                // Released below threshold: spring back to home edge
                const dur = Math.max(160, Math.min(280, (currentX / threshold) * 260));
                animateSplit(currentX, 0, dur, 'power2.out', cleanUpSplit);
            }
        }

        themeHandle.addEventListener('pointerdown', (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            if (animating) return;

            isDragging = true;
            didDrag = false;
            startX = e.clientX;
            currentX = 0;
            pendingX = 0;

            const cur = getTheme();
            targetTheme = cur === 'dark' ? 'light' : 'dark';

            createSplitLayer(targetTheme);

            themeHandle.classList.add('is-dragging');
            themeHandle.style.transition = 'none';
            document.body.classList.add('is-theme-dragging');

            window.addEventListener('pointermove', onPointerMove, { passive: true });
            window.addEventListener('pointerup', onPointerEnd);
            window.addEventListener('pointercancel', onPointerEnd);
        });

        // Click handler for accessibility (keyboard click, assistive tech, programmatic click)
        themeHandle.addEventListener('click', (e) => {
            if (animating) return;
            if (didDrag) {
                didDrag = false;
                return;
            }
            triggerToggle();
        });

        themeHandle.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                if (animating) return;
                triggerToggle();
            }
        });
    }
})();

/* ============================================================
   CUSTOM CONTEXT MENU
   ============================================================ */
(() => {
    const ctxMenu = document.getElementById('ctxMenu');
    if (!ctxMenu) return;

    const ctxThemeLabel = document.getElementById('ctxThemeLabel');
    const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let isOpen = false;
    let backdrop = null;
    let focusIdx = -1;

    // Render Lucide icons inside the context menu
    function renderCtxIcons() {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            try { window.lucide.createIcons({ nodes: ctxMenu.querySelectorAll('[data-lucide]') }); } catch (e) {}
        }
    }
    renderCtxIcons();

    function getItems() {
        return Array.from(ctxMenu.querySelectorAll('.ctx-item'));
    }

    function updateThemeLabel() {
        if (!ctxThemeLabel) return;
        const isDark = (document.documentElement.dataset.theme || 'light') === 'dark';
        ctxThemeLabel.textContent = isDark ? 'Switch to Light' : 'Switch to Dark';
    }

    function updateActiveNav() {
        const activePage = document.querySelector('.page-section.is-active');
        const activeId = activePage ? activePage.dataset.page : 'me';
        ctxMenu.querySelectorAll('.ctx-item[data-action="nav"]').forEach(item => {
            item.classList.toggle('ctx-active', item.dataset.page === activeId);
        });
    }

    function assignStagger() {
        const items = getItems();
        items.forEach((item, i) => {
            item.style.setProperty('--ctx-d', (i * 30) + 'ms');
        });
    }

    function open(x, y) {
        if (isOpen) close(true);

        updateThemeLabel();
        updateActiveNav();
        assignStagger();

        // Position with viewport clamping
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Temporarily show offscreen to measure
        ctxMenu.style.left = '-9999px';
        ctxMenu.style.top = '-9999px';
        ctxMenu.classList.add('is-open');
        const rect = ctxMenu.getBoundingClientRect();
        ctxMenu.classList.remove('is-open');

        const menuW = rect.width || 240;
        const menuH = rect.height || 300;
        const pad = 8;

        let finalX = x;
        let finalY = y;

        // Horizontal clamping
        if (x + menuW + pad > vw) finalX = vw - menuW - pad;
        if (finalX < pad) finalX = pad;

        // Vertical clamping
        if (y + menuH + pad > vh) finalY = vh - menuH - pad;
        if (finalY < pad) finalY = pad;

        // Transform origin for directional animation
        const originX = x >= finalX + menuW * 0.5 ? 'right' : 'left';
        const originY = y >= finalY + menuH * 0.5 ? 'bottom' : 'top';
        ctxMenu.style.setProperty('--ctx-origin', originY + ' ' + originX);

        ctxMenu.style.left = finalX + 'px';
        ctxMenu.style.top = finalY + 'px';

        // Create invisible backdrop for outside clicks
        backdrop = document.createElement('div');
        backdrop.className = 'ctx-backdrop';
        backdrop.addEventListener('mousedown', () => close());
        backdrop.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            close();
            // Re-open at new position after a frame
            requestAnimationFrame(() => {
                open(e.clientX, e.clientY);
            });
        });
        document.body.appendChild(backdrop);

        // Open
        isOpen = true;
        focusIdx = -1;
        ctxMenu.classList.add('is-open');
        ctxMenu.focus();
    }

    function close(instant) {
        if (!isOpen) return;
        isOpen = false;
        focusIdx = -1;

        ctxMenu.classList.remove('is-open');

        // Clear keyboard focus
        getItems().forEach(item => item.classList.remove('ctx-focused'));

        if (backdrop) {
            backdrop.remove();
            backdrop = null;
        }
    }

    // ---- Keyboard navigation ----
    function setFocus(idx) {
        const items = getItems();
        if (!items.length) return;
        items.forEach(item => item.classList.remove('ctx-focused'));
        focusIdx = ((idx % items.length) + items.length) % items.length;
        items[focusIdx].classList.add('ctx-focused');
        items[focusIdx].scrollIntoView({ block: 'nearest' });
    }

    ctxMenu.addEventListener('keydown', (e) => {
        if (!isOpen) return;

        if (e.key === 'Escape' || e.key === 'Tab') {
            e.preventDefault();
            close();
            return;
        }

        const items = getItems();
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocus(focusIdx + 1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocus(focusIdx - 1);
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (focusIdx >= 0 && focusIdx < items.length) {
                items[focusIdx].click();
            }
        }
    });

    // ---- Actions ----
    ctxMenu.addEventListener('click', (e) => {
        const item = e.target.closest('.ctx-item');
        if (!item) return;

        const action = item.dataset.action;

        if (action === 'nav') {
            const pageId = item.dataset.page;
            if (pageId) {
                // Trigger navigation via the existing nav system
                const navBtn = document.querySelector('.pill .item[data-page="' + pageId + '"]');
                if (navBtn) navBtn.click();
            }
            close();
        } else if (action === 'theme') {
            // Toggle theme via the existing theme handle
            const themeHandle = document.getElementById('themeHandle');
            if (themeHandle) themeHandle.click();
            // Update label after a tick (theme transition starts)
            setTimeout(updateThemeLabel, 50);
            close();
        } else if (action === 'resume') {
            const resumeBtn = document.getElementById('resumeBtn');
            if (resumeBtn) resumeBtn.click();
            close();
        } else if (action === 'link') {
            // Links handle themselves via href, just close
            close();
        }
    });

    // ---- Right-click handler ----
    document.addEventListener('contextmenu', (e) => {
        // Only intercept when portfolio is ready
        if (!window.__portfolioReady) return;

        e.preventDefault();
        open(e.clientX, e.clientY);
    });

    // Close on scroll or resize
    window.addEventListener('scroll', () => { if (isOpen) close(); }, { passive: true, capture: true });
    window.addEventListener('resize', () => { if (isOpen) close(); }, { passive: true });

    // Close on Escape at document level
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            e.preventDefault();
            close();
        }
    });
})();
