import Editor from '@monaco-editor/react';
import {CheckCircle2,FileText,Play,RotateCcw,Send,Upload} from 'lucide-react';
import type {OutputComparison,RunMode,Theme,UploadedFile} from '../types';
import OutputPanel from './OutputPanel';

type Props={
  needsFiles:boolean;
  canSubmitProblem:boolean;
  code:string;
  theme:Theme;
  runningMode:RunMode|'';
  uploaded:UploadedFile[];
  proofReady:boolean;
  solved:boolean;
  verdict:string;
  output:string;
  comparison:OutputComparison|null;
  onSaveDraft:(value:string|undefined)=>void;
  onResetDraft:()=>void;
  onAddFiles:(files:FileList|null)=>void;
  onClearFiles:()=>void;
  onRun:(mode:RunMode)=>void;
  onMarkComplete:()=>void;
}

function WorkPanel({needsFiles,canSubmitProblem,code,theme,runningMode,uploaded,proofReady,solved,verdict,output,comparison,onSaveDraft,onResetDraft,onAddFiles,onClearFiles,onRun,onMarkComplete}:Props){
  const editorTheme=theme==='dark'?'vs-dark':'vs';
  const emptyMessage=needsFiles
    ? 'Upload files to preview them here. Use Run for optional Go drafts.'
    : canSubmitProblem
      ? 'Run code to see formatted output. Submit runs this exercise against local tests.'
      : 'Use Run mode to produce a reproducible proof, then open the proof checklist before marking this project complete.';

  return <section className="work-panel">
    <div className="editor-toolbar">
      <div><b>{needsFiles?'File workspace':'Go editor'}</b><span>{needsFiles?'Upload sample input files for this exercise':canSubmitProblem?'Drafts save locally':'Manual project completion'}</span></div>
      <div className="run-actions">
        {needsFiles&&<label className={`btn2 ${runningMode?'disabled':''} cursor-pointer`}><Upload size={15}/> Upload<input type="file" multiple className="hidden" disabled={!!runningMode} onChange={e=>onAddFiles(e.target.files)}/></label>}
        <button type="button" className="btn2" disabled={!!runningMode} onClick={onResetDraft}><RotateCcw size={15}/> Reset</button>
        <button type="button" className="btn2" disabled={!!runningMode} onClick={()=>onRun('run')}><Play size={15}/> {runningMode==='run'?'Running...':'Run'}</button>
        {canSubmitProblem
          ? <button type="button" className="btn" disabled={!!runningMode} onClick={()=>onRun('submit')}><Send size={15}/> {runningMode==='submit'?'Submitting...':'Submit'}</button>
          : <button type="button" className="btn" disabled={!!runningMode} onClick={onMarkComplete}><CheckCircle2 size={15}/> {solved?'Completed':proofReady?'Mark complete':'Proof checklist'}</button>}
      </div>
    </div>
    {needsFiles?<div className="file-workspace scrollbar">
      <div className="drop-card">
        <Upload size={28}/>
        <h3>Upload input files</h3>
        <p>For file-based book exercises, upload sample files here instead of treating it like a pure LeetCode prompt. Files are saved in browser localStorage for this exercise.</p>
        <label className={`btn ${runningMode?'disabled':''} cursor-pointer mt-3 inline-flex`}>Choose files<input type="file" multiple className="hidden" disabled={!!runningMode} onChange={e=>onAddFiles(e.target.files)}/></label>
      </div>
      {uploaded.length>0&&<div className="uploaded-files">
        <div className="uploaded-head"><b>{uploaded.length} uploaded</b><button type="button" onClick={onClearFiles}>Clear</button></div>
        {uploaded.map((file,index)=><div key={`${file.name}-${index}`} className="file-card">
          <div><FileText size={16}/><b>{file.name}</b><span>{file.text.length} chars</span></div>
          <pre>{file.text.slice(0,2000)}{file.text.length>2000?'\n...':''}</pre>
        </div>)}
      </div>}
      <div className="optional-editor">
        <span>Optional Go draft</span>
        <div className="editor-frame compact">
          <Editor height="100%" defaultLanguage="go" theme={editorTheme} value={code} onChange={onSaveDraft} options={{fontSize:14,fontFamily:'JetBrains Mono, monospace',minimap:{enabled:false},scrollBeyondLastLine:false,renderLineHighlight:'all',padding:{top:16}}}/>
        </div>
      </div>
    </div>:<div className="editor-frame">
      <Editor height="100%" defaultLanguage="go" theme={editorTheme} value={code} onChange={onSaveDraft} options={{fontSize:14,fontFamily:'JetBrains Mono, monospace',minimap:{enabled:false},scrollBeyondLastLine:false,renderLineHighlight:'all',padding:{top:16}}}/>
    </div>}
    <OutputPanel verdict={verdict} output={output} emptyMessage={emptyMessage} comparison={comparison}/>
  </section>;
}

export default WorkPanel;
