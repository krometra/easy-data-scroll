const CSS = `
.eds{position:relative;overflow:hidden;contain:strict;--eds-row:64px}
.eds-viewport{position:absolute;inset:0;display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto;overflow-anchor:none;overscroll-behavior:contain;scrollbar-gutter:stable;outline:none}
.eds[data-origin=bottom]>.eds-viewport{flex-direction:column-reverse}
.eds-content{flex:none;display:flex;flex-direction:column;box-sizing:border-box;width:100%}
.eds-spacer{flex:none}
.eds-item{flex:none;position:relative;contain:size layout style}
.eds-host{display:flow-root}
.eds-gap{flex:none;position:relative;contain:strict;background:linear-gradient(transparent var(--eds-gap-pad,8px),var(--eds-gap-color,rgba(127,127,127,.13)) var(--eds-gap-pad,8px) calc(100% - var(--eds-gap-pad,8px)),transparent calc(100% - var(--eds-gap-pad,8px))) var(--eds-gap-inset,16px) 0/calc(100% - 2 * var(--eds-gap-inset,16px)) var(--eds-row) repeat-y;animation:eds-pulse 1.1s ease-in-out infinite alternate}
@keyframes eds-pulse{from{opacity:.55}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.eds-gap{animation:none}}
.eds-measure{position:absolute;top:0;left:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;contain:strict}
.eds-measure>.eds-item{height:auto!important}
.eds-loader{position:absolute;left:50%;z-index:1;display:flex;pointer-events:none;opacity:0;transform:translate(-50%,0) scale(.8);transition:opacity .18s,transform .18s}
.eds-loader[data-side=before]{top:var(--eds-loader-offset,10px)}
.eds-loader[data-side=after]{bottom:var(--eds-loader-offset,10px)}
.eds-loader[data-active]{opacity:1;transform:translate(-50%,0) scale(1);transition-delay:.12s}
.eds-spinner{box-sizing:border-box;width:30px;height:30px;padding:6px;border-radius:50%;background:var(--eds-loader-bg,rgba(127,127,127,.18));backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.eds-spinner::after{content:"";display:block;width:100%;height:100%;box-sizing:border-box;border-radius:50%;border:2px solid var(--eds-loader-color,currentColor);border-right-color:transparent;animation:eds-spin .7s linear infinite}
@keyframes eds-spin{to{transform:rotate(360deg)}}
`

const done = new WeakSet<Document>()

export function ensureStyles(doc: Document): void {
  if (done.has(doc))
    return
  done.add(doc)
  const style = doc.createElement('style')
  style.dataset.eds = ''
  style.textContent = CSS
  doc.head.prepend(style)
}
