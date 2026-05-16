import {useEffect,useMemo,useState} from 'react';
import {errorMessage,fetchJson,getBrowserStorage,readJsonStorage,readTextStorage,removeStorageItem,writeJsonStorage,writeTextStorage} from './appState';
import LearningPanel from './components/LearningPanel';
import ProblemNav from './components/ProblemNav';
import Topbar from './components/Topbar';
import WorkPanel from './components/WorkPanel';
import {API,buildOutputComparison,buildRunMarkdown,canSubmit,problemNeedsFiles} from './problemContent';
import type {FlowTab,OutputComparison,Problem,ProblemFilterMode,RunMode,RunResp,Store,Theme,UploadedFile} from './types';
import './index.css';

function isStringArray(value:unknown):value is string[]{
  return Array.isArray(value)&&value.every(item=>typeof item==='string');
}

function isUploadedFiles(value:unknown):value is UploadedFile[]{
  return Array.isArray(value)&&value.every(item=>!!item&&typeof item==='object'&&typeof (item as UploadedFile).name==='string'&&typeof (item as UploadedFile).text==='string');
}

function App(){
  const [store,setStore]=useState<Store>({chapters:[],problems:[]});
  const [pid,setPid]=useState('');
  const [query,setQuery]=useState('');
  const [chapter,setChapter]=useState('all');
  const [mode,setMode]=useState<ProblemFilterMode>('all');
  const [code,setCode]=useState('');
  const [out,setOut]=useState('');
  const [comparison,setComparison]=useState<OutputComparison|null>(null);
  const [verdict,setVerdict]=useState('');
  const [tab,setTab]=useState<FlowTab>('explanation');
  const [uploaded,setUploaded]=useState<UploadedFile[]>([]);
  const [proofReady,setProofReady]=useState(false);
  const [solved,setSolved]=useState<string[]>(()=>readJsonStorage(getBrowserStorage(),'solved',[],isStringArray));
  const [loadError,setLoadError]=useState('');
  const [runningMode,setRunningMode]=useState<RunMode|''>('');
  const [theme,setTheme]=useState<Theme>(()=>readTextStorage(getBrowserStorage(),'theme','dark')==='light'?'light':'dark');

  useEffect(()=>{
    fetchJson<Store>(API+'/api/problems',undefined,'Problem list')
      .then(s=>{
        setStore(s);
        setPid(s.problems[0]?.id||'');
        setCode(s.problems[0]?.starterCode||'');
        setLoadError('');
      })
      .catch(error=>setLoadError(errorMessage(error)));
  },[]);

  useEffect(()=>{
    if(typeof document==='undefined') return;
    document.documentElement.dataset.theme=theme;
    document.documentElement.style.setProperty('color-scheme',theme);
    writeTextStorage(getBrowserStorage(),'theme',theme);
  },[theme]);

  const problem=store.problems.find(p=>p.id===pid);
  const canSubmitProblem=!!problem&&canSubmit(problem);
  const progress=Math.round((solved.length/Math.max(store.problems.length,1))*100);
  const judgeCount=store.problems.filter(p=>p.exerciseMode==='judge').length;
  const needsFiles=!!problem&&problemNeedsFiles(problem);
  const filtered=useMemo(()=>store.problems.filter(p=>(chapter==='all'||p.chapter===chapter)&&(mode==='all'||p.exerciseMode===mode)&&problemMatchesQuery(p,query)),[store,query,chapter,mode]);

  function select(p:Problem){
    const storage=getBrowserStorage();
    setPid(p.id);
    setCode(readTextStorage(storage,'draft:'+p.id,p.starterCode));
    setUploaded(readJsonStorage(storage,'files:'+p.id,[],isUploadedFiles));
    setProofReady(false);
    setOut('');
    setComparison(null);
    setVerdict('');
    setTab('explanation');
  }

  function selectById(id:string){
    const next=store.problems.find(p=>p.id===id);
    if(next) select(next);
  }

  function saveDraft(value:string|undefined){
    const nextCode=value||'';
    setCode(nextCode);
    if(problem) writeTextStorage(getBrowserStorage(),'draft:'+problem.id,nextCode);
  }

  function resetDraft(){
    if(!problem||runningMode) return;
    if(!window.confirm('Reset editor to the starter code? Your current draft will be lost.')) return;
    setCode(problem.starterCode);
    removeStorageItem(getBrowserStorage(),'draft:'+problem.id);
    setOut('');
    setComparison(null);
    setVerdict('');
  }

  async function addFiles(list:FileList|null){
    if(!problem||!list||runningMode) return;
    const files=await Promise.all(Array.from(list).map(async file=>({name:file.name,text:await file.text()})));
    const next=[...uploaded,...files];
    setUploaded(next);
    writeJsonStorage(getBrowserStorage(),'files:'+problem.id,next);
    setComparison(null);
    setOut(`### Uploaded files\n\n${next.map(file=>`- **${file.name}** (${file.text.length} chars)`).join('\n')}\n\nUse these as your sample inputs while solving this file-based exercise.`);
    setVerdict('Files ready');
  }

  function clearFiles(){
    if(!problem) return;
    setUploaded([]);
    removeStorageItem(getBrowserStorage(),'files:'+problem.id);
    setOut('');
    setComparison(null);
    setVerdict('');
  }

  function markSolved(p:Problem){
    const next=[...new Set([...solved,p.id])];
    setSolved(next);
    writeJsonStorage(getBrowserStorage(),'solved',next);
  }

  function toggleTheme(){
    setTheme(current=>current==='dark'?'light':'dark');
  }

  function showProjectChecklist(){
    if(!problem) return;
    setProofReady(true);
    setComparison(null);
    setVerdict('Proof checklist');
    setOut(`### Manual completion checklist\n\nBefore marking this project complete, keep a short reproducible proof:\n\n- The command or Run-mode input you used.\n- Any sample file or argument needed by the exercise.\n- The observed output or behavior.\n- A one-sentence note connecting the result to the exercise goal.\n\nProject exercises are not accepted by hidden tests. They are marked complete locally after you have reviewed this checklist.`);
  }

  function markComplete(){
    if(!problem||runningMode) return;
    if(canSubmit(problem)) return;
    if(!proofReady){
      showProjectChecklist();
      return;
    }
    if(!solved.includes(problem.id)) markSolved(problem);
    setComparison(null);
    setVerdict('Marked complete');
    setOut(`### Marked complete locally\n\n${problem.title} is now recorded in browser localStorage as complete.\n\nKeep your proof command, sample input, and observed output with your notes so you can revisit the project later.`);
  }

  async function run(runMode:RunMode){
    if(runMode==='submit'&&(!problem||!canSubmit(problem))){
      showProjectChecklist();
      return;
    }
    if(!problem||runningMode) return;

    setRunningMode(runMode);
    setComparison(null);
    setVerdict('Running...');
    setOut('');

    try{
      const response=await fetchJson<RunResp>(API+'/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({problemId:pid,code,mode:runMode})},'Run request');
      setVerdict(response.verdict);
      setOut(buildRunMarkdown(response));
      setComparison(buildOutputComparison(problem,runMode,response));
      if(runMode==='submit'&&response.verdict==='Accepted') markSolved(problem);
    }catch(error){
      setVerdict('Error');
      setComparison(null);
      setOut(`### Request failed\n\n${errorMessage(error)}`);
    }finally{
      setRunningMode('');
    }
  }

  return <div className="app-shell">
    <Topbar theme={theme} judgeCount={judgeCount} solvedCount={solved.length} totalCount={store.problems.length} progress={progress} onToggleTheme={toggleTheme}/>
    <div className="workspace-layout">
      <ProblemNav store={store} filtered={filtered} pid={pid} query={query} chapter={chapter} mode={mode} judgeCount={judgeCount} solved={solved} onQuery={setQuery} onChapter={setChapter} onMode={setMode} onSelect={select} onSelectById={selectById}/>
      <main className="workspace-main">{problem?<>
        <LearningPanel problem={problem} tab={tab} onTab={setTab}/>
        <WorkPanel
          needsFiles={needsFiles}
          canSubmitProblem={canSubmitProblem}
          code={code}
          theme={theme}
          runningMode={runningMode}
          uploaded={uploaded}
          proofReady={proofReady}
          solved={solved.includes(problem.id)}
          verdict={verdict}
          output={out}
          comparison={comparison}
          onSaveDraft={saveDraft}
          onResetDraft={resetDraft}
          onAddFiles={addFiles}
          onClearFiles={clearFiles}
          onRun={run}
          onMarkComplete={markComplete}
        />
      </>:<section className="learning-panel"><div className="content-scroll markdown-body scrollbar"><h3>{loadError?'Unable to load exercises':'Loading exercises'}</h3><p>{loadError||'Fetching the problem catalog from the backend.'}</p></div></section>}</main>
    </div>
  </div>;
}

function problemMatchesQuery(p:Problem,query:string){
  const needle=query.toLowerCase();
  return (p.title+p.tags.join(' ')+p.statement+(p.problemText||'')+(p.explanation||'')+(p.howItWorks||'')+(p.syntax||'')+(p.solve||'')+(p.lesson||'')+(p.approach||'')).toLowerCase().includes(needle);
}

export default App;
