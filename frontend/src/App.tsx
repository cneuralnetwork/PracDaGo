import {useEffect,useMemo,useState} from 'react';
import Editor from '@monaco-editor/react';
import {BookOpen, CheckCircle2, Code2, GraduationCap, Play, Search, Send, Sparkles} from 'lucide-react';
import './index.css';

type Problem={id:string;number:number;title:string;chapter:string;difficulty:string;tags:string[];statement:string;explanation:string;lessonTitle?:string;lesson?:string;approach?:string;pitfalls?:string[];hints:string[];starterCode:string;solutionCode:string;examples:{input:string;output:string}[]}
type Store={chapters:{id:string;title:string}[];problems:Problem[]}
const API=import.meta.env.VITE_API_URL||'http://localhost:8080';

function App(){
  const [store,setStore]=useState<Store>({chapters:[],problems:[]});
  const [pid,setPid]=useState(''); const [query,setQuery]=useState(''); const [chapter,setChapter]=useState('all');
  const [code,setCode]=useState(''); const [out,setOut]=useState(''); const [verdict,setVerdict]=useState(''); const [tab,setTab]=useState<'study'|'problem'|'solution'>('study');
  const [solved,setSolved]=useState<string[]>(()=>JSON.parse(localStorage.getItem('solved')||'[]'));
  useEffect(()=>{fetch(API+'/api/problems').then(r=>r.json()).then(s=>{setStore(s); setPid(s.problems[0]?.id||''); setCode(s.problems[0]?.starterCode||'')})},[]);
  const problem=store.problems.find(p=>p.id===pid);
  const progress=Math.round((solved.length/Math.max(store.problems.length,1))*100);
  const filtered=useMemo(()=>store.problems.filter(p=>(chapter==='all'||p.chapter===chapter)&&((p.title+p.tags.join(' ')+p.statement+(p.lesson||'')).toLowerCase().includes(query.toLowerCase()))),[store,query,chapter]);
  function select(p:Problem){setPid(p.id); setCode(localStorage.getItem('draft:'+p.id)||p.starterCode); setOut(''); setVerdict(''); setTab('study')}
  function saveDraft(v:string|undefined){const c=v||''; setCode(c); if(problem)localStorage.setItem('draft:'+problem.id,c)}
  async function run(mode:string){setVerdict('Running...'); setOut(''); const r=await fetch(API+'/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({problemId:pid,code,mode})}); const j=await r.json(); setVerdict(j.verdict); setOut((j.error?j.error+'\n\n':'')+j.output+`\n\n${j.durationMs}ms`); if(mode==='submit'&&j.verdict==='Accepted'&&problem){const ns=[...new Set([...solved,problem.id])]; setSolved(ns); localStorage.setItem('solved',JSON.stringify(ns))}}
  return <div className="min-h-screen">
    <header className="glass sticky top-0 z-20 px-5 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3"><div className="p-2 rounded-xl" style={{background:'var(--brand)'}}><Code2 size={20}/></div><div><h1 className="text-xl font-semibold tracking-[-.03em]">GoPrac</h1><p className="text-xs muted">study → solve → submit Go exercises</p></div></div>
      <div className="hidden md:flex items-center gap-3 text-sm muted"><span>{solved.length}/{store.problems.length} solved</span><div className="w-40 h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full" style={{width:progress+'%',background:'var(--brand2)'}}/></div><span>{progress}%</span></div>
    </header>
    <div className="grid grid-cols-[360px_1fr] gap-4 p-4">
      <aside className="panel p-4 h-[calc(100vh-88px)] overflow-auto scrollbar">
        <div className="mb-5 surface p-4"><div className="flex items-center gap-2 text-sm soft mb-2"><Sparkles size={16}/> Course mode</div><div className="text-2xl font-semibold tracking-[-.04em]">Follow the book, then code.</div><p className="muted text-sm mt-2 leading-6">All book exercises are organized by chapter with study guides, attack plans, pitfalls, and starter Go sketches.</p></div>
        <div className="flex items-center gap-2 mb-3 surface px-3"><Search size={16} className="muted"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search lessons/problems" className="bg-transparent outline-none py-3 w-full"/></div>
        <select value={chapter} onChange={e=>setChapter(e.target.value)} className="w-full surface p-3 mb-4 outline-none"><option value="all">All chapters</option>{store.chapters.map(c=><option key={c.id} value={c.id}>{c.id.toUpperCase().replace('CH','Ch ')} · {c.title}</option>)}</select>
        <div className="space-y-2">{filtered.map(p=><button key={p.id} onClick={()=>select(p)} className={`w-full text-left p-3 rounded-xl border transition ${p.id===pid?'problem-active':'bg-white/[.02] border-white/[.06] hover:border-white/20'}`}><div className="flex justify-between gap-3"><b className="font-medium">{p.number}. {p.title}</b>{solved.includes(p.id)&&<CheckCircle2 size={17} className="text-emerald-400 shrink-0"/>}</div><div className="text-xs opacity-70 mt-1">{p.difficulty} · {p.tags.slice(0,3).join(', ')}</div></button>)}</div>
      </aside>
      <main className="grid grid-cols-[minmax(420px,0.92fr)_minmax(500px,1.08fr)] gap-4 h-[calc(100vh-88px)]">{problem&&<>
        <section className="panel overflow-hidden flex flex-col"><div className="px-5 pt-5 pb-3 border-b border-white/[.06]"><div className="flex items-center gap-2 muted text-sm"><BookOpen size={16}/>{store.chapters.find(c=>c.id===problem.chapter)?.title}</div><h2 className="text-4xl font-semibold tracking-[-.055em] mt-2">{problem.number}. {problem.title}</h2><div className="flex flex-wrap gap-2 mt-4"><span className="chip">{problem.difficulty}</span>{problem.tags.map(t=><span className="chip" key={t}>{t}</span>)}</div><div className="flex gap-2 mt-4"><button className={`tab ${tab==='study'?'active':''}`} onClick={()=>setTab('study')}><GraduationCap size={15} className="inline mr-1"/> Study</button><button className={`tab ${tab==='problem'?'active':''}`} onClick={()=>setTab('problem')}>Problem</button><button className={`tab ${tab==='solution'?'active':''}`} onClick={()=>setTab('solution')}>Explain</button></div></div>
          <div className="p-5 overflow-auto scrollbar prose">{tab==='study'&&<><h3>{problem.lessonTitle}</h3>{(problem.lesson||'').split('\n\n').map((x,i)=><p key={i}>{x}</p>)}<h3>How to attack this</h3><p>{problem.approach}</p><h3>Common traps</h3><ul className="list-disc ml-5">{problem.pitfalls?.map(x=><li key={x}>{x}</li>)}</ul></>}{tab==='problem'&&<><h3>Task</h3><p>{problem.statement}</p><h3>Examples</h3>{problem.examples.map((e,i)=><pre key={i}>Input: {e.input}\nOutput: {e.output}</pre>)}<h3>Hints</h3><ol className="list-decimal ml-5">{problem.hints.map(h=><li key={h}>{h}</li>)}</ol></>}{tab==='solution'&&<><h3>Detailed explanation</h3><p>{problem.explanation}</p><h3>Reference solution</h3><pre>{problem.solutionCode}</pre></>}</div></section>
        <section className="panel overflow-hidden flex flex-col"><div className="p-3 flex gap-2 justify-between border-b border-white/[.06]"><div><div className="font-medium">Go editor</div><div className="text-xs muted">Drafts save automatically in this browser</div></div><div className="flex gap-2"><button className="btn2" onClick={()=>run('run')}><Play size={15} className="inline"/> Run</button><button className="btn" onClick={()=>run('submit')}><Send size={15} className="inline"/> Submit</button></div></div><div className="flex-1"><Editor height="100%" defaultLanguage="go" theme="vs-dark" value={code} onChange={saveDraft} options={{fontSize:14,fontFamily:'JetBrains Mono, monospace',minimap:{enabled:false},scrollBeyondLastLine:false,renderLineHighlight:'all',padding:{top:16}}}/></div><div className="h-52 border-t border-white/[.06] p-3 overflow-auto bg-black/70"><div className="font-medium mb-2">{verdict||'Output'}</div><pre className="text-sm whitespace-pre-wrap muted mono">{out||"Run code to see compile/runtime output. Many book exercises are project-style, so use Run mode plus the study guide's reproducible proof."}</pre></div></section>
      </>}</main>
    </div>
  </div>
}
export default App
