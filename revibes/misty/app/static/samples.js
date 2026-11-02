window.MISTY_SAMPLES = {
  profile: {
    title: 'Fuji’s profile',
    code: `() => {
  return (
    <main className="min-h-screen bg-white p-6 text-slate-800">
      <header className="mb-7 flex items-center justify-between">
        <ArrowLeft size={18} /><span className="text-xs font-medium">My profile</span><MoreHorizontal size={18} />
      </header>
      <section className="mb-7 text-center">
        <img src="/stock/portrait0.svg" alt="Mountain lake at sunset" className="mx-auto mb-4 h-20 w-20 rounded-full object-cover" />
        <h1 className="text-2xl font-semibold tracking-tight">Fuji</h1>
        <p className="mt-1 text-xs text-slate-400">@fujimist</p>
        <p className="mx-auto mt-4 max-w-56 text-xs leading-relaxed text-slate-500">Passionate nature photographer. Collecting little moments, one frame at a time.</p>
      </section>
      <section className="mb-7 rounded-lg border border-slate-100 p-4">
        <h2 className="mb-3 text-xs font-semibold">Contact information</h2>
        <div className="mb-3 flex items-center gap-3 text-xs text-slate-500"><Mail size={14} /> fuji@example.com</div>
        <div className="mb-3 flex items-center gap-3 text-xs text-slate-500"><Phone size={14} /> +1 (555) 010-2026</div>
        <div className="flex items-center gap-3 text-xs text-slate-500"><MapPin size={14} /> Detroit, Michigan</div>
      </section>
      <section>
        <h2 className="mb-3 text-sm font-semibold">Interests</h2>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md bg-slate-100 px-3 py-2 text-[10px] text-slate-600">Film camera</span>
          <span className="rounded-md bg-slate-100 px-3 py-2 text-[10px] text-slate-600">Lofi music</span>
          <span className="rounded-md bg-slate-100 px-3 py-2 text-[10px] text-slate-600">Mid-century furniture</span>
          <span className="rounded-md bg-slate-100 px-3 py-2 text-[10px] text-slate-600">Music production</span>
        </div>
      </section>
    </main>
  );
}`
  },
  trails: {
    title: 'Weekend trails',
    code: `() => (
  <main className="min-h-screen bg-white p-5 text-slate-800">
    <header className="mb-5 flex items-center justify-between"><h1 className="text-xl font-semibold">Find your outside.</h1><Compass size={20}/></header>
    <div className="mb-4 flex gap-2 rounded border p-3 text-xs text-slate-400"><Search size={14}/>Find parks</div>
    <nav className="mb-5 flex gap-2 text-[10px]"><span className="rounded bg-slate-100 px-3 py-2">Nearby</span><span className="rounded bg-slate-100 px-3 py-2">Epic views</span><span className="rounded bg-slate-100 px-3 py-2">Wildflowers</span></nav>
    <article className="mb-3 rounded border border-slate-200 p-4"><h2 className="text-sm font-semibold">Steep Ravine, Dipsea and Matt Davis</h2><p className="mt-2 text-xs text-slate-500">Stinson Beach, California</p><p className="mt-2 text-[10px] text-slate-400">★ 4.8 · Moderate · 6.60 mi · Est. 3h 41m</p></article>
    <article className="mb-3 rounded border border-slate-200 p-4"><h2 className="text-sm font-semibold">Bear Mountain, Appalachian Trail</h2><p className="mt-2 text-xs text-slate-500">Bear Mountain, New York</p><p className="mt-2 text-[10px] text-slate-400">★ 4.7 · Hard · 4.00 mi · Est. 2h 20m</p></article>
    <article className="mb-3 rounded border border-slate-200 p-4"><h2 className="text-sm font-semibold">Sunset Ridge, Griffith Park</h2><p className="mt-2 text-xs text-slate-500">Los Angeles, California</p><p className="mt-2 text-[10px] text-slate-400">★ 4.9 · Easy · 3.20 mi · Est. 1h 30m</p></article>
    <article className="rounded border border-slate-200 p-4"><h2 className="text-sm font-semibold">Yosemite Falls Trail</h2><p className="mt-2 text-xs text-slate-500">Yosemite National Park, California</p><p className="mt-2 text-[10px] text-slate-400">★ 4.8 · Hard · 7.20 mi · Est. 6h 00m</p></article>
  </main>
)`
  },
  books: {
    title: 'A small reading list',
    code: `() => (
  <main className="min-h-screen bg-stone-50 p-6 text-stone-800">
    <header className="mb-7"><BookOpen size={25}/><p className="mt-5 text-xs text-stone-400">A LITTLE TIME FOR YOURSELF</p><h1 className="mt-2 text-2xl font-semibold">Your reading list</h1></header>
    <section>
      <article className="mb-4 border-b border-stone-200 pb-4"><h2 className="font-semibold">The Creative Act</h2><p className="mt-1 text-xs text-stone-500">Rick Rubin · Creativity</p><p className="mt-2 text-xs">A way of being, and seeing the world.</p></article>
      <article className="mb-4 border-b border-stone-200 pb-4"><h2 className="font-semibold">A Field Guide to Getting Lost</h2><p className="mt-1 text-xs text-stone-500">Rebecca Solnit · Essays</p><p className="mt-2 text-xs">An invitation to wander and discover.</p></article>
      <article className="mb-4 border-b border-stone-200 pb-4"><h2 className="font-semibold">The Design of Everyday Things</h2><p className="mt-1 text-xs text-stone-500">Don Norman · Design</p><p className="mt-2 text-xs">Making the world a little more understandable.</p></article>
    </section>
    <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-stone-800 py-3 text-xs text-white"><Plus size={14}/>Add a book</button>
  </main>
)`
  }
};
window.MISTY_REFERENCES = [
  {title:'Quietly dark', description:'Color & compact lists', image:'/example-health.svg'},
  {title:'A softer rhythm', description:'Cards & horizontal layout', image:'/example-cards.svg'},
  {title:'An idea on paper', description:'Low-fidelity sketch', image:'/example-sketch.svg'}
];
