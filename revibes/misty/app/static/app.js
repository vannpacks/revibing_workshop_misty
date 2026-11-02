/* Misty canvas and editor. No framework or build step is needed for the studio shell. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = () => crypto.randomUUID();
  const canvas = $('#canvas'), world = $('#world'), nodesEl = $('#nodes'), inspector = $('#inspector'), modal = $('#modal');
  const frames = new Map(), errors = new Map(), undoStack = [], redoStack = [];
  let state = {nodes:[], edges:[], selected:null, camera:{x:30,y:0,z:.85}};
  let tab = 'details', busy = false, panMode = false, space = false, connection = null, pendingExample = null;
  let saveTimer, editorTimer, toastTimer, loadedSaved = false;
  const storageKey = 'misty-workspace-v1';

  function snapshot() { return JSON.stringify(state); }
  function checkpoint() { undoStack.push(snapshot()); if (undoStack.length > 40) undoStack.shift(); redoStack.length = 0; updateUndo(); }
  function updateUndo() { $('#undo').disabled = !undoStack.length || busy; $('#redo').disabled = !redoStack.length || busy; }
  function save() {
    clearTimeout(saveTimer);
    $('#save-status').textContent = 'Saving…';
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(storageKey, snapshot()); $('#save-status').textContent = 'Saved in this browser'; }
      catch { $('#save-status').textContent = 'Storage full · Save workspace to keep changes'; }
    }, 350);
  }
  function toast(message, error = false, duration = 5000) {
    const el = $('#toast'); el.textContent = message; el.classList.toggle('error', error); el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, duration);
  }
  function node(id) { return state.nodes.find(n => n.id === id); }
  function selected() { return node(state.selected); }
  function changed() { render(); save(); }
  function sourceNode(sample, x = 470, y = 105) { return {id:uid(), kind:'source',title:sample.title,code:sample.code,x,y,created:Date.now(),groups:[]}; }
  function exampleNode(reference, x = 55, y = 105) { return {id:uid(),kind:'example',title:reference.title,image:reference.image,x,y,crop:null,created:Date.now()}; }
  function safeWorkspace(value) {
    if (!value || !Array.isArray(value.nodes) || !Array.isArray(value.edges) || value.nodes.length > 150) throw new Error('This file is not a Misty workspace.');
    const ids = new Set();
    for (const n of value.nodes) {
      if (!n || !['source','example'].includes(n.kind) || typeof n.id !== 'string' || ids.has(n.id)) throw new Error('Invalid node.');
      ids.add(n.id);
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y) || Math.abs(n.x) > 1e7 || Math.abs(n.y) > 1e7 || typeof n.title !== 'string') throw new Error('Invalid node position.');
      if (n.kind === 'source' && typeof n.code !== 'string') throw new Error('A source node is missing code.');
      if (n.kind === 'example' && (typeof n.image !== 'string' || !/^(data:image\/(png|jpeg|webp|svg\+xml);base64,|\/example-[\w-]+\.svg$)/.test(n.image))) throw new Error('Unsupported reference image.');
      if (n.crop && (![n.crop.x,n.crop.y,n.crop.w,n.crop.h].every(Number.isFinite) || n.crop.w <= 0 || n.crop.h <= 0)) throw new Error('Invalid crop.');
      if (n.kind === 'source') n.groups = Array.isArray(n.groups) ? n.groups.filter(g => g && typeof g.category === 'string' && Array.isArray(g.changes)) : [];
    }
    value.edges = value.edges.filter(e => e && ids.has(e.from) && ids.has(e.to));
    const c = value.camera;
    if (!c || ![c.x,c.y,c.z].every(Number.isFinite) || c.z < .15 || c.z > 2) value.camera = {x:30,y:0,z:.85};
    if (!ids.has(value.selected)) value.selected = value.nodes[0]?.id || null;
    return value;
  }
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) { state = safeWorkspace(JSON.parse(saved)); loadedSaved = true; }
  } catch { toast('The previous workspace could not be restored. You can still open a saved JSON file.', true); }
  if (!loadedSaved) {
    const reference = exampleNode(MISTY_REFERENCES[0]); const source = sourceNode(MISTY_SAMPLES.profile);
    state.nodes.push(reference, source); state.selected = source.id;
  }

  function applyCamera() {
    const c = state.camera;
    world.style.transform = `translate(${c.x}px,${c.y}px) scale(${c.z})`;
    canvas.style.backgroundSize = `${19*c.z}px ${19*c.z}px`;
    canvas.style.backgroundPosition = `${c.x}px ${c.y}px`;
    $('#zoom-label').textContent = Math.round(c.z*100) + '%';
  }
  function worldPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect(), c = state.camera;
    return {x:(clientX-rect.left-c.x)/c.z,y:(clientY-rect.top-c.y)/c.z};
  }
  function zoomTo(z, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    clientX ??= rect.left+rect.width/2; clientY ??= rect.top+rect.height/2;
    const p = worldPoint(clientX,clientY); z = Math.max(.15,Math.min(2,z));
    state.camera = {x:clientX-rect.left-p.x*z,y:clientY-rect.top-p.y*z,z}; applyCamera(); save();
  }
  function fit(ids = null) {
    const list = ids ? state.nodes.filter(n => ids.includes(n.id)) : state.nodes;
    if (!list.length) return;
    const left = Math.min(...list.map(n => n.x)), top = Math.min(...list.map(n => n.y));
    const right = Math.max(...list.map(n => n.x+($(`[data-node="${n.id}"]`)?.offsetWidth || 380)));
    const bottom = Math.max(...list.map(n => n.y+($(`[data-node="${n.id}"]`)?.offsetHeight || 750)));
    const availableW = canvas.clientWidth-100, availableH = canvas.clientHeight-160;
    const z = Math.max(.15,Math.min(1,availableW/(right-left),availableH/(bottom-top)));
    state.camera = {z,x:(canvas.clientWidth-(right-left)*z)/2-left*z,y:85-top*z}; applyCamera(); save();
  }
  function focusNode(id) { selectNode(id); requestAnimationFrame(() => fit([id])); }
  function sendFrame(id, type, data = {}) {
    const f = frames.get(id);
    if (f) f.element.contentWindow?.postMessage({misty:true,token:f.token,type,...data}, '*');
  }
  function broadcastDrag(active) { canvas.classList.toggle('placing',active);for (const [id] of frames) sendFrame(id, 'drag-active', {active}); }

  function render() {
    for (const el of $$('.node',nodesEl)) {
      if (!node(el.dataset.node)) { frames.delete(el.dataset.node); el.remove(); }
    }
    $('.blank-world', nodesEl)?.remove();
    if (!state.nodes.length) nodesEl.innerHTML = '<div class="blank-world"><h2>Every blend starts somewhere.</h2><p>Add an example and a source UI to start exploring.</p></div>';
    for (const n of state.nodes) {
      let el = $(`[data-node="${n.id}"]`,nodesEl);
      if (!el) { el = createNodeElement(n); nodesEl.append(el); }
      el.style.left = n.x+'px'; el.style.top = n.y+'px';
      el.classList.toggle('selected',n.id===state.selected);
      $('.node-title',el).textContent = n.title;
      el.setAttribute('aria-label',n.title + (n.kind==='example' ? ' example image' : ' source UI'));
      if (n.kind === 'example') updateCrop(n,el);
      else {
        const f = frames.get(n.id);
        if (f && f.lastCode !== n.code && f.ready) { f.lastCode = n.code; sendFrame(n.id,'render',{code:n.code}); }
        $('.change-count',el).textContent = n.groups?.length ? `${n.groups.filter(g=>g.enabled).length}/${n.groups.length} changes applied` : 'React + Tailwind';
      }
    }
    applyCamera(); renderConnections(); renderInspector(); updateUndo();
  }
  function createNodeElement(n) {
    const el = document.createElement('article'); el.className = `node ${n.kind}`; el.dataset.node = n.id;
    el.style.width = n.kind === 'source' ? '380px' : '340px';
    el.innerHTML = `<div class="node-header"><span class="node-kind">${n.kind==='example'?'◧ EXAMPLE':'〈/〉 SOURCE'}</span><span class="node-title">${esc(n.title)}</span><button class="node-menu" aria-label="Node actions" title="Node actions">···</button></div>`;
    if (n.kind === 'example') {
      el.insertAdjacentHTML('beforeend',`<div class="node-body"><div class="crop-stage" tabindex="0" aria-label="Drag to select a region of the example"><img class="reference-img" alt="${esc(n.title)} reference screenshot" src="${esc(n.image)}" draggable="false"><div class="crop-box" hidden></div></div><p class="crop-caption">Draw a region on the image to select a detail.</p><div class="drag-chip" draggable="true" tabindex="0" role="button" title="Drag to source or click then click a target">⠿ <span>Drag entire example into a source</span></div><div class="crop-buttons"><button data-action="clear-crop">Clear selection</button><button data-action="use-region">Click to place</button></div></div><div class="node-footer"><span>IMAGE ONLY · No code needed</span><span class="crop-size">Full screen</span></div><button class="port output" title="Connect to source for a global blend" aria-label="Connect example to source"></button>`);
      $('.reference-img',el).addEventListener('load',()=>{updateCrop(n,el);renderConnections();});
      setupCrop(n,el);
      const chip = $('.drag-chip',el);
      chip.addEventListener('dragstart',event=>{
        if (busy) { event.preventDefault(); return; }
        pendingExample = n.id; connection = null; updateConnectionMode();
        event.dataTransfer.setData('text/plain',n.id); event.dataTransfer.effectAllowed = 'copy';
        broadcastDrag(true); selectNode(n.id);
      });
      chip.addEventListener('dragend',()=>{ broadcastDrag(false); setTimeout(()=>{if(pendingExample===n.id){pendingExample=null;updateConnectionMode();}},150); });
      chip.addEventListener('click',()=>placeRegion(n.id));
      chip.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();placeRegion(n.id);}});
      $('[data-action=use-region]',el).onclick=()=>placeRegion(n.id);
      $('[data-action=clear-crop]',el).onclick=()=>{if(busy)return;checkpoint();n.crop=null;delete n.previousCrop;updateCrop(n,el);save();renderInspector();};
      $('.port.output',el).addEventListener('pointerdown',event=>startConnection(event,n.id));
    } else {
      const token = uid();
      el.insertAdjacentHTML('beforeend',`<div class="node-body"><iframe class="preview" title="${esc(n.title)} live preview" sandbox="allow-scripts" src="/preview.html#${token}"></iframe></div><div class="preview-cover"><span>Blend this source UI</span></div><div class="node-actions"><button data-action="fix" title="Repair malformed source code with the bridge">⚒ Fix render</button>${n.recipe?'<button data-action="regenerate">✧ Regenerate</button>':''}<button data-action="code">〉_ Show code</button></div><div class="node-footer"><span>${n.recipe?'BLENDED VARIATION':'WORK IN PROGRESS'}</span><button class="change-count">React + Tailwind</button></div><button class="port input" title="Connect example here" aria-label="Blend example into this source"></button>`);
      frames.set(n.id,{element:$('.preview',el),token,ready:false,lastCode:null});
      $('[data-action=code]',el).onclick=()=>{selectNode(n.id);tab='code';renderInspector();};
      $('[data-action=fix]',el).onclick=()=>repair(n.id);
      $('[data-action=regenerate]',el)?.addEventListener('click',()=>regenerate(n.id));
      $('.change-count',el).onclick=()=>{selectNode(n.id);tab='details';renderInspector();};
      $('.port.input',el).onclick=event=>{event.stopPropagation();if(connection?.from)completeConnection(n.id);else toast('Start at the connector on an example node.');};
      const framePoint=event=>{
        const frame=$('.preview',el),rect=frame.getBoundingClientRect();
        if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)return null;
        return{x:(event.clientX-rect.left)*frame.clientWidth/rect.width,y:(event.clientY-rect.top)*frame.clientHeight/rect.height};
      };
      el.addEventListener('dragover',event=>{
        if(!pendingExample)return;
        event.preventDefault();event.dataTransfer.dropEffect='copy';
        const point=framePoint(event);if(point)sendFrame(n.id,'target-hover',point);
      });
      $('.preview-cover',el).addEventListener('pointermove',event=>{
        if(pendingExample){const point=framePoint(event);if(point)sendFrame(n.id,'target-hover',point);}
      });
      $('.preview-cover',el).addEventListener('click',event=>{
        if(!pendingExample)return;event.preventDefault();event.stopPropagation();
        const point=framePoint(event);if(point)sendFrame(n.id,'target-at',point);
      });
      el.addEventListener('drop',event=>{
        if (!pendingExample) return; event.preventDefault();event.stopPropagation();
        const point=framePoint(event);
        if(point){sendFrame(n.id,'target-at',point);return;}
        const target = n.code; const label='Entire source screen';
        openBlendDialog(pendingExample,n.id,target,label); broadcastDrag(false); pendingExample=null;
      });
    }
    $('.node-header',el).addEventListener('pointerdown',event=>moveNode(event,n,el));
    el.addEventListener('pointerdown',event=>{
      if (!event.target.closest('button,input,textarea,.drag-chip,.crop-stage') && !event.target.closest('.node-header')) selectNode(n.id);
      if (connection?.from && n.kind==='source' && !event.target.closest('.node-header,button')) completeConnection(n.id);
    });
    $('.node-menu',el).onclick=event=>{event.stopPropagation();openNodeMenu(n,event);};
    return el;
  }
  function updateCrop(n,el) {
    const box = $('.crop-box',el), c=n.crop; box.hidden = !c;
    if(c){box.style.left=c.x*100+'%';box.style.top=c.y*100+'%';box.style.width=c.w*100+'%';box.style.height=c.h*100+'%';}
    $('.drag-chip span',el).textContent=c?'Drag selected region into a source':'Drag entire example into a source';
    $('.crop-size',el).textContent=c?`${Math.round(c.w*100)}% × ${Math.round(c.h*100)}% selection`:'Full screen';
  }
  function setupCrop(n,el) {
    const stage=$('.crop-stage',el);
    stage.addEventListener('pointerdown',event=>{
      if(busy || space || panMode || event.button!==0) return;
      event.preventDefault(); event.stopPropagation(); selectNode(n.id); checkpoint();
      const rect=stage.getBoundingClientRect();
      const point=e=>({x:Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height))});
      const start=point(event);n.previousCrop=n.crop?{...n.crop}:null;
      stage.setPointerCapture(event.pointerId);
      const move=e=>{const p=point(e);n.crop={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(p.x-start.x),h:Math.abs(p.y-start.y)};updateCrop(n,el);};
      const up=()=>{
        stage.removeEventListener('pointermove',move);stage.removeEventListener('pointerup',up);
        if(!n.crop || n.crop.w<.01 || n.crop.h<.01)n.crop=n.previousCrop;
        updateCrop(n,el);renderInspector();save();
      };
      stage.addEventListener('pointermove',move);stage.addEventListener('pointerup',up,{once:true});
    });
  }
  function moveNode(event,n,el) {
    if(event.target.closest('button') || event.button!==0 || busy || space || panMode)return;
    event.preventDefault();event.stopPropagation();selectNode(n.id);checkpoint();
    const start={x:event.clientX,y:event.clientY,nx:n.x,ny:n.y};
    const header=$('.node-header',el);header.setPointerCapture(event.pointerId);
    const move=e=>{n.x=start.nx+(e.clientX-start.x)/state.camera.z;n.y=start.ny+(e.clientY-start.y)/state.camera.z;el.style.left=n.x+'px';el.style.top=n.y+'px';renderConnections();};
    const up=()=>{header.removeEventListener('pointermove',move);header.removeEventListener('pointerup',up);save();};
    header.addEventListener('pointermove',move);header.addEventListener('pointerup',up,{once:true});
  }
  function renderConnections() {
    const svg=$('#connections');svg.replaceChildren();
    for(const edge of state.edges){
      const from=node(edge.from),to=node(edge.to);if(!from||!to)continue;
      const fromEl=$(`[data-node="${from.id}"]`);const x1=from.x+(fromEl?.offsetWidth||340),y1=from.y+321,x2=to.x,y2=to.y+321;
      const bend=Math.max(70,Math.abs(x2-x1)*.45);
      const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.setAttribute('d',`M${x1} ${y1} C${x1+bend} ${y1},${x2-bend} ${y2},${x2} ${y2}`);p.classList.add('connection-path');svg.append(p);
      const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x',(x1+x2)/2);label.setAttribute('y',(y1+y2)/2-10);label.setAttribute('text-anchor','middle');label.classList.add('line-label');label.textContent=edge.label||'blend';svg.append(label);
    }
    if(connection?.point){
      const n=node(connection.from);if(!n)return;
      const p=document.createElementNS('http://www.w3.org/2000/svg','path');const x=n.x+340,y=n.y+321;
      p.setAttribute('d',`M${x} ${y} C${x+80} ${y},${connection.point.x-80} ${connection.point.y},${connection.point.x} ${connection.point.y}`);p.classList.add('connection-path');svg.append(p);
    }
  }
  function updateConnectionMode() {
    canvas.classList.toggle('connecting',!!connection);
    $('#connect-button').classList.toggle('soft',!!connection);
    $('#canvas-instruction').textContent=connection?'Choose a source node to blend into · Escape to cancel':pendingExample?'Click an element inside a source preview · Escape to cancel':'Connect the dots to blend a full screen. Crop & drag to blend a detail.';
  }
  function startConnection(event,id) {
    if(busy)return;event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);connection={from:id};pendingExample=null;broadcastDrag(false);updateConnectionMode();selectNode(id);
    const startX=event.clientX,startY=event.clientY;
    const move=e=>{if(connection){connection.point=worldPoint(e.clientX,e.clientY);renderConnections();}};
    const up=e=>{
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);
      const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.source');
      if(target)completeConnection(target.dataset.node);
      else if(Math.hypot(e.clientX-startX,e.clientY-startY)>8){connection.point=null;renderConnections();}
    };
    document.addEventListener('pointermove',move);document.addEventListener('pointerup',up,{once:true});
  }
  async function completeConnection(sourceId) {
    if(!connection?.from || busy)return;
    const exampleId=connection.from;connection=null;updateConnectionMode();renderConnections();
    await blend({exampleId,sourceId,mode:'global',aspects:[],custom:'',target:'',targetLabel:''});
  }
  function placeRegion(id){if(busy)return;pendingExample=id;connection=null;broadcastDrag(true);updateConnectionMode();toast('Click the region to update inside a source preview.');}
  function selectNode(id) {
    state.selected=id;
    for(const el of $$('.node',nodesEl))el.classList.toggle('selected',el.dataset.node===id);
    if(node(id)?.kind==='example')tab='details';renderInspector();save();
  }
  function modelNote(){return '<div class="model-note"><strong>WORKSHOP REIMPLEMENTATION</strong>Codex bridge replaces GPT-4o. Original vector examples & illustrations replace stock imagery. Static, single-screen React UIs.</div>';}
  function renderInspector() {
    const n=selected();inspector.classList.toggle('code-open',tab==='code'&&n?.kind==='source');
    if(!n){inspector.innerHTML='<div class="inspector-heading"><h2>Your exploration</h2><small>MISTY</small></div><div class="inspector-content"><p class="eyebrow">A SPACE FOR POSSIBILITIES</p><h3 class="inspector-title">Bring your ideas<br>a little closer.</h3><p class="body-copy">Select an example or a source UI to explore its details. Every blend becomes a new branch on your canvas.</p></div>'+modelNote();return;}
    const heading=`<div class="inspector-heading"><h2>${n.kind==='example'?'Example details':'Design details'}</h2><small>${n.kind==='example'?'IMAGE':'REACT'}</small></div>`;
    if(n.kind==='example'){
      inspector.innerHTML=heading+`<div class="inspector-content"><p class="eyebrow">YOUR INSPIRATION</p><input class="inspector-rename" aria-label="Example name" value="${esc(n.title)}"><p class="body-copy">A screenshot, a wireframe, a sketch.<br>All it takes is a little inspiration.</p><div class="instruction-card"><strong><span class="number">01</span> Blend the whole screen</strong><p>Connect the dot on this example’s right edge to a source UI. Its content stays; a new visual direction emerges.</p></div><div class="instruction-card"><strong><span class="number">02</span> Borrow a detail</strong><p>Draw a selection on the image, then drag the selection handle into a source UI. Choose the aspects you want to bring along.</p></div><div class="inspector-actions"><button class="button soft" data-inspector="connect">Global blend</button><button class="button" data-inspector="place">Place region</button></div>${n.crop?'<button class="text-button" data-inspector="crop-undo">↶ Undo crop</button><button class="text-button" data-inspector="clear-crop">Clear selection</button>':''}<p class="body-copy" style="margin-top:20px"><span class="badge">${n.crop?'REGION SELECTED':'FULL SCREEN'}</span></p><button class="text-button" data-inspector="delete">Remove example</button></div>`+modelNote();
      $('[data-inspector=connect]',inspector).onclick=()=>{connection={from:n.id};pendingExample=null;broadcastDrag(false);updateConnectionMode();toast('Click a source node or its left connector.');};
      $('[data-inspector=place]',inspector).onclick=()=>placeRegion(n.id);
      $('[data-inspector=crop-undo]',inspector)?.addEventListener('click',()=>{checkpoint();const temp=n.crop;n.crop=n.previousCrop||null;n.previousCrop=temp;changed();});
      $('[data-inspector=clear-crop]',inspector)?.addEventListener('click',()=>{checkpoint();n.previousCrop=n.crop;n.crop=null;changed();});
      $('[data-inspector=delete]',inspector).onclick=()=>deleteNode(n.id);
    }else{
      inspector.innerHTML=heading+`<div class="inspector-tabs"><button data-tab="details" class="${tab==='details'?'active':''}">Applied changes</button><button data-tab="code" class="${tab==='code'?'active':''}">Code editor</button></div>`;
      if(tab==='code')renderEditor(n);else renderDiff(n);
      $$('[data-tab]',inspector).forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderInspector();});
    }
    $('.inspector-rename',inspector)?.addEventListener('change',event=>{checkpoint();n.title=event.target.value.trim()||'Untitled';changed();});
    if(busy)$$('button,input,textarea',inspector).forEach(el=>el.disabled=true);
  }
  function renderDiff(n) {
    const content=document.createElement('div');content.className='inspector-content';
    let html=`<p class="eyebrow">${n.recipe?'A NEW DIRECTION':'WORK IN PROGRESS'}</p><input class="inspector-rename" aria-label="Source name" value="${esc(n.title)}">`;
    if(n.groups?.length){
      html+=`<p class="diff-intro">${esc(n.designExplanation)}</p><p class="body-copy">${esc(n.differences)}</p><div style="display:flex;align-items:center;justify-content:space-between"><span class="eyebrow" style="margin:0">SEMANTIC DIFF</span><button class="text-button" data-inspector="reset">↶ Reset all</button></div>`;
      html+=n.groups.map((g,i)=>{
        const split=g.category.indexOf(':');const category=split>-1?g.category.slice(0,split):'DESIGN';const description=split>-1?g.category.slice(split+1).trim():g.category;
        return `<div class="diff-group" data-group="${i}"><div class="diff-row"><div class="diff-name"><small>${esc(category)}</small>${esc(description)}</div><label class="switch" title="${esc(g.enabled?'Revert':'Apply')} ${esc(g.category)}"><input type="checkbox" aria-label="${esc(g.category)}" ${g.enabled?'checked':''} data-toggle="${i}"><span></span></label></div><details><summary>Fine-grained changes · ${g.changes.length}</summary>${g.changes.map((change,j)=>`<div class="fine-change"><label>${esc(change.type||'Style')}</label><div class="before-value">${esc(change.before||'(added)')} →</div><input type="text" aria-label="Updated ${esc(change.type)} value" data-fine="${i}:${j}" value="${esc(change.after)}">${/#[0-9a-fA-F]{6}/.test(change.after)?`<div style="margin-top:7px"><input type="color" aria-label="Pick ${esc(change.type)} color" data-color="${i}:${j}" value="${esc(change.after.match(/#[0-9a-fA-F]{6}/)[0])}"><span>Adjust color</span></div>`:''}</div>`).join('')}<button class="button small soft fine-apply" data-apply="${i}">Apply fine changes</button></details></div>`;
      }).join('');
      html+='<p class="body-copy" style="font-size:10px;margin-top:12px">Each toggle updates the UI code through Codex. Expand a group to adjust individual class or color values.</p>';
    }else{
      html+='<p class="body-copy">Your content. A world of possibilities.<br>Blend an example into this UI to start a new direction.</p><div class="instruction-card"><strong>Connect for a global blend</strong><p>Start at an example’s connector and end at this node. Misty blends its visual language with your content.</p></div><div class="instruction-card"><strong>Drag for something specific</strong><p>Select a part of an example, then drop it onto the exact region you want to update.</p></div>';
    }
    html+=`<div class="inspector-actions"><button class="button soft" data-inspector="code">〈/〉 Edit code</button><button class="button" data-inspector="download">↓ Export</button></div>`;
    if(n.recipe)html+='<button class="button wide" data-inspector="regenerate">✧ Regenerate as another variation</button>';
    if(errors.has(n.id))html+=`<p class="code-error">${esc(errors.get(n.id))}</p><button class="button wide" data-inspector="fix">⚒ Fix render</button>`;
    if(n.parentId){const p=node(n.parentId);html+=`<div class="lineage">Branched from <button data-inspector="parent">${esc(p?.title||'removed source')}</button><br>${esc(n.operation||'Conceptual blend')} · ${esc(n.model||'Codex bridge')}</div>`;}
    content.innerHTML=html;inspector.append(content);inspector.insertAdjacentHTML('beforeend',modelNote());
    $('[data-inspector=code]',content).onclick=()=>{tab='code';renderInspector();};
    $('[data-inspector=download]',content).onclick=()=>downloadCode(n);
    $('[data-inspector=regenerate]',content)?.addEventListener('click',()=>regenerate(n.id));
    $('[data-inspector=fix]',content)?.addEventListener('click',()=>repair(n.id));
    $('[data-inspector=parent]',content)?.addEventListener('click',()=>{if(node(n.parentId))focusNode(n.parentId);});
    $('[data-inspector=reset]',content)?.addEventListener('click',()=>{const groups=structuredClone(n.groups);groups.forEach(g=>g.enabled=false);refine(n,groups);});
    $$('[data-toggle]',content).forEach(input=>input.onchange=()=>{const groups=structuredClone(n.groups);groups[+input.dataset.toggle].enabled=input.checked;refine(n,groups);});
    $$('[data-color]',content).forEach(input=>input.oninput=()=>{const text=$(`[data-fine="${input.dataset.color}"]`,content);text.value=text.value.replace(/#[0-9a-fA-F]{6}/,input.value);});
    $$('[data-apply]',content).forEach(button=>button.onclick=()=>{
      const groups=structuredClone(n.groups),i=+button.dataset.apply;
      $$(`[data-fine^="${i}:"]`,content).forEach(input=>{const j=+input.dataset.fine.split(':')[1];groups[i].changes[j].after=input.value;});
      groups[i].enabled=true;refine(n,groups);
    });
  }
  function renderEditor(n) {
    const wrap=document.createElement('div');wrap.className='code-wrap';
    wrap.innerHTML=`<div class="code-toolbar"><span>COMPONENT.JSX · LIVE</span><div><button class="text-button" data-editor="copy">Copy</button><button class="text-button" data-editor="download">Export</button><button class="text-button" data-editor="close" aria-label="Close code editor">×</button></div></div><textarea class="code-editor" aria-label="Live React component code" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea><pre class="code-error" ${errors.has(n.id)?'':'hidden'}>${esc(errors.get(n.id)||'')}</pre><div class="code-hint">React, hooks, Tailwind v4 and Lucide icons are in scope. A single component, no imports needed. Changes render as you type.</div>`;
    inspector.append(wrap);const editor=$('textarea',wrap);editor.value=n.code;
    let editorCheckpoint=false;
    editor.addEventListener('input',()=>{
      if(!editorCheckpoint){checkpoint();editorCheckpoint=true;}
      n.code=editor.value;clearTimeout(editorTimer);editorTimer=setTimeout(()=>{sendFrame(n.id,'render',{code:n.code});const f=frames.get(n.id);if(f)f.lastCode=n.code;save();editorCheckpoint=false;},600);
    });
    editor.addEventListener('keydown',event=>{
      if(event.key==='Tab'){event.preventDefault();const start=editor.selectionStart,end=editor.selectionEnd;editor.setRangeText('  ',start,end,'end');editor.dispatchEvent(new Event('input'));}
      if((event.metaKey||event.ctrlKey)&&event.key==='s'){event.preventDefault();n.code=editor.value;sendFrame(n.id,'render',{code:n.code});save();toast('Code saved in this workspace.');}
    });
    $('[data-editor=copy]',wrap).onclick=()=>navigator.clipboard.writeText(editor.value).then(()=>toast('Component code copied.')).catch(()=>toast('Select the code and copy it with Ctrl/Cmd+C.'));
    $('[data-editor=download]',wrap).onclick=()=>downloadCode(n);
    $('[data-editor=close]',wrap).onclick=()=>{tab='details';renderInspector();};
  }
  window.addEventListener('message',event=>{
    if(!event.data?.misty)return;
    const pair=[...frames].find(([,f])=>f.element.contentWindow===event.source&&f.token===event.data.token);if(!pair)return;
    const [id,f]=pair,n=node(id);if(!n)return;
    switch(event.data.type){
      case 'ready':f.ready=true;f.lastCode=n.code;sendFrame(id,'render',{code:n.code});if(pendingExample)sendFrame(id,'drag-active',{active:true});break;
      case 'select':if(connection?.from)completeConnection(id);else selectNode(id);break;
      case 'render-error':{
        errors.set(id,String(event.data.error).slice(0,3000));
        const el=$(`[data-node="${id}"] [data-action=fix]`);if(el)el.style.color='#bc667a';
        if(state.selected===id){const box=$('.code-error',inspector);if(box){box.hidden=false;box.textContent=errors.get(id);}else if(tab!=='code')renderInspector();}
        break;
      }
      case 'render-ok':{
        const had=errors.delete(id);const box=$(`[data-node="${id}"] [data-action=fix]`);if(box)box.style.color='';
        if(had&&state.selected===id){if(tab==='code')$('.code-error',inspector).hidden=true;else renderInspector();}break;
      }
      case 'target-drop':if(pendingExample){const ref=pendingExample;pendingExample=null;broadcastDrag(false);updateConnectionMode();openBlendDialog(ref,id,event.data.target,event.data.targetLabel);}break;
    }
  });

  function openModal(html) { if(modal.open)modal.close();modal.innerHTML=html;modal.showModal();$('.close',modal)?.addEventListener('click',()=>modal.close());$$('[data-close]',modal).forEach(b=>b.onclick=()=>modal.close()); }
  const modalHeader=(title,description)=>`<div class="modal-head"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><button class="close" aria-label="Close dialog">×</button></div>`;
  function openBlendDialog(exampleId,sourceId,target,targetLabel) {
    if(busy||!node(exampleId)||!node(sourceId))return;
    openModal(modalHeader('Pick blending options','Choose what to borrow. Your source is the starting point.')+`<div class="modal-body"><div class="target-info">${esc(node(exampleId).title)} → ${esc(node(sourceId).title)}<br>Target: ${esc(targetLabel)}</div>${[
      ['Color','◒','Apply the example’s colors to your design.'],['Layout','▤','Arrange and structure your design elements.'],['Content','＋','Add the selected UI elements, adapted to your content.'],['Customize','✧','Describe another aspect you want to blend.']
    ].map(([name,icon,description])=>`<label class="aspect"><span class="aspect-icon">${icon}</span><div style="flex:1"><strong>${name}</strong><small>${description}</small></div><input type="checkbox" value="${name}" ${name==='Layout'?'checked':''}></label>`).join('')}<textarea id="custom-aspect" class="modal-field" rows="3" aria-label="Custom blending instructions" placeholder="For example: borrow the quiet, spacious feeling, keeping my typography." hidden></textarea><div id="blend-validation" class="body-copy" style="color:#bd697a;margin:0"></div></div><div class="modal-footer"><button class="button" data-close>Cancel</button><button class="button primary" id="confirm-blend">Blend into new variation ↗</button></div>`);
    $$('input[type=checkbox]',modal).forEach(input=>input.onchange=()=>{$('#custom-aspect',modal).hidden=!$('input[value=Customize]',modal).checked;});
    $('#confirm-blend',modal).onclick=()=>{
      const aspects=$$('input:checked',modal).map(i=>i.value),custom=$('#custom-aspect',modal).value.trim();
      if(!aspects.length||aspects.includes('Customize')&&!custom){$('#blend-validation',modal).textContent='Choose at least one aspect, and describe Customize if selected.';return;}
      modal.close();blend({exampleId,sourceId,mode:'localized',aspects,custom,target,targetLabel,crop:structuredClone(node(exampleId).crop)});
    };
  }
  function setBusy(value,label='Finding a new direction…') {
    busy=value;document.body.classList.toggle('busy',value);$('#operation-status').hidden=!value;
    $('#operation-status strong').textContent=label;updateUndo();
    ['#add-reference','#add-source','#connect-button','#import-workspace'].forEach(s=>$(s).disabled=value);
    renderInspector();
  }
  async function api(action,data) {
    const response=await fetch('/api/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    let value;try{value=await response.json();}catch{throw new Error('The server did not return a response. Check that server.py is running.');}
    if(!response.ok)throw new Error(value.error||'The model request failed.');return value;
  }
  async function imageData(n,crop=null) {
    const image=new Image();image.src=n.image;await image.decode();
    const c=crop||{x:0,y:0,w:1,h:1};const sw=Math.max(1,Math.round(c.w*image.naturalWidth)),sh=Math.max(1,Math.round(c.h*image.naturalHeight));
    const scale=Math.min(1,1600/Math.max(sw,sh)),out=document.createElement('canvas');out.width=Math.max(1,Math.round(sw*scale));out.height=Math.max(1,Math.round(sh*scale));
    const ctx=out.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,out.width,out.height);ctx.drawImage(image,c.x*image.naturalWidth,c.y*image.naturalHeight,sw,sh,0,0,out.width,out.height);
    return out.toDataURL('image/png');
  }
  function nextPosition(parent) {
    let x=parent.x+560,y=parent.y;
    while(state.nodes.some(n=>Math.abs(n.x-x)<400&&Math.abs(n.y-y)<740))y+=790;
    return {x,y};
  }
  async function blend(recipe,regeneratedFrom=null) {
    if(busy)return;
    const source=node(recipe.sourceId),example=node(recipe.exampleId);if(!source||!example){toast('This blend’s example or source has been removed.',true);return;}
    recipe=structuredClone(recipe);
    if(recipe.mode==='localized'&&!('crop' in recipe))recipe.crop=structuredClone(example.crop);
    setBusy(true,regeneratedFrom?'Exploring another variation…':'Blending your next direction…');
    try{
      const image=await imageData(example,recipe.mode==='localized'?recipe.crop:null);
      const result=await api('blend',{code:source.code,image,mode:recipe.mode,aspects:recipe.aspects,custom:recipe.custom,target:recipe.target,targetLabel:recipe.targetLabel});
      checkpoint();const pos=nextPosition(regeneratedFrom?node(regeneratedFrom)||source:source);
      const count=state.nodes.filter(n=>n.parentId===source.id).length+1;
      const created={...sourceNode({title:source.title.replace(/ · \d+$/,'')+' · '+count,code:result.updatedCode},pos.x,pos.y),groups:result.categorizedChanges,designExplanation:result.designExplanation,differences:result.differences,originalCode:source.code,blendedCode:result.updatedCode,recipe,parentId:source.id,model:result.model,operation:recipe.mode==='global'?'Global blend':recipe.aspects.join(' + ')+' blend'};
      state.nodes.push(created);state.edges.push({from:example.id,to:created.id,label:recipe.mode==='global'?'global blend':recipe.aspects.join(' + '),kind:'reference'},{from:source.id,to:created.id,label:'variation',kind:'lineage'});state.selected=created.id;tab='details';
      render();save();requestAnimationFrame(()=>fit([source.id,created.id]));toast('A new variation is ready. Your previous design is preserved.');
    }catch(error){toast(error.message,true,11000);}finally{setBusy(false);checkHealth();}
  }
  async function refine(n,groups) {
    if(busy)return;setBusy(true,'Refining semantic changes…');
    try{
      const result=await api('refine',{code:n.code,originalCode:n.originalCode,blendedCode:n.blendedCode,groups});
      checkpoint();n.code=result.updatedCode;n.groups=groups;errors.delete(n.id);changed();toast('Semantic changes applied to this variation.');
    }catch(error){toast(error.message,true,10000);}finally{setBusy(false);}
  }
  async function repair(id) {
    const n=node(id);if(!n||busy)return;setBusy(true,'Repairing the component…');
    try{const result=await api('repair',{code:n.code,error:errors.get(id)||'Check component for syntax and rendering errors. Preserve design.'});checkpoint();n.code=result.updatedCode;errors.delete(id);changed();toast('Repair returned. Check the preview or adjust it in the code editor.');}
    catch(error){toast(error.message,true,10000);}finally{setBusy(false);}
  }
  function regenerate(id) {const n=node(id);if(n?.recipe)blend(n.recipe,id);}
  async function checkHealth() {
    try{const r=await fetch('/api/health'),health=await r.json();const el=$('#health');el.classList.toggle('ready',health.compatible);$('span',el).textContent=health.compatible?'Codex connected':'Bridge offline';el.title=health.compatible?`Codex bridge · ${health.bridge.model} replaces GPT-4o`:health.bridge.backend?'Different backend detected. Use a Codex bridge.':'Run python3 llm-bridge/bridge.py codex';}
    catch{$('#health span').textContent='Server offline';$('#health').classList.remove('ready');}
  }

  function openNodeMenu(n,event) {
    $('.context-menu')?.remove();const menu=document.createElement('div');menu.className='context-menu';
    menu.style.left=Math.min(event.clientX,innerWidth-165)+'px';menu.style.top=Math.min(event.clientY+10,innerHeight-170)+'px';
    menu.innerHTML=`<button data-menu="focus">Focus node</button><button data-menu="duplicate">Duplicate</button>${n.kind==='source'?'<button data-menu="export">Export code</button>':''}<button data-menu="remove" style="color:#bc778b">Remove node</button>`;document.body.append(menu);
    $('[data-menu=focus]',menu).onclick=()=>{menu.remove();focusNode(n.id);};
    $('[data-menu=duplicate]',menu).onclick=()=>{menu.remove();duplicateNode(n.id);};
    $('[data-menu=export]',menu)?.addEventListener('click',()=>{menu.remove();downloadCode(n);});
    $('[data-menu=remove]',menu).onclick=()=>{menu.remove();deleteNode(n.id);};
    setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),0);
  }
  function duplicateNode(id) {
    if(busy)return;const n=node(id);checkpoint();const copy={...structuredClone(n),id:uid(),title:n.title+' copy',...nextPosition(n),created:Date.now()};
    state.nodes.push(copy);state.selected=copy.id;changed();requestAnimationFrame(()=>fit([n.id,copy.id]));
  }
  function deleteNode(id) {
    if(busy)return;checkpoint();state.nodes=state.nodes.filter(n=>n.id!==id);state.edges=state.edges.filter(e=>e.from!==id&&e.to!==id);
    if(state.selected===id)state.selected=state.nodes.find(n=>n.kind==='source')?.id||state.nodes[0]?.id||null;
    if(connection?.from===id)connection=null;if(pendingExample===id){pendingExample=null;broadcastDrag(false);}updateConnectionMode();changed();
  }
  function download(filename,data,type='text/plain') {
    const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function slug(value){return value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'misty';}
  function downloadCode(n){download(slug(n.title)+'.jsx',n.code);}
  function addPosition() {
    if(!state.nodes.length)return{x:60,y:100};
    return{x:Math.min(...state.nodes.map(n=>n.x)),y:Math.max(...state.nodes.map(n=>n.y))+800};
  }
  function addExample(reference) {if(busy)return;checkpoint();const p=addPosition(),n=exampleNode(reference,p.x,p.y);state.nodes.push(n);state.selected=n.id;changed();setTimeout(()=>fit([n.id]),150);}
  function addSource(sample) {if(busy)return;checkpoint();const p=addPosition(),n=sourceNode(sample,p.x+420,p.y);state.nodes.push(n);state.selected=n.id;tab='code';changed();requestAnimationFrame(()=>fit([n.id]));}
  function openExampleDialog() {
    openModal(modalHeader('Bring an example','Upload a screenshot or photographed sketch. No source code needed.')+'<div class="modal-body"><button class="upload-zone" id="upload-examples"><strong>＋ Choose images</strong><small>PNG, JPG, WebP or SVG · multiple images welcome</small></button><p class="eyebrow">OR EXPLORE AN ORIGINAL SAMPLE</p><div class="sample-list">'+MISTY_REFERENCES.map((r,i)=>`<button class="sample-card" data-sample="${i}"><img src="${r.image}" alt="${esc(r.title)}"><strong>${esc(r.title)}</strong>${esc(r.description)}</button>`).join('')+'</div><p class="body-copy" style="font-size:10px;margin:15px 0 0">Samples are original vector screenshots and a sketch made for this rebuild.</p></div>');
    $('#upload-examples',modal).onclick=()=>$('#image-input').click();$$('[data-sample]',modal).forEach(b=>b.onclick=()=>{modal.close();addExample(MISTY_REFERENCES[+b.dataset.sample]);});
  }
  function openSourceDialog() {
    openModal(modalHeader('Add a source UI','Start with your work in progress, or a small sample.')+`<div class="modal-body"><input id="source-title" class="modal-field" aria-label="Source name" placeholder="Name this source UI" value="My source UI"><textarea id="source-code" class="modal-field" style="font:11px/1.7 ui-monospace,monospace" rows="9" aria-label="Paste React component" placeholder="Paste a React component here: () => { return (<main>...</main>); }"></textarea><button class="text-button" id="upload-code">↑ Load a .jsx / .tsx file</button><p class="eyebrow" style="margin-top:22px">OR START WITH A SAMPLE</p><div class="sample-list">${Object.entries(MISTY_SAMPLES).map(([key,s])=>`<button class="sample-card" data-source="${key}"><strong>${esc(s.title)}</strong>React + Tailwind</button>`).join('')}</div><p class="body-copy" id="source-validation" style="margin:10px 0 0;color:#b56b84"></p></div><div class="modal-footer"><button class="button" data-close>Cancel</button><button class="button primary" id="create-source">Add to canvas</button></div>`);
    $('#upload-code',modal).onclick=()=>$('#code-input').click();
    $$('[data-source]',modal).forEach(b=>b.onclick=()=>{modal.close();addSource(MISTY_SAMPLES[b.dataset.source]);});
    $('#create-source',modal).onclick=()=>{const code=$('#source-code',modal).value.trim();if(!code){$('#source-validation',modal).textContent='Paste a component, upload code, or choose a sample.';return;}const title=$('#source-title',modal).value.trim()||'My source UI';modal.close();addSource({title,code});};
  }
  function showHelp() {
    openModal(modalHeader('A little guide to Misty','Mixing Interfaces by Semantic Transformation.')+`<div class="modal-body"><ol class="help-list"><li><strong>Add examples and your source UI.</strong> Examples can be screenshots, sketches or wireframes. Source nodes contain editable React and Tailwind code.</li><li><strong>Blend globally.</strong> Drag or click the connector on an example’s right edge, then choose a source node. Misty keeps your content and borrows the example’s visual language.</li><li><strong>Blend a detail.</strong> Draw a box on an example. Drag the handle below it onto a source element, or use “Click to place.” Choose Color, Layout, Content and/or Customize.</li><li><strong>Refine and explore.</strong> A blend creates a new source node. Toggle semantic changes, expand fine-grained controls, regenerate, or open the live code editor.</li><li><strong>Keep your work.</strong> The workspace saves locally. Download a workspace JSON to transfer it, or export a source component as JSX.</li></ol><p class="body-copy">Drag headers to move nodes. Scroll or hold Space to pan. Ctrl/Cmd + scroll to zoom. Use ⛶ to fit all nodes. Escape cancels placement or a connection. Uploads can also be dropped onto the canvas.</p><div class="instruction-card"><strong>Workshop substitutions</strong><p>The Codex bridge’s fast model replaces GPT-4o. SVG illustrations replace stock photos. The original paper focuses on static single-screen UIs; cross-screen interaction and animation blending are outside its scope.</p></div></div><div class="modal-footer"><button class="button primary" data-close>Start exploring</button></div>`);
  }
  async function readImages(files) {
    for(const file of files){
      if(!file.type.startsWith('image/'))continue;
      if(file.size>12*1024*1024){toast('Choose reference images under 12 MB.',true);continue;}
      try{
        const url=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
        // Rasterization strips external SVG references and caps workspace image sizes.
        const temp={image:url};const image=await imageData(temp);
        addExample({title:file.name.replace(/\.[^.]+$/,''),image});
      }catch{toast('Could not read '+file.name+'. Try PNG, JPEG, WebP or a self-contained SVG.',true);}
    }
    if(modal.open)modal.close();
  }
  $('#image-input').onchange=async event=>{await readImages(event.target.files);event.target.value='';};
  $('#code-input').onchange=async event=>{const file=event.target.files[0];if(file){const code=await file.text();if($('#source-code',modal)){$('#source-code',modal).value=code;$('#source-title',modal).value=file.name.replace(/\.[^.]+$/,'');}else addSource({title:file.name,code});}event.target.value='';};
  $('#workspace-input').onchange=async event=>{
    const file=event.target.files[0];if(!file)return;
    try{const imported=safeWorkspace(JSON.parse(await file.text()));checkpoint();frames.clear();nodesEl.replaceChildren();state=imported;tab='details';changed();toast('Workspace opened. Undo restores the previous workspace.');}
    catch(error){toast(error.message,true);}event.target.value='';
  };
  canvas.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('Files')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
  canvas.addEventListener('drop',event=>{if(event.dataTransfer.files.length){event.preventDefault();readImages(event.dataTransfer.files);}});

  canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0&&event.button!==1)return;
    if(!(space||panMode||event.button===1) && event.target.closest('.node,.canvas-controls,.operation-status'))return;
    event.preventDefault();const start={x:event.clientX,y:event.clientY,cx:state.camera.x,cy:state.camera.y};let moved=false;
    canvas.setPointerCapture(event.pointerId);canvas.classList.add('grabbing');
    const move=e=>{if(Math.hypot(e.clientX-start.x,e.clientY-start.y)>3)moved=true;state.camera.x=start.cx+e.clientX-start.x;state.camera.y=start.cy+e.clientY-start.y;applyCamera();};
    const up=()=>{canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.classList.remove('grabbing');if(!moved&&!connection&&!pendingExample&&!space&&!panMode)selectNode(null);save();};
    canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up,{once:true});
  },true);
  canvas.addEventListener('wheel',event=>{
    event.preventDefault();if(event.ctrlKey||event.metaKey)zoomTo(state.camera.z*Math.exp(-event.deltaY*.006),event.clientX,event.clientY);
    else{state.camera.x-=event.deltaX;state.camera.y-=event.deltaY;applyCamera();save();}
  },{passive:false});
  document.addEventListener('keydown',event=>{
    const editing=event.target.closest('input,textarea,[contenteditable]');
    if(event.key==='Escape'){connection=null;pendingExample=null;broadcastDrag(false);updateConnectionMode();renderConnections();$('.context-menu')?.remove();}
    if(editing||modal.open)return;
    if(event.code==='Space'){event.preventDefault();space=true;canvas.classList.add('panning');}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();restoreHistory(event.shiftKey);}
    if((event.key==='Delete'||event.key==='Backspace')&&state.selected&&!busy){event.preventDefault();deleteNode(state.selected);}
    if(event.key==='0')fit();
    if((event.ctrlKey||event.metaKey)&&event.key==='s'){event.preventDefault();exportWorkspace();}
  });
  document.addEventListener('keyup',event=>{if(event.code==='Space'){space=false;canvas.classList.toggle('panning',panMode);}});
  window.addEventListener('blur',()=>{space=false;canvas.classList.toggle('panning',panMode);});
  function restoreHistory(redo=false) {
    if(busy)return;const from=redo?redoStack:undoStack,to=redo?undoStack:redoStack;if(!from.length)return;
    clearTimeout(editorTimer);to.push(snapshot());state=JSON.parse(from.pop());frames.clear();nodesEl.replaceChildren();errors.clear();tab='details';connection=null;pendingExample=null;broadcastDrag(false);updateConnectionMode();changed();
  }
  async function exportWorkspace() {
    const portable=structuredClone(state);
    try{for(const n of portable.nodes)if(n.kind==='example'&&!n.image.startsWith('data:'))n.image=await imageData(n);download('misty-workspace.json',JSON.stringify(portable,null,2),'application/json');toast('Workspace downloaded, including examples and editable code.');}
    catch(error){toast(error.message,true);}
  }
  $('#add-reference').onclick=openExampleDialog;$('#add-source').onclick=openSourceDialog;
  $('#connect-button').onclick=()=>{
    if(connection){connection=null;updateConnectionMode();renderConnections();return;}
    const examples=state.nodes.filter(n=>n.kind==='example'),sources=state.nodes.filter(n=>n.kind==='source');
    if(!examples.length||!sources.length){toast('Add an example image and a source UI first.');return;}
    const n=selected();const reference=n?.kind==='example'?n:examples[0];
    connection={from:reference.id};pendingExample=null;broadcastDrag(false);updateConnectionMode();toast('Choose a source node to blend with '+reference.title+'.');
  };
  $('#fit').onclick=()=>fit();$('#zoom-in').onclick=()=>zoomTo(state.camera.z*1.15);$('#zoom-out').onclick=()=>zoomTo(state.camera.z/1.15);$('#zoom-label').onclick=()=>zoomTo(1);
  $('#pan-tool').onclick=()=>{panMode=!panMode;$('#pan-tool').classList.toggle('active',panMode);canvas.classList.toggle('panning',panMode);};
  $('#undo').onclick=()=>restoreHistory(false);$('#redo').onclick=()=>restoreHistory(true);
  $('#export-workspace').onclick=exportWorkspace;$('#import-workspace').onclick=()=>$('#workspace-input').click();
  $('#help-button').onclick=showHelp;$('#health').onclick=()=>{checkHealth();toast('Model calls use Codex. Start the bridge from the repository root: python3 llm-bridge/bridge.py codex',false,7000);};
  modal.addEventListener('click',event=>{if(event.target===modal){const rect=modal.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)modal.close();}});
  window.addEventListener('beforeunload',()=>{try{localStorage.setItem(storageKey,snapshot());}catch{}});
  render();checkHealth();
  if(!loadedSaved)setTimeout(()=>fit(),450);
})();
