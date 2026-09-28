/**
 * One stylesheet, inlined into the output. Colours are declared once as tokens on `:root` and
 * only redefined for dark, so the page holds up whether the reader's browser is set to light,
 * dark, or has made no choice at all.
 */
export const STYLE = `
  :root {
    --paper:#f4f6f9; --surface:#fff; --ink:#16202c; --muted:#5a6875; --line:#d8dee6;
    --accent:#0e7c86; --accent-soft:#dceef0; --warn:#9a6a15; --warn-soft:#f6ecd8;
    --mono:ui-monospace,"SFMono-Regular","Cascadia Mono",Menlo,Consolas,monospace;
    --sans:ui-sans-serif,system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --paper:#0f151b; --surface:#161e26; --ink:#e4eaf0; --muted:#8b9aa8; --line:#26313c;
      --accent:#3fb6c0; --accent-soft:#10333a; --warn:#d9a441; --warn-soft:#33280f;
    }
  }
  :root[data-theme="dark"] {
    --paper:#0f151b; --surface:#161e26; --ink:#e4eaf0; --muted:#8b9aa8; --line:#26313c;
    --accent:#3fb6c0; --accent-soft:#10333a; --warn:#d9a441; --warn-soft:#33280f;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);
    line-height:1.5;height:100vh;overflow:hidden}
  .viewer{display:grid;height:100vh;background:var(--surface);
    grid-template-areas:"rail" "canvas";grid-template-rows:auto minmax(0,1fr)}
  @media(min-width:900px){
    .viewer{grid-template-areas:"rail canvas detail";
      grid-template-columns:auto minmax(0,1fr) auto;grid-template-rows:100vh}
  }
  .rail-title{font-family:var(--mono);font-size:13px;margin:2px 0 2px;color:var(--ink)}
  .rail-counts{font-family:var(--mono);font-size:10.5px;margin:0 0 6px;color:var(--muted)}
  .rail-tools{display:flex;gap:6px}
  .rail-tools button{flex:1;text-align:center}
  .proposals-open{border-left:3px solid var(--accent) !important;color:var(--accent)}
  .missing{position:fixed;left:0;bottom:0;margin:0;padding:6px 12px;background:var(--warn-soft);
    color:var(--warn);font-size:12px;z-index:5}
  .rail{grid-area:rail;display:flex;gap:6px;padding:10px;overflow:auto;
    border-bottom:1px solid var(--line);background:var(--paper);align-items:center}
  @media(min-width:900px){
    .rail{flex-direction:column;align-items:stretch;border-bottom:none;
      border-right:1px solid var(--line);max-width:215px;min-width:160px}
  }
  .rail button{font-family:var(--mono);font-size:11.5px;text-align:left;white-space:nowrap;
    background:var(--surface);color:var(--ink);border:1px solid var(--line);border-radius:5px;
    padding:5px 9px;cursor:pointer}
  .rail button:hover{border-color:var(--accent);color:var(--accent)}
  .rail button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .rail .tool{color:var(--muted)}
  .rail .external{border-left:3px solid var(--warn)}
  .rail .store{border-left:3px solid var(--accent)}
  .rail .internal{border-left:3px solid var(--muted)}
  .canvas{grid-area:canvas;overflow:hidden;position:relative;min-height:0;cursor:grab;
    touch-action:none;user-select:none}
  .canvas:active{cursor:grabbing}
  .canvas svg{display:block;width:100%;height:100%}
  .detail{grid-area:detail;border-top:1px solid var(--line);padding:14px 16px;overflow:auto;
    background:var(--paper);font-size:13px}
  @media(min-width:900px){
    .detail{border-top:none;border-left:1px solid var(--line);width:340px;max-width:46vw}
    .detail.wide{width:min(720px,52vw)}
  }
  .detail[hidden]{display:none}
  .detail .link{background:none;border:none;padding:0;font:inherit;color:var(--accent);
    cursor:pointer;text-decoration:underline}
  .detail > header{display:flex;justify-content:space-between;align-items:baseline;gap:10px}
  .detail h4{font-family:var(--mono);font-size:14px;margin:0}
  .detail > header button{background:none;border:none;color:var(--muted);font-size:20px;
    line-height:1;cursor:pointer;padding:0 2px}
  .fields{list-style:none;margin:12px 0 0;padding:0;display:flex;flex-direction:column;gap:2px}
  .fields li{padding:8px 0;border-bottom:1px solid var(--line)}
  .fields li:last-child{border-bottom:none}
  .fh{display:flex;justify-content:space-between;gap:10px;align-items:baseline}
  .fh .fn{font-family:var(--mono);font-size:13px}
  .fh .ft{font-family:var(--mono);font-size:11px;color:var(--muted)}
  .fm{margin-top:3px}
  .fields .why{margin:5px 0 0;font-size:12.5px;color:var(--ink)}
  .fields .used{margin:3px 0 0;font-size:11.5px;color:var(--muted)}
  .fields .used code{font-family:var(--mono);color:var(--accent)}
  .fields .unjustified{color:var(--warn);font-style:italic}
  .detail > table{border-collapse:collapse;width:100%;margin-top:10px}
  .detail > table td{padding:3px 8px 3px 0;border-bottom:1px solid var(--line);vertical-align:top}
  .detail > table tr:last-child td{border-bottom:none}
  svg{display:block}
  .entity rect{fill:var(--surface);stroke:var(--line)}
  .entity .rule{stroke:var(--line)}
  .entity .en{font-family:var(--mono);font-size:12px;font-weight:600;fill:var(--ink)}
  .entity text{font-family:var(--mono);font-size:11px;fill:var(--ink)}
  .entity .k{fill:var(--accent);font-size:9.5px;letter-spacing:.04em}
  .entity .t{fill:var(--muted);font-size:10.5px}
  .entity.stub rect{fill:none;stroke-dasharray:3 3}
  .entity.stub .en{fill:var(--muted)}
  .rel path{stroke:var(--line);stroke-width:1.3}
  .rel line,.rel circle{stroke:var(--line);stroke-width:1.3}
  .rel.strong path,.rel.strong line,.rel.strong circle{stroke:var(--accent)}
  .rel circle{fill:var(--surface)}
  .lineage{margin:4px 0 0;font-size:12.5px;color:var(--muted)}
  .fn{font-family:var(--mono)}
  .ft{font-family:var(--mono);color:var(--muted);font-size:12px;white-space:nowrap}
  .tag{display:inline-block;font-family:var(--mono);font-size:9.5px;letter-spacing:.06em;
    text-transform:uppercase;padding:1px 5px;border-radius:3px;margin-right:4px}
  .tag.key{background:var(--accent-soft);color:var(--accent)}
  .tag.req{border:1px solid var(--line);color:var(--muted)}
  .tag.doc{background:var(--warn-soft);color:var(--warn)}
  .inputs{display:flex;flex-wrap:wrap;gap:6px}
  .input{font-family:var(--mono);font-size:11.5px;border:1px solid var(--line);border-radius:4px;
    padding:2px 7px;display:inline-flex;gap:5px;align-items:baseline}
  .input code{color:var(--ink)}
  .input i{color:var(--muted);font-style:normal}
  .input em{color:var(--muted);font-style:normal;font-size:11px}
  .proposals .group-head p{margin:0;color:var(--muted);max-width:70ch}
  .detail .proposals h2{font-size:15px;font-family:var(--mono);margin:0 0 4px}
  .proposals .group-head p{margin:0;color:var(--muted);max-width:70ch}
  .proposal{background:var(--surface);border:1px solid var(--line);border-radius:6px;
    padding:10px 12px;margin-top:10px}
  .proposal header{display:flex;gap:10px;align-items:baseline}
  .proposal h3{font-family:var(--mono);font-size:15px;margin:0}
  .pid{font-family:var(--mono);font-size:11px;letter-spacing:.06em;background:var(--accent-soft);
    color:var(--accent);border-radius:4px;padding:2px 7px;flex:none}
  .proposal .why{margin:8px 0 0;color:var(--muted);font-size:13.5px;max-width:74ch}
  .proposal .cost{margin:6px 0 0;color:var(--warn);font-size:13px;max-width:74ch}
  .proposal .counts{margin:10px 0 6px;font-family:var(--mono);font-size:11px;
    letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
  .d-table{border-collapse:collapse;width:100%;font-size:13px}
  .d-table td{padding:3px 8px 3px 0;border-bottom:1px solid var(--line);vertical-align:top}
  .d-table tr:last-child td{border-bottom:none}
  .d-table .mark{font-family:var(--mono);width:1.4em;text-align:center}
  .d-table .shape{font-family:var(--mono);font-size:12px}
  .d-head{margin:6px 0;font-size:13.5px}
  .d-head b{font-family:var(--mono);margin-right:6px}
  .d-head i{font-style:normal;color:var(--muted)}
  .d-summary{margin:4px 0 8px;font-size:13px}
  .d-added .mark,.d-head.d-added b{color:var(--accent)}
  .d-removed .mark,.d-head.d-removed b{color:var(--warn)}
  .d-removed .fn{text-decoration:line-through;text-decoration-color:var(--muted)}
  .was{color:var(--muted);text-decoration:line-through;text-decoration-color:var(--muted)}
  .arrow{color:var(--muted);margin:0 6px}
  .now{color:var(--ink)}
  .none{color:var(--muted);font-size:13px}
  .missing{color:var(--warn);font-size:13px}
`;
