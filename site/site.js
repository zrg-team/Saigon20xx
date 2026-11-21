// SaiGon 20XX public site.
// - The hero IS the game's main menu: the Menu layout's strips (scene.js, made by tools/publish/site_media.py) drawn on a
//   low-res canvas and drifting at their own speeds on one clock, the logo bobbing and flickering, the panel of rows,
//   all placed the way src/ui/menu.ts place() + tick() place them (the splash in tools/publish/web/boot.js does the
//   same). Scrolling adds depth: the far strips lag behind the near ones.
// - The language is the game's: localStorage "saigon20xx.lang" (same origin as play/), so picking one here also opens
//   the game in it. TIẾP TỤC and the save line come from the game's save, "saigon20xx.save".
(() => {
	"use strict";
	const root = document.documentElement;
	const $ = (s, el = document) => el.querySelector(s);
	const $$ = (s, el = document) => [...el.querySelectorAll(s)];
	const reduce = matchMedia("(prefers-reduced-motion: reduce)");
	// A phone scrolls the page on its compositor, ahead of any script: a menu moved from script trails the finger and
	// shakes, so on touch the menu scrolls with the page (it only fades) and the strips' depth follows each frame.
	const touch = matchMedia("(pointer: coarse)");
	const lang = () => (root.dataset.lang === "en" ? "en" : "vi");
	const S = window.SAIGON_SCENE;

	// ------------------------------------------------------------------ language
	const TITLE = { vi: "SaiGon 20XX · Một ngày ở Sài Gòn, 2004", en: "SaiGon 20XX · A day in Saigon, 2004" };
	function setLang(l, save) {
		root.dataset.lang = l;
		root.lang = l;
		if (save) try { localStorage.setItem("saigon20xx.lang", l); } catch { /* storage blocked */ }
		document.title = TITLE[l];
		saveLine();
		versionLine();
		dayClock();
		hero?.place();
	}
	$$("[data-lang-toggle]").forEach((b) => b.addEventListener("click", () => setLang(lang() === "vi" ? "en" : "vi", true)));
	document.title = TITLE[lang()];

	// ------------------------------------------------------------------ the game's save and build
	const DOW = { vi: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"], en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] };
	const TITLES = { Quan1: "QUẬN 1", Quan3: "QUẬN 3", Quan5: "QUẬN 5", Quan4: "QUẬN 4", ThuThiem: "QUẬN 2" };
	/** Day 0 of the game's calendar is Thursday 1 July 2004 (src/city/calendar.ts). */
	const dayShort = (day) => {
		const d = new Date(Date.UTC(2004, 6, 1) + (day | 0) * 86400000);
		return `${DOW[lang()][d.getUTCDay()]} ${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
	};
	const hhmm = (h) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60 + 1e-6)).padStart(2, "0")}`;
	const money = (v) => (lang() === "vi" ? Math.round(v).toLocaleString("de-DE") : Math.round(v).toLocaleString("en-US")) + "đ";
	function loadSave() {
		try {
			const s = JSON.parse(localStorage.getItem("saigon20xx.save") || "null");
			return s && s.v === 1 && TITLES[s.district] ? s : null;
		} catch {
			return null;
		}
	}
	const save = loadSave();
	function saveLine() {
		const el = $("#save-line");
		if (!el || !save) return;
		el.hidden = false;
		el.innerHTML = "";
		el.append(`${dayShort(save.day ?? 0)} · ${hhmm(save.hour ?? 16.75)} · ${TITLES[save.district]} `);
		const b = document.createElement("b");
		b.textContent = money(save.money ?? 0);
		el.append(b);
	}
	if (save) {                                       // the first row carries on, like the game's TIẾP TỤC
		$("[data-continue-vi]").textContent = "TIẾP TỤC";
		$("[data-continue-en]").textContent = "CONTINUE";
	}
	let build = null;
	function versionLine() {
		if (!build?.label) return;
		const label = lang() === "en" ? build.label.replace("bản dựng", "build").replace("bản thử", "dev") : build.label;
		const v = $("#version"), f = $("#foot-version");
		v.textContent = label;
		v.hidden = false;
		f.textContent = label;
	}
	fetch("play/version.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((v) => { build = v; versionLine(); }).catch(() => {});
	fetch("play/data.json", { method: "HEAD", cache: "no-store" }).then((r) => { if (!r.ok) root.classList.add("no-build"); }).catch(() => root.classList.add("no-build"));

	// ------------------------------------------------------------------ the scene: the menu's strips on a pixel canvas
	class Scene {
		constructor(canvas, depth) {
			this.c = canvas;
			this.g = canvas.getContext("2d");
			this.box = canvas.parentElement;
			this.depth = depth;                         // (strip index, scroll progress) -> game px the strip lags by
			this.clock = 0;
			this.visible = true;
			this.dirty = true;
			this.lift = S.strips.map(() => 0);
			this.imgs = S.strips.map((s) => {
				const im = new Image();
				im.onload = () => { this.dirty = true; };
				im.src = s.img;
				return im;
			});
			new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.dirty = true; }).observe(this.box);
			this.fit();
		}
		/** The game's own view of the box: its 270x480 viewport fitted inside, "scale outer" (the bigger view fills it). */
		fit() {
			const W = this.box.clientWidth, H = this.box.clientHeight;
			const k = Math.min(W / 270, H / 480);
			const cw = Math.ceil(W / k), ch = Math.ceil(H / k);
			if (this.c.width !== cw || this.c.height !== ch) { this.c.width = cw; this.c.height = ch; }
			this.c.style.width = `${cw * k}px`;
			this.c.style.height = `${ch * k}px`;
			Object.assign(this, { k, vw: cw, vh: ch, W, H });
			this.dirty = true;
		}
		/** The street at the bottom, the sky centred, every strip's copies laid from the left edge on one clock
		 *  (src/ui/menu.ts scroll(): whole pixels). */
		draw() {
			const g = this.g, vw = this.vw, vh = this.vh, top = vh - S.h;
			g.imageSmoothingEnabled = false;
			g.fillStyle = S.bg;
			g.fillRect(0, 0, vw, vh);
			S.strips.forEach((s, i) => {
				const im = this.imgs[i];
				if (!im.complete || !im.naturalWidth) return;
				const y = Math.round(top + s.y + this.lift[i]);
				if (!s.speed) {
					if (vw <= s.w) g.drawImage(im, Math.round(vw / 2 - s.w / 2), y, s.w, s.h);
					else g.drawImage(im, -1, y, vw + 2, s.h);
					return;
				}
				for (let x = -((s.speed * this.clock) % s.w); x < vw; x += s.w) g.drawImage(im, Math.round(x), y, s.w, s.h);
			});
			this.dirty = false;
		}
		/** p: how far the page has moved past this scene (0 = at rest). Far strips lag behind, the street doesn't. */
		parallax(p) {
			const L = S.strips.length;
			S.strips.forEach((s, i) => {
				const v = Math.round(this.depth(i, L) * p);
				if (v !== this.lift[i]) { this.lift[i] = v; this.dirty = true; }
			});
		}
	}
	const DEPTH = [0.55, 0.45, 0.32, 0.18, 0];        // sky, clouds, skyline, roofs, street

	// ------------------------------------------------------------------ the hero: the menu
	let hero = null;
	if (S && $("#hero-scene")) {
		const heroEl = $("#top"), ui = $("#hero-ui"), logo = $("#hero-logo"), menu = $("#menu");
		const rows = $$(".menu .row"), marker = $(".menu .marker");
		const scene = new Scene($("#hero-scene"), (i, L) => (DEPTH[Math.round((i * (DEPTH.length - 1)) / Math.max(1, L - 1))] ?? 0) * 480);
		let sel = 0, logoTop = 0, heroH = heroEl.offsetHeight, lastY = -1, shown = false;
		// scrollY is read in the scroll event, which runs before the frame dirties any style: read inside the frame it
		// would force an extra style pass every frame, even with the page at rest
		let wantY = Math.max(0, Math.round(scrollY));
		addEventListener("scroll", () => { wantY = Math.max(0, Math.round(scrollY)); }, { passive: true });
		const rowTop = [];
		const bar = $("#bar");
		const setBar = (on) => { if (on !== shown) { shown = on; bar.classList.toggle("show", on); } };
		const select = (i) => {
			sel = (i + rows.length) % rows.length;
			rows.forEach((r, j) => r.classList.toggle("sel", j === sel));
			marker.style.top = `${rowTop[sel] ?? 0}px`;
		};
		hero = {
			scene,
			/** src/ui/menu.ts place(), in CSS px: game px x k, from the top of the canvas (anchored at the box's bottom). */
			place() {
				scene.fit();
				heroH = scene.H;
				lastY = -1;
				const k = scene.k, vw = scene.vw, vh = scene.vh;
				const tall = vh > vw * 1.05;
				const dy = vh - S.h;                              // the street at the bottom of the screen
				const logoY = tall ? Math.max(54, Math.round(Math.max(54, dy * 0.42))) : 54;
				const py = tall ? logoY + 112 : 178;
				const off = scene.H - vh * k;                      // the canvas overhangs the top by under one game px
				const Y = (gy) => off + gy * k;
				// whole CSS px per font pixel; the small lines never under 2 (at the game's own 1.4 they're unreadable on a site)
				const f1 = Math.max(2, Math.round(k)), f2 = Math.max(2, Math.round(2 * k));
				ui.style.setProperty("--k", String(k));
				ui.style.setProperty("--f1", `${f1 * 10}px`);
				ui.style.setProperty("--f2", `${f2 * 10}px`);
				ui.style.setProperty("--o1", `${f1}px`);
				ui.style.setProperty("--o2", `${f2}px`);
				logoTop = Y(logoY) - (S.logo.h / 2) * k;
				logo.parentElement.style.top = `${logoTop}px`;
				const capTop = (gy, f) => Y(gy) - 0.4 * f * 10;   // the faces' caps sit 0.4em under the line top
				$(".tagline", ui).style.top = `${capTop(logoY + 35, f1)}px`;
				// the panel: as wide as the widest row + 48, 82 tall, its rows 24 apart round py
				const widest = Math.max(...rows.map((r) => [...r.children].reduce((w, c) => Math.max(w, c.offsetWidth), 0)));
				const pw = Math.min(vw * k - 8 * k, Math.max(152 * k, widest + 48 * k)), ph = 82 * k;
				menu.style.width = `${pw}px`;
				menu.style.height = `${ph}px`;
				menu.style.top = `${Y(py) - ph / 2}px`;
				rows.forEach((r, i) => {
					rowTop[i] = (py - 24 + i * 24 - (py - 41)) * k - 0.75 * f2 * 10;
					r.style.top = `${rowTop[i]}px`;
					r.style.paddingLeft = `${22 * k}px`;
				});
				marker.style.left = `${4 * k}px`;
				select(sel);
				const below = py + 41 + 6;
				const sl = $("#save-line");
				sl.style.top = `${capTop(below + 5, f1)}px`;
				$(".help", ui).style.top = `${capTop(below + 5 + (save ? 23 : 0) + 4, f1)}px`;
				scene.dirty = true;
			},
			tick(now) {
				if (reduce.matches) {
					logo.style.transform = "";
					logo.style.opacity = "";
					return;
				}
				// the logo bobs and flickers exactly as the menu's does (same clock and formula)
				logo.style.transform = `translateY(${Math.round(Math.sin(now / 600) * 2) * scene.k}px)`;
				logo.style.opacity = String(0.85 + 0.15 * Math.abs(Math.sin(now / 90 + Math.sin(now / 700) * 3)));
			},
			/** Once a frame (from frame()), never from the scroll event: no layout reads, no writes when nothing moved. */
			scroll() {
				const y = wantY;
				if (y === lastY) return;
				lastY = y;
				const p = Math.min(1, y / heroH);
				if (p >= 1 && !scene.visible) { setBar(true); return; }
				scene.parallax(reduce.matches ? 0 : p);
				ui.style.transform = reduce.matches || touch.matches ? "" : `translateY(${Math.round(y * 0.38)}px)`;
				ui.style.opacity = String(Math.max(0, 1 - p * 1.5));
				setBar(y > heroH - 90);
			},
		};
		rows.forEach((r, i) => {
			r.addEventListener("mouseenter", () => select(i));
			r.addEventListener("focus", () => select(i));
		});
		// the menu's keys while it is on screen: up / down choose, left / right on the language row switch it, Enter goes
		document.addEventListener("keydown", (e) => {
			if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || $("#lightbox").open) return;
			if (scrollY > heroEl.offsetHeight * 0.4) return;
			const a = document.activeElement;
			if (a && a !== document.body && !menu.contains(a)) return;
			const up = e.code === "ArrowUp" || e.code === "KeyW", down = e.code === "ArrowDown" || e.code === "KeyS";
			if (up && sel > 0) { select(sel - 1); rows[sel].focus({ preventScroll: true }); e.preventDefault(); }
			else if (down && sel < rows.length - 1) { select(sel + 1); rows[sel].focus({ preventScroll: true }); e.preventDefault(); }
			else if (sel === 2 && ["ArrowLeft", "ArrowRight", "KeyA", "KeyD"].includes(e.code)) { setLang(lang() === "vi" ? "en" : "vi", true); e.preventDefault(); }
			else if (["Enter", "KeyZ", "KeyE"].includes(e.code) && !menu.contains(a)) { rows[sel].click(); e.preventDefault(); }
		});
		hero.place();
		hero.scroll();
		// show the menu once it is laid out in its own face (the CSS keeps it hidden until .placed; at most 1.5 s)
		const show = () => {
			if (ui.classList.contains("placed")) return;
			ui.classList.add("placed");                    // the absolute layout first, then measure and place (same frame)
			hero.place();
		};
		Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]).then(show);
		document.fonts?.ready.then(() => hero.place());
		// only when the box really changes size: a phone's address bar sliding away fires "resize" all through a scroll,
		// and the hero (100svh) does not change with it
		let boxW = heroEl.clientWidth, boxH = heroEl.clientHeight;
		new ResizeObserver(() => {
			const w = heroEl.clientWidth, h = heroEl.clientHeight;
			if (w === boxW && h === boxH) return;
			boxW = w;
			boxH = h;
			hero.place();
		}).observe(heroEl);
	}

	// the same scene closes the page, its strips sliding apart as it comes into view
	let outro = null;
	if (S && $("#outro-scene")) {
		outro = new Scene($("#outro-scene"), (i) => [70, 52, 34, 16, 0][i] ?? 0);
		outro.clock = 37;
		let boxW = outro.box.clientWidth, boxH = outro.box.clientHeight;
		new ResizeObserver(() => {
			const w = outro.box.clientWidth, h = outro.box.clientHeight;
			if (w === boxW && h === boxH) return;
			boxW = w;
			boxH = h;
			outro.fit();
		}).observe(outro.box);
	}
	const scenes = [hero?.scene, outro].filter(Boolean);
	let last = performance.now();
	function frame(now) {
		const dt = Math.min(0.1, (now - last) / 1000);
		last = now;
		hero?.scroll();
		if (outro?.visible) {
			const r = outro.box.getBoundingClientRect();
			outro.parallax(reduce.matches ? 0 : Math.max(-1, Math.min(1, (r.top + r.height / 2 - innerHeight / 2) / innerHeight)));
		}
		for (const sc of scenes) {
			if (!sc.visible || document.hidden) continue;
			if (!reduce.matches) { sc.clock += dt; sc.dirty = true; }
			if (sc.dirty) sc.draw();
		}
		if (hero?.scene.visible) hero.tick(now);
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);

	// ------------------------------------------------------------------ the LED sign: two copies of the line, one loop
	$$(".led-run").forEach((r) => r.parentElement.append(Object.assign(r.cloneNode(true), { ariaHidden: "true" })));

	// ------------------------------------------------------------------ reveal on scroll
	const io = new IntersectionObserver((list) => {
		for (const e of list) {
			if (!e.isIntersecting) continue;
			e.target.classList.add("in");
			io.unobserve(e.target);
		}
	}, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
	$$(".reveal").forEach((el) => io.observe(el));

	// ------------------------------------------------------------------ a day: one street corner by the hour
	const range = $("#day-range"), clockEl = $("#day-clock");
	const dayImgs = $$("#day-frame img"), dayCaps = $$(".day-cap p"), dayBtns = $$("#day-stops button");
	const stops = dayBtns.map((b) => Number(b.dataset.min));
	let stop = -1, auto = !reduce.matches, glide = 0;
	function dayClock() {
		if (!range) return;
		clockEl.textContent = `${dayShort(0)} · ${hhmm(Number(range.value) / 60)}`;
	}
	function showMinute(m) {
		range.value = String(Math.round(m));
		dayClock();
		let best = 0;
		stops.forEach((v, i) => { if (Math.abs(v - m) < Math.abs(stops[best] - m)) best = i; });
		if (best === stop) return;
		stop = best;
		dayImgs.forEach((im) => {
			if (Number(im.dataset.stop) === best) im.loading = "eager";
			im.classList.toggle("on", Number(im.dataset.stop) === best);
		});
		dayCaps.forEach((p) => p.classList.toggle("on", Number(p.dataset.stop) === best));
		dayBtns.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.stop) === best)));
	}
	/** Slide the clock to minute `to`: the thumb glides, the minutes count, the street changes on the way. */
	function slideTo(to, ms = 1100) {
		const from = Number(range.value), t0 = performance.now(), id = ++glide;
		if (reduce.matches) return showMinute(to);
		const step = (now) => {
			if (id !== glide) return;
			const t = Math.min(1, (now - t0) / ms), e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
			showMinute(from + (to - from) * e);
			if (t < 1) requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	}
	if (range) {
		showMinute(stops[0]);
		range.addEventListener("input", () => { auto = false; glide++; showMinute(Number(range.value)); });
		dayBtns.forEach((b, i) => b.addEventListener("click", () => { auto = false; slideTo(stops[i]); }));
		let dayVisible = false;
		new IntersectionObserver(([e]) => { dayVisible = e.isIntersecting; }, { threshold: 0.45 }).observe($("#daybox"));
		setInterval(() => {
			if (!auto || !dayVisible || document.hidden) return;
			const next = (stop + 1) % stops.length;
			if (next === 0) { glide++; showMinute(stops[0]); } else slideTo(stops[next]);
		}, 4600);
	}

	// ------------------------------------------------------------------ tabs (districts, controls)
	function tabs(buttons, panelOf) {
		const pick = (b) => {
			buttons.forEach((x) => {
				x.setAttribute("aria-selected", String(x === b));
				x.tabIndex = x === b ? 0 : -1;
				panelOf(x).hidden = x !== b;
			});
		};
		buttons.forEach((b, i) => {
			b.addEventListener("click", () => pick(b));
			b.addEventListener("keydown", (e) => {
				const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
				if (!d) return;
				const n = buttons[(i + d + buttons.length) % buttons.length];
				pick(n);
				n.focus();
				e.preventDefault();
			});
		});
		pick(buttons.find((b) => b.getAttribute("aria-selected") === "true") ?? buttons[0]);
	}
	const distBtns = $$("#dist [role=tab]");
	if (distBtns.length) tabs(distBtns, (b) => $(`.dist-panel[data-d="${b.dataset.d}"]`));
	const ctlBtns = $$(".ctl-tabs [role=tab]");
	if (ctlBtns.length) tabs(ctlBtns, (b) => $(`[data-ctl-panel="${b.dataset.ctl}"]`));
	if (matchMedia("(pointer: coarse)").matches && ctlBtns[1]) ctlBtns[1].click();     // on a phone, show touch first

	// ------------------------------------------------------------------ the lightbox
	const dlg = $("#lightbox"), dimg = $("#lightbox-img");
	$$("[data-zoom]").forEach((b) => b.addEventListener("click", () => {
		const im = b.querySelector("img");
		dimg.src = im.currentSrc || im.src;
		dimg.alt = im.alt;
		dlg.showModal();
	}));
	dlg?.addEventListener("click", (e) => { if (e.target === dlg || e.target === dimg) dlg.close(); });

	// ------------------------------------------------------------------ share the link (to open it on a phone)
	$("#share")?.addEventListener("click", async (e) => {
		const url = new URL("play/", location.href).href, b = e.currentTarget;
		try {
			if (navigator.share) await navigator.share({ title: "SaiGon 20XX", url });
			else {
				await navigator.clipboard.writeText(url);
				const was = b.innerHTML;
				b.textContent = lang() === "vi" ? "Đã chép link" : "Link copied";
				setTimeout(() => { b.innerHTML = was; }, 1800);
			}
		} catch { /* dismissed */ }
	});

	saveLine();
})();
