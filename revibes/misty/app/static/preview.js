/* Source components run in an opaque-origin sandbox, isolated from the workspace. */
(() => {
  const token = location.hash.slice(1);
  const root = ReactDOM.createRoot(document.getElementById('root'));
  let highlighted = null, dragActive = false, lastCode = '', renderError = '';
  const send = (type, payload = {}) => parent.postMessage({misty: true, token, type, ...payload}, '*');
  function clearHighlight() { if (highlighted) highlighted.classList.remove('__misty-highlight'); highlighted = null; }
  function reportError(error) {
    renderError = error.message || String(error);
    const box = document.getElementById('render-error'); box.hidden = false;
    box.textContent = 'This component needs a small repair.\n\n' + renderError + '\n\nOpen code to edit, or choose Fix render.';
    send('render-error', {error: renderError});
  }
  class Boundary extends React.Component {
    constructor(props) { super(props); this.state = {error: false}; }
    static getDerivedStateFromError() { return {error: true}; }
    componentDidCatch(error) { reportError(error); }
    render() { return this.state.error ? null : this.props.children; }
  }
  function prepareCode(raw) {
    let code = raw.trim().replace(/^```(?:jsx|tsx|javascript|react)?\s*|\s*```$/g, '');
    // Imports from the supported libraries are supplied by the preview scope.
    code = code.replace(/^\s*import\s+(?:[\s\S]*?\s+from\s+)?['"][^'"]+['"];?\s*$/gm, '');
    let componentName = null;
    if (/export\s+default\s+function\s+\w+/.test(code)) {
      componentName = code.match(/export\s+default\s+function\s+(\w+)/)[1];
      code = code.replace(/export\s+default\s+/, '');
    } else if (/export\s+default\s+/.test(code)) {
      const match = code.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;?\s*$/);
      if (match) { componentName = match[1]; code = code.replace(match[0], ''); }
      else { code = code.replace(/export\s+default\s+/, 'const __MistyComponent = '); componentName = '__MistyComponent'; }
    }
    code = code.replace(/\bexport\s+(?=const|function|let|class)/g, '');
    if (!componentName && (/^\(?\s*\)?\s*=>/.test(code) || /^\([^]*?\)\s*=>/.test(code) || /^function\s*\(/.test(code))) {
      code = 'const __MistyComponent = ' + code.replace(/;\s*$/, '') + ';'; componentName = '__MistyComponent';
    }
    if (!componentName && code.startsWith('<')) { code = 'const __MistyComponent = () => (' + code.replace(/;\s*$/, '') + ');'; componentName = '__MistyComponent'; }
    if (!componentName) {
      const names = [...code.matchAll(/(?:function|class|const|let|var)\s+([A-Z][\w]*)/g)].map(m => m[1]);
      componentName = names.includes('App') ? 'App' : names[names.length - 1];
    }
    if (!componentName) throw new Error('Use a React component: () => { return (<div>My UI</div>); } or export default function App().');
    const compiled = Babel.transform(code, {presets: ['react', ['typescript', {allExtensions:true,isTSX:true}]], filename:'component.tsx'}).code;
    const scope = {React, useState:React.useState, useEffect:React.useEffect, useMemo:React.useMemo, useCallback:React.useCallback, useRef:React.useRef, ...LucideReact};
    return new Function(...Object.keys(scope), compiled + '\nreturn ' + componentName + ';')(...Object.values(scope));
  }
  function render(code) {
    lastCode = code; clearHighlight(); document.getElementById('render-error').hidden = true; renderError = '';
    try {
      const Component = prepareCode(code);
      root.render(React.createElement(Boundary, {key:code}, React.createElement(Component)));
      setTimeout(() => { if (!renderError) send('render-ok'); }, 180);
    } catch (error) { root.render(null); reportError(error); }
  }
  window.addEventListener('message', event => {
    if (event.source !== parent || !event.data?.misty || event.data.token !== token) return;
    if (event.data.type === 'render') render(event.data.code);
    if (event.data.type === 'drag-active') { dragActive = event.data.active; if (!dragActive) clearHighlight(); }
    if (event.data.type === 'target-hover' && dragActive) {
      const target=targetFor(document.elementFromPoint(event.data.x,event.data.y));
      if(target!==highlighted){clearHighlight();highlighted=target;highlighted?.classList.add('__misty-highlight');}
    }
    if (event.data.type === 'target-at') {
      const target=targetFor(document.elementFromPoint(event.data.x,event.data.y));clearHighlight();
      if(target)send('target-drop',{target:target.outerHTML.slice(0,24000),targetLabel:target.tagName.toLowerCase()+': '+target.textContent.trim().replace(/\s+/g,' ').slice(0,130)});
    }
  });
  function targetFor(element) {
    if (!(element instanceof Element) || element.id === 'root' || element === document.body) return document.querySelector('#root > *');
    return element.closest('button,article,li,section,header,footer,nav') || element;
  }
  document.addEventListener('dragover', event => {
    if (!dragActive) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy';
    const target = targetFor(event.target);
    if (highlighted !== target) { clearHighlight(); highlighted = target; highlighted?.classList.add('__misty-highlight'); }
  });
  document.addEventListener('dragleave', event => { if (!event.relatedTarget) clearHighlight(); });
  document.addEventListener('drop', event => {
    if (!dragActive) return;
    event.preventDefault();
    const target = highlighted || targetFor(event.target); clearHighlight();
    if (!target) return;
    send('target-drop', {target:target.outerHTML.slice(0,24000), targetLabel:target.tagName.toLowerCase() + ': ' + target.textContent.trim().replace(/\s+/g,' ').slice(0,130)});
  });
  // A click-to-place alternative makes localized blending usable without a drag device.
  document.addEventListener('mouseover', event => {
    if (!dragActive) return;
    const target = targetFor(event.target);
    if (target !== highlighted) { clearHighlight(); highlighted = target; highlighted?.classList.add('__misty-highlight'); }
  });
  document.addEventListener('click', event => {
    event.preventDefault();
    if (dragActive) {
      const target = highlighted || targetFor(event.target); clearHighlight();
      if (target) send('target-drop', {target:target.outerHTML.slice(0,24000), targetLabel:target.tagName.toLowerCase() + ': ' + target.textContent.trim().replace(/\s+/g,' ').slice(0,130)});
    } else send('select');
  }, true);
  window.addEventListener('error', event => { if (lastCode) reportError(event.error || new Error(event.message)); });
  window.addEventListener('unhandledrejection', event => { if (lastCode) reportError(event.reason || new Error('Component error')); });
  send('ready');
})();
