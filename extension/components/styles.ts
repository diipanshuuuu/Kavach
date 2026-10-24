// Styles for the Shadow DOM UI. Follows the page's light/dark preference.

export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif; }

.overlay, .toast, .pill {
  --bg: #ffffff; --fg: #0f172a; --muted: #64748b; --line: #e2e8f0; --soft: #f8fafc;
  --brand: #1e3a8a; --brand-fg: #ffffff; --danger: #b91c1c;
}
@media (prefers-color-scheme: dark) {
  .overlay, .toast, .pill {
    --bg: #0f172a; --fg: #e2e8f0; --muted: #94a3b8; --line: #1e293b; --soft: #111c33;
    --brand: #3b82f6; --brand-fg: #0b1220; --danger: #f87171;
  }
}

.overlay {
  position: fixed; inset: 0; pointer-events: auto; display: grid; place-items: center;
  background: rgba(15, 23, 42, .45); padding: 16px; outline: none;
  animation: fade .12s ease-out;
}
@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
.card {
  width: min(760px, 100%); max-height: min(86vh, 900px); display: flex; flex-direction: column;
  background: var(--bg); color: var(--fg); border-radius: 14px; border: 1px solid var(--line);
  box-shadow: 0 24px 60px rgba(0,0,0,.28);
}
.head { display: flex; gap: 12px; align-items: center; padding: 16px 18px 12px; border-bottom: 1px solid var(--line); }
.logo { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; background: var(--brand); color: var(--brand-fg); flex: none; }
.title { font-size: 16px; font-weight: 650; line-height: 1.3; }
.subtitle { font-size: 13px; color: var(--muted); margin-top: 2px; }
.body { padding: 14px 18px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
.footer { display: flex; gap: 8px; align-items: center; padding: 12px 18px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.footer .left { margin-right: auto; display: flex; gap: 8px; }

.legend { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 600;
  padding: 2px 8px; border-radius: 999px; color: var(--c);
  background: color-mix(in srgb, var(--c) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--c) 35%, transparent); white-space: nowrap;
}

.preview {
  white-space: pre-wrap; word-break: break-word; font-size: 14px; line-height: 1.7;
  background: var(--soft); border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px;
  max-height: 46vh; overflow: auto;
}
.hl {
  color: inherit; cursor: pointer; border-radius: 4px; padding: 1px 2px;
  background: color-mix(in srgb, var(--c) 22%, transparent);
  box-shadow: inset 0 -2px 0 var(--c);
}
.hl.off { background: transparent; box-shadow: inset 0 -1px 0 var(--muted); text-decoration: line-through; text-decoration-color: var(--muted); }
.meta, .note { font-size: 12px; color: var(--muted); margin: 0; }

.w { cursor: pointer; border-radius: 3px; }
.w:hover { background: color-mix(in srgb, #be123c 12%, transparent); }
.w.hid { background: #be123c; color: #fff; box-shadow: inset 0 -2px 0 #881337; }
.hide-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.hide-input {
  flex: 1 1 220px; min-width: 0; font-size: 13px; padding: 7px 10px; border-radius: 8px;
  border: 1px solid var(--line); background: var(--soft); color: var(--fg); outline: none;
}
.hide-input:focus { border-color: var(--brand); }
.remember { font-size: 12px; color: var(--muted); display: flex; align-items: center; gap: 4px; cursor: pointer; }
.chip.removable { cursor: pointer; }
.notice { font-size: 12px; line-height: 1.5; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, #ca8a04 12%, transparent); border: 1px solid color-mix(in srgb, #ca8a04 35%, transparent); }
.frame.drawable { cursor: crosshair; touch-action: none; user-select: none; }
.box.manual { border: 2px dashed #be123c; background: repeating-linear-gradient(45deg, rgba(190,18,60,.35) 0 6px, rgba(190,18,60,.15) 6px 12px); }

.pages { display: flex; flex-direction: column; gap: 16px; }
.page-label { font-size: 12px; font-weight: 600; color: var(--muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: .04em; }
.frame { position: relative; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; line-height: 0; background: #fff; }
.frame img { width: 100%; height: auto; display: block; }
.box { position: absolute; cursor: pointer; border: 2px solid var(--c); background: color-mix(in srgb, var(--c) 30%, transparent); border-radius: 3px; }
.box.off { background: transparent; border-style: dashed; opacity: .55; }
.rows { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.row { display: grid; grid-template-columns: auto auto 1fr auto; gap: 8px; align-items: center; font-size: 13px; padding: 5px 6px; border-radius: 6px; cursor: pointer; }
.row:hover { background: var(--soft); }
.row.off .val { text-decoration: line-through; color: var(--muted); }
.row .val { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row .loc { font-size: 12px; color: var(--muted); white-space: nowrap; }

.btn { font-size: 14px; font-weight: 600; border-radius: 9px; padding: 8px 14px; cursor: pointer; border: 1px solid transparent; }
.btn.primary { background: var(--brand); color: var(--brand-fg); }
.btn.ghost { background: transparent; color: var(--fg); border-color: var(--line); }
.btn.danger { background: transparent; color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
.btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

.spinner { width: 34px; height: 34px; margin: 18px auto; border-radius: 50%; border: 3px solid var(--line); border-top-color: var(--brand); animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg) } }

.toast {
  position: fixed; right: 16px; bottom: 16px; max-width: min(420px, calc(100vw - 32px)); pointer-events: auto;
  display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 12px;
  background: var(--bg); color: var(--fg); border: 1px solid var(--line); box-shadow: 0 12px 30px rgba(0,0,0,.2); font-size: 13px;
}
.tlogo { color: var(--brand); display: grid; }
.toast .btn, .pill .btn { padding: 5px 10px; font-size: 12px; }
.pill {
  position: fixed; left: 50%; top: 12px; transform: translateX(-50%); pointer-events: auto;
  display: flex; gap: 8px; align-items: center; padding: 6px 8px 6px 12px; border-radius: 999px;
  background: var(--bg); color: var(--fg); border: 1px solid #16a34a; box-shadow: 0 8px 24px rgba(0,0,0,.15);
  font-size: 13px; font-weight: 600; max-width: calc(100vw - 32px);
}
.pill .tlogo { color: #16a34a; }

@media (max-width: 560px) {
  .row { grid-template-columns: auto auto 1fr; }
  .row .loc { display: none; }
  .footer .btn { flex: 1 1 auto; }
}
`;
