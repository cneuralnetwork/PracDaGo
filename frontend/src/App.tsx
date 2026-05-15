import {useEffect,useMemo,useState} from 'react';
import Editor from '@monaco-editor/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {BookOpen, CheckCircle2, FileText, Play, Search, Send, Upload} from 'lucide-react';
import './index.css';

type Problem={id:string;number:number;title:string;chapter:string;difficulty:string;tags:string[];statement:string;problemText?:string;explanation:string;howItWorks?:string;syntax?:string;solve?:string;lessonTitle?:string;lesson?:string;approach?:string;pitfalls?:string[];hints:string[];starterCode:string;solutionCode:string;exerciseMode?:string;verifier?:string;examples:{input:string;output:string}[]}
type Store={chapters:{id:string;title:string}[];problems:Problem[]}
type FlowTab='explanation'|'how'|'syntax'|'problem'|'solve'
const API=import.meta.env.VITE_API_URL||'http://localhost:8080';
const flowTabs:{id:FlowTab;label:string}[]=[{id:'explanation',label:'Explanation'},{id:'how',label:'How it works'},{id:'syntax',label:"What's the syntax"},{id:'problem',label:'Problem'},{id:'solve',label:'Solve'}];

function md(text:string){return <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>}
function canSubmit(p:Problem){return p.exerciseMode==='judge'&&p.verifier==='local-tests'}
function chipText(p:Problem){return p.exerciseMode==='judge'?'Judge':'Project'}
function flowContent(p:Problem,tab:FlowTab){
  if(tab==='explanation') return `### Explanation\n\n${p.explanation}`;
  if(tab==='how') return `### How it works\n\n${p.howItWorks||p.lesson||''}`;
  if(tab==='syntax') return `### What's the syntax\n\n${p.syntax||p.lesson||p.approach||p.statement}`;
  if(tab==='problem') return `### Problem\n\n${p.problemText||p.statement}\n\n### Examples\n\n${p.examples.map(e=>`\`\`\`text\nInput: ${e.input}\nOutput: ${e.output}\n\`\`\``).join('\n\n')}\n\n### Hints\n\n${p.hints.map(h=>`- ${h}`).join('\n')}`;
  const reference=canSubmit(p)&&p.solutionCode?`\n\n### Reference solution\n\n\`\`\`go\n${p.solutionCode}\n\`\`\``:'';
  const guidance=!canSubmit(p)&&p.solutionCode?`\n\n### Project guidance\n\n${p.solutionCode}`:'';
  const completion=!canSubmit(p)?'\n\n### Completion\n\nUse Run mode or your local terminal to produce the proof requested by the exercise, then use the manual completion button in the editor panel.':'';
  return `### Solve\n\n${p.solve||p.approach||''}${reference}${guidance}${completion}`;
}

function App(){
  const [store,setStore]=useState<Store>({chapters:[],problems:[]});
  const [pid,setPid]=useState(''); const [query,setQuery]=useState(''); const [chapter,setChapter]=useState('all'); const [mode,setMode]=useState('all');
  const [code,setCode]=useState(''); const [out,setOut]=useState(''); const [verdict,setVerdict]=useState(''); const [tab,setTab]=useState<FlowTab>('explanation');
  const [uploaded,setUploaded]=useState<{name:string; text:string}[]>([]);
  const [proofReady,setProofReady]=useState(false);
  const [solved,setSolved]=useState<string[]>(()=>JSON.parse(localStorage.getItem('solved')||'[]'));
  useEffect(()=>{fetch(API+'/api/problems').then(r=>r.json()).then(s=>{setStore(s); setPid(s.problems[0]?.id||''); setCode(s.problems[0]?.starterCode||'')})},[]);
  const problem=store.problems.find(p=>p.id===pid);
  const canSubmitProblem=!!problem&&canSubmit(problem);
  const progress=Math.round((solved.length/Math.max(store.problems.length,1))*100);
  const judgeCount=store.problems.filter(p=>p.exerciseMode==='judge').length;
  const needsFiles=!!problem && (problem.tags.includes('file') || /file|stdin|read/i.test(problem.statement));
  const filtered=useMemo(()=>store.problems.filter(p=>(chapter==='all'||p.chapter===chapter)&&(mode==='all'||p.exerciseMode===mode)&&((p.title+p.tags.join(' ')+p.statement+(p.problemText||'')+(p.explanation||'')+(p.howItWorks||'')+(p.syntax||'')+(p.solve||'')+(p.lesson||'')+(p.approach||'')).toLowerCase().includes(query.toLowerCase()))),[store,query,chapter,mode]);
  function select(p:Problem){setPid(p.id); setCode(localStorage.getItem('draft:'+p.id)||p.starterCode); setUploaded(JSON.parse(localStorage.getItem('files:'+p.id)||'[]')); setProofReady(false); setOut(''); setVerdict(''); setTab('explanation')}
  function saveDraft(v:string|undefined){const c=v||''; setCode(c); if(problem)localStorage.setItem('draft:'+problem.id,c)}
  async function addFiles(list:FileList|null){ if(!problem||!list) return; const files=await Promise.all(Array.from(list).map(async f=>({name:f.name,text:await f.text()}))); const next=[...uploaded,...files]; setUploaded(next); localStorage.setItem('files:'+problem.id,JSON.stringify(next)); setOut(`### Uploaded files\n\n${next.map(f=>`- **${f.name}** (${f.text.length} chars)`).join('\n')}\n\nUse these as your sample inputs while solving this file-based exercise.`); setVerdict('Files ready') }
  function clearFiles(){ if(!problem) return; setUploaded([]); localStorage.removeItem('files:'+problem.id); setOut(''); setVerdict('') }
  function markSolved(p:Problem){const ns=[...new Set([...solved,p.id])]; setSolved(ns); localStorage.setItem('solved',JSON.stringify(ns))}
  function showProjectChecklist(){ if(!problem) return; setProofReady(true); setVerdict('Proof checklist'); setOut(`### Manual completion checklist\n\nBefore marking this project complete, keep a short reproducible proof:\n\n- The command or Run-mode input you used.\n- Any sample file or argument needed by the exercise.\n- The observed output or behavior.\n- A one-sentence note connecting the result to the exercise goal.\n\nProject exercises are not accepted by hidden tests. They are marked complete locally after you have reviewed this checklist.`) }
  function markComplete(){ if(!problem) return; if(canSubmit(problem)) return; if(!proofReady){showProjectChecklist(); return}; if(!solved.includes(problem.id)) markSolved(problem); setVerdict('Marked complete'); setOut(`### Marked complete locally\n\n${problem.title} is now recorded in browser localStorage as complete.\n\nKeep your proof command, sample input, and observed output with your notes so you can revisit the project later.`) }
  async function run(mode:string){ if(mode==='submit'&&(!problem||!canSubmit(problem))){showProjectChecklist(); return}; setVerdict('Running...'); setOut(''); const r=await fetch(API+'/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({problemId:pid,code,mode})}); const text=await r.text(); let j; try{j=JSON.parse(text)}catch{j={verdict:'Error',output:'',error:text||r.statusText,durationMs:0}} const body=(j.error?`### Error\n\n\`\`\`text\n${j.error}\n\`\`\`\n\n`:'')+`### Output\n\n\`\`\`text\n${j.output}\n\`\`\`\n\n**Time:** ${j.durationMs}ms`; setVerdict(j.verdict); setOut(body); if(mode==='submit'&&j.verdict==='Accepted'&&problem){markSolved(problem)}}
  return <div className="min-h-screen app-shell">
    <header className="glass sticky top-0 z-20 px-5 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3"><div className="go-logo-wrap"><img src="/go-logo.svg" alt="Go" /></div><div><h1 className="text-xl font-semibold tracking-[-.03em]">PracDaGo</h1><p className="text-xs muted">book-first Go practice</p></div></div>
      <div className="hidden md:flex items-center gap-3 text-sm muted"><span>{judgeCount} judgeable</span><span>·</span><span>{solved.length}/{store.problems.length} solved</span><div className="w-36 h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full progressbar" style={{width:progress+'%'}}/></div><span>{progress}%</span></div>
    </header>
    <div className="grid grid-cols-[320px_1fr] gap-3 p-3">
      <aside className="panel p-3 h-[calc(100vh-76px)] overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 surface px-3 mb-2"><Search size={15} className="muted"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search" className="bg-transparent outline-none py-2.5 w-full text-sm"/></div>
        <select value={chapter} onChange={e=>setChapter(e.target.value)} className="w-full surface p-2.5 mb-2 outline-none text-sm"><option value="all">All chapters</option>{store.chapters.map(c=><option key={c.id} value={c.id}>{c.id.toUpperCase().replace('CH','Ch ')} · {c.title}</option>)}</select>
        <div className="grid grid-cols-3 gap-1 mb-3"><button onClick={()=>setMode('all')} className={`mini ${mode==='all'?'active':''}`}>All</button><button onClick={()=>setMode('judge')} className={`mini ${mode==='judge'?'active':''}`}>Judge</button><button onClick={()=>setMode('project')} className={`mini ${mode==='project'?'active':''}`}>Project</button></div>
        <div className="side-stats"><div><b>{filtered.length}</b><span>shown</span></div><div><b>{judgeCount}</b><span>judge</span></div><div><b>{store.problems.length-judgeCount}</b><span>projects</span></div></div>
        <div className="space-y-1.5 overflow-auto scrollbar pr-1">{filtered.map(p=><button key={p.id} onClick={()=>select(p)} className={`problem-row ${p.id===pid?'problem-active':'bg-white/[.018] hover:bg-white/[.045]'}`}><div className="flex justify-between gap-2"><span className="truncate"><span className="muted">{p.number}.</span> {p.title.replace(/^Exercise \d+\.\d+: /,'')}</span>{solved.includes(p.id)&&<CheckCircle2 size={15} className="text-emerald-400 shrink-0"/>}</div><div className="text-[11px] opacity-60 mt-1 truncate">{chipText(p)} · {p.tags.slice(0,2).join(', ')}</div></button>)}</div>
      </aside>
      <main className="grid grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-3 h-[calc(100vh-76px)] min-w-0 overflow-hidden">{problem&&<>
        <section className="panel overflow-hidden flex flex-col min-w-0"><div className="px-5 py-4 border-b border-white/[.06]"><div className="flex items-center gap-2 muted text-sm"><BookOpen size={16}/>Exercise workspace</div><h2 className="text-2xl font-semibold tracking-[-.04em] mt-2">{problem.title}</h2><div className="flex flex-wrap gap-1.5 mt-3"><span className="chip">{problem.exerciseMode==='judge'?'Local judge':'Project-style'}</span>{problem.tags.slice(0,4).map(t=><span className="chip" key={t}>{t}</span>)}</div><div className="flex flex-wrap gap-1.5 mt-3">{flowTabs.map(t=><button key={t.id} className={`tab ${tab===t.id?'active':''}`} onClick={()=>setTab(t.id)}>{t.label}</button>)}</div></div>
          <div className="p-5 overflow-auto scrollbar prose markdown-body">{md(flowContent(problem,tab))}</div></section>
        <section className="panel overflow-hidden flex flex-col min-w-0"><div className="p-3 flex gap-2 justify-between border-b border-white/[.06]"><div><div className="font-medium">{needsFiles?'File workspace':'Go editor'}</div><div className="text-xs muted">{needsFiles?'Upload sample input files for this exercise':canSubmitProblem?'Drafts save locally':'Manual project completion'}</div></div><div className="flex gap-2">{needsFiles&&<label className="btn2 cursor-pointer"><Upload size={15} className="inline"/> Upload<input type="file" multiple className="hidden" onChange={e=>addFiles(e.target.files)}/></label>}<button className="btn2" onClick={()=>run('run')}><Play size={15} className="inline"/> Run</button>{canSubmitProblem?<button className="btn" onClick={()=>run('submit')}><Send size={15} className="inline"/> Submit</button>:<button className="btn" onClick={markComplete}><CheckCircle2 size={15} className="inline"/> {solved.includes(problem.id)?'Completed':proofReady?'Mark complete':'Proof checklist'}</button>}</div></div>{needsFiles?<div className="flex-1 overflow-auto scrollbar p-4 file-workspace"><div className="drop-card"><Upload size={28}/><h3>Upload input files</h3><p>For file-based book exercises, upload sample files here instead of treating it like a pure LeetCode prompt. Files are saved in browser localStorage for this exercise.</p><label className="btn cursor-pointer mt-3 inline-flex">Choose files<input type="file" multiple className="hidden" onChange={e=>addFiles(e.target.files)}/></label></div>{uploaded.length>0&&<div className="mt-4 space-y-3"><div className="flex items-center justify-between"><b>{uploaded.length} uploaded</b><button className="mini" onClick={clearFiles}>Clear</button></div>{uploaded.map((f,i)=><div key={i} className="file-card"><div className="flex items-center gap-2 mb-2"><FileText size={16}/><b>{f.name}</b><span className="muted text-xs">{f.text.length} chars</span></div><pre>{f.text.slice(0,2000)}{f.text.length>2000?'\n...':''}</pre></div>)}</div>}<div className="mt-4"><div className="text-sm muted mb-2">Optional Go draft</div><div className="h-64 rounded-xl overflow-hidden border border-white/[.06]"><Editor height="100%" defaultLanguage="go" theme="vs-dark" value={code} onChange={saveDraft} options={{fontSize:14,fontFamily:'JetBrains Mono, monospace',minimap:{enabled:false},scrollBeyondLastLine:false,renderLineHighlight:'all',padding:{top:16}}}/></div></div></div>:<div className="flex-1"><Editor height="100%" defaultLanguage="go" theme="vs-dark" value={code} onChange={saveDraft} options={{fontSize:14,fontFamily:'JetBrains Mono, monospace',minimap:{enabled:false},scrollBeyondLastLine:false,renderLineHighlight:'all',padding:{top:16}}}/></div>}<div className="h-52 border-t border-white/[.06] p-3 overflow-auto bg-black/70 markdown-body output"><div className={`verdict ${verdict==='Accepted'?'ok':verdict==='Error'?'bad':''}`}>{verdict||'Output'}</div>{out?md(out):md(needsFiles?"Upload files to preview them here. Use Run for optional Go drafts.":canSubmitProblem?"Run code to see formatted output. Submit runs this exercise against local tests.":"Use Run mode to produce a reproducible proof, then open the proof checklist before marking this project complete.")}</div></section>
      </>}</main>
    </div>
  </div>
}
export default App
