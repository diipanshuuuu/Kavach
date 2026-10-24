// Styles for the Shadow DOM UI. Follows the page's light/dark preference.

export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif; }

.overlay, .toast, .pill {
  --bg: #ffffff; --fg: #0f172a; --muted: #64748b; --line: #e5e7eb; --soft: #f8fafc; --soft2: #f1f5f9;
  --brand: #4338ca; --brand2: #7c3aed; --brand-fg: #ffffff; --ok: #059669; --danger: #b91c1c;
  --shadow: 0 30px 80px -20px rgba(15, 23, 42, .45), 0 0 0 1px rgba(15, 23, 42, .04);
}
@media (prefers-color-scheme: dark) {
  .overlay, .toast, .pill {
    --bg: #0b1120; --fg: #e2e8f0; --muted: #94a3b8; --line: #1e293b; --soft: #0f172a; --soft2: #131c31;
    --brand: #6366f1; --brand2: #a78bfa; --brand-fg: #ffffff; --ok: #34d399; --danger: #f87171;
    --shadow: 0 30px 80px -20px rgba(0, 0, 0, .7), 0 0 0 1px rgba(255, 255, 255, .06);
  }
}

/* ---------- card shell ---------- */
.overlay {
  position: fixed; inset: 0; pointer-events: auto; display: grid; place-items: center;
  background: rgba(15, 23, 42, .38); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  padding: 16px; outline: none; animation: fade .16s ease-out;
}
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes rise { from { opacity: 0; transform: translateY(14px) scale(.98) } to { opacity: 1; transform: none } }
.card {
  width: min(780px, 100%); max-height: min(88vh, 920px); display: flex; flex-direction: column;
  background: var(--bg); color: var(--fg); border-radius: 18px; overflow: hidden;
  box-shadow: var(--shadow); animation: rise .2s cubic-bezier(.2, .8, .2, 1);
}
.head {
  position: relative; display: flex; gap: 14px; align-items: center; padding: 18px 20px;
  background: linear-gradient(120deg, var(--brand), var(--brand2)); color: #fff;
}
.head::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(600px 120px at 100% 0%, rgba(255,255,255,.18), transparent 60%);
}
.logo { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: rgba(255,255,255,.18); color: #fff; flex: none; box-shadow: inset 0 0 0 1px rgba(255,255,255,.25); }
.titles { flex: 1; min-width: 0; }
.title { font-size: 17px; font-weight: 700; line-height: 1.3; letter-spacing: -.01em; }
.subtitle { font-size: 13px; opacity: .85; margin-top: 2px; }
.badge {
  display: inline-flex; align-items: center; gap: 6px; flex: none; font-size: 12px; font-weight: 600;
  padding: 5px 10px; border-radius: 999px; background: rgba(255,255,255,.16); box-shadow: inset 0 0 0 1px rgba(255,255,255,.28);
}
.badge .dot { width: 7px; height: 7px; border-radius: 50%; background: #6ee7b7; box-shadow: 0 0 0 3px rgba(110,231,183,.25); }
.badge.offline .dot { background: #fcd34d; box-shadow: 0 0 0 3px rgba(252,211,77,.25); }
.x {
  flex: none; width: 32px; height: 32px; border-radius: 10px; border: 0; cursor: pointer; z-index: 1;
  background: rgba(255,255,255,.14); color: #fff; font-size: 18px; line-height: 1; display: grid; place-items: center;
}
.x:hover { background: rgba(255,255,255,.26); }
.body { padding: 16px 20px; overflow: auto; display: flex; flex-direction: column; gap: 14px; }
.footer { display: flex; gap: 8px; align-items: center; padding: 14px 20px; border-top: 1px solid var(--line); flex-wrap: wrap; background: var(--soft); }
.footer .left { margin-right: auto; display: flex; gap: 10px; align-items: center; }
.keys { font-size: 12px; color: var(--muted); }
kbd { font: 600 11px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 1px 6px; border-radius: 5px; border: 1px solid var(--line); border-bottom-width: 2px; background: var(--bg); color: var(--fg); }

/* ---------- chips / legend ---------- */
.legend { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600;
  padding: 4px 10px; border-radius: 999px; color: var(--c);
  background: color-mix(in srgb, var(--c) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--c) 28%, transparent); white-space: nowrap;
}
.chip::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: var(--c); }
.chip.removable { cursor: pointer; }
.chip.removable:hover { background: color-mix(in srgb, var(--c) 18%, transparent); }

/* ---------- tabs ---------- */
.tabs { display: inline-flex; gap: 4px; padding: 4px; border-radius: 12px; background: var(--soft2); align-self: flex-start; }
.tab { font-size: 13px; font-weight: 600; padding: 6px 12px; border-radius: 9px; border: 0; cursor: pointer; background: transparent; color: var(--muted); }
.tab.on { background: var(--bg); color: var(--fg); box-shadow: 0 1px 3px rgba(15,23,42,.12); }

/* ---------- text preview ---------- */
.preview {
  white-space: pre-wrap; word-break: break-word; font-size: 14.5px; line-height: 1.85;
  background: var(--soft); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px;
  max-height: 44vh; overflow: auto;
}
.hl {
  position: relative; color: inherit; cursor: pointer; border-radius: 6px; padding: 2px 4px; margin: 0 1px;
  background: color-mix(in srgb, var(--c) 16%, transparent);
  box-shadow: inset 0 -2px 0 var(--c); transition: background .12s;
}
.hl:hover { background: color-mix(in srgb, var(--c) 26%, transparent); }
.hl:hover::after {
  content: attr(data-label); position: absolute; left: 0; bottom: calc(100% + 4px); z-index: 2;
  font-size: 11px; font-weight: 700; line-height: 1; padding: 4px 7px; border-radius: 6px; white-space: nowrap;
  background: var(--c); color: #fff; pointer-events: none;
}
.hl.off { background: transparent; box-shadow: inset 0 -1px 0 var(--muted); text-decoration: line-through; text-decoration-color: var(--muted); }
.w { cursor: pointer; border-radius: 4px; transition: background .1s; }
.w:hover { background: color-mix(in srgb, #e11d48 12%, transparent); }
.w.hid { background: #e11d48; color: #fff; padding: 1px 3px; box-shadow: inset 0 -2px 0 #9f1239; }
.tok {
  font: 600 12.5px ui-monospace, SFMono-Regular, Menlo, monospace; padding: 2px 6px; border-radius: 6px; white-space: nowrap;
  color: var(--c); background: color-mix(in srgb, var(--c) 12%, transparent); border: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
}
.meta, .note { font-size: 12px; color: var(--muted); margin: 0; }
.meta { display: flex; align-items: center; gap: 6px; }
.meta::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--ok); }

/* ---------- hide box ---------- */
.hide-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.hide-input {
  flex: 1 1 240px; min-width: 0; font-size: 13.5px; padding: 9px 12px; border-radius: 10px;
  border: 1px solid var(--line); background: var(--bg); color: var(--fg); outline: none; transition: border-color .12s, box-shadow .12s;
}
.hide-input:focus { border-color: var(--brand); box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent); }
.remember { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 5px; cursor: pointer; }
.remember input { accent-color: var(--brand); }
.notice { font-size: 12.5px; line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, #d97706 10%, transparent); border: 1px solid color-mix(in srgb, #d97706 30%, transparent); }

/* ---------- file review ---------- */
.pages { display: flex; flex-direction: column; gap: 14px; }
.page { border: 1px solid var(--line); border-radius: 14px; padding: 12px; background: var(--soft); }
.page-label { display: inline-block; font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: .06em; }
.frame { position: relative; border-radius: 10px; overflow: hidden; line-height: 0; background: #fff; box-shadow: 0 1px 2px rgba(15,23,42,.08), 0 0 0 1px var(--line); }
.frame img { width: 100%; height: auto; display: block; }
.frame.drawable { cursor: crosshair; touch-action: none; user-select: none; }
.box { position: absolute; cursor: pointer; border: 2px solid var(--c); background: color-mix(in srgb, var(--c) 26%, transparent); border-radius: 4px; transition: background .12s; }
.box:hover { background: color-mix(in srgb, var(--c) 40%, transparent); }
.box.off { background: transparent; border-style: dashed; opacity: .5; }
.box.manual { border: 2px dashed #e11d48; background: repeating-linear-gradient(45deg, rgba(225,29,72,.32) 0 6px, rgba(225,29,72,.12) 6px 12px); }
.rows { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; }
.row { display: grid; grid-template-columns: auto auto 1fr auto; gap: 10px; align-items: center; font-size: 13px; padding: 7px 8px; border-radius: 8px; cursor: pointer; }
.row:hover { background: var(--bg); }
.row input { accent-color: var(--brand); width: 15px; height: 15px; }
.row.off .val { text-decoration: line-through; color: var(--muted); }
.row .val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .loc { font-size: 12px; color: var(--muted); white-space: nowrap; }

/* ---------- buttons ---------- */
.btn { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 600; border-radius: 11px; padding: 9px 15px; cursor: pointer; border: 1px solid transparent; transition: transform .06s, filter .12s, background .12s; }
.btn:active { transform: translateY(1px); }
.btn.primary { background: linear-gradient(120deg, var(--brand), var(--brand2)); color: var(--brand-fg); box-shadow: 0 6px 16px -6px color-mix(in srgb, var(--brand) 70%, transparent); }
.btn.primary:hover { filter: brightness(1.07); }
.btn.ghost { background: var(--bg); color: var(--fg); border-color: var(--line); }
.btn.ghost:hover { background: var(--soft2); }
.btn.danger { background: transparent; color: var(--danger); border-color: transparent; }
.btn.danger:hover { background: color-mix(in srgb, var(--danger) 8%, transparent); }
.btn:focus-visible, .tab:focus-visible, .x:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

.spinner { width: 38px; height: 38px; margin: 22px auto; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--brand); animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg) } }

/* ---------- toast + pill ---------- */
.toast {
  position: fixed; right: 16px; bottom: 16px; max-width: min(440px, calc(100vw - 32px)); pointer-events: auto;
  display: flex; gap: 10px; align-items: center; padding: 12px 14px; border-radius: 14px;
  background: var(--bg); color: var(--fg); box-shadow: var(--shadow); font-size: 13px; animation: rise .2s ease-out;
}
.tlogo { color: var(--brand); display: grid; flex: none; }
.toast .btn, .pill .btn { padding: 6px 11px; font-size: 12px; border-radius: 9px; }
.pill {
  position: fixed; left: 50%; top: 14px; transform: translateX(-50%); pointer-events: auto;
  display: flex; gap: 10px; align-items: center; padding: 6px 6px 6px 14px; border-radius: 999px;
  background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  color: var(--fg); box-shadow: var(--shadow), inset 0 0 0 1px color-mix(in srgb, var(--ok) 45%, transparent);
  font-size: 13px; font-weight: 600; max-width: calc(100vw - 32px);
}
.pill .tlogo { color: var(--ok); }

@media (max-width: 560px) {
  .badge { display: none; }
  .row { grid-template-columns: auto auto 1fr; }
  .row .loc { display: none; }
  .footer .btn { flex: 1 1 auto; justify-content: center; }
  .keys { display: none; }
}
`;
