package main

import (
  "bytes"; "context"; "encoding/json"; "errors"; "fmt"; "io"; "net/http"; "os"; "os/exec"; "path/filepath"; "strings"; "time"
)

type Store struct { Chapters []Chapter `json:"chapters"`; Problems []Problem `json:"problems"` }
type Chapter struct { ID string `json:"id"`; Title string `json:"title"` }
type Example struct { Input string `json:"input"`; Output string `json:"output"` }
type Problem struct { ID string `json:"id"`; Number int `json:"number"`; Title string `json:"title"`; Chapter string `json:"chapter"`; Difficulty string `json:"difficulty"`; Tags []string `json:"tags"`; Statement string `json:"statement"`; Explanation string `json:"explanation"`; Hints []string `json:"hints"`; StarterCode string `json:"starterCode"`; SolutionCode string `json:"solutionCode"`; TestCode string `json:"testCode"`; Examples []Example `json:"examples"` }
type RunReq struct { ProblemID string `json:"problemId"`; Code string `json:"code"`; Mode string `json:"mode"` }
type RunResp struct { Verdict string `json:"verdict"`; Output string `json:"output"`; Error string `json:"error,omitempty"`; DurationMS int64 `json:"durationMs"` }
var store Store

func main(){
  if err:=loadStore(); err!=nil { panic(err) }
  mux:=http.NewServeMux(); mux.HandleFunc("/api/health", cors(health)); mux.HandleFunc("/api/problems", cors(problems)); mux.HandleFunc("/api/problems/", cors(problem)); mux.HandleFunc("/api/run", cors(runCode))
  port:=env("PORT","8080"); fmt.Println("GoPrac backend on :"+port); http.ListenAndServe(":"+port,mux)
}
func env(k,d string) string { if v:=os.Getenv(k); v!="" {return v}; return d }
func loadStore() error { b,err:=os.ReadFile("../data/problems.json"); if err!=nil { b,err=os.ReadFile("data/problems.json")}; if err!=nil {return err}; return json.Unmarshal(b,&store) }
func writeJSON(w http.ResponseWriter, v any){ w.Header().Set("Content-Type","application/json"); json.NewEncoder(w).Encode(v) }
func cors(h http.HandlerFunc) http.HandlerFunc { return func(w http.ResponseWriter,r *http.Request){ w.Header().Set("Access-Control-Allow-Origin","*"); w.Header().Set("Access-Control-Allow-Headers","Content-Type"); w.Header().Set("Access-Control-Allow-Methods","GET,POST,OPTIONS"); if r.Method=="OPTIONS" {return}; h(w,r)} }
func health(w http.ResponseWriter,r *http.Request){ writeJSON(w,map[string]string{"ok":"true"}) }
func problems(w http.ResponseWriter,r *http.Request){ if r.URL.Path!="/api/problems" {http.NotFound(w,r);return}; writeJSON(w,store) }
func problem(w http.ResponseWriter,r *http.Request){ id:=strings.TrimPrefix(r.URL.Path,"/api/problems/"); for _,p:=range store.Problems { if p.ID==id {writeJSON(w,p); return} }; http.NotFound(w,r) }
func runCode(w http.ResponseWriter,r *http.Request){ if r.Method!="POST" {http.Error(w,"method",405);return}; var req RunReq; if err:=json.NewDecoder(r.Body).Decode(&req); err!=nil {http.Error(w,err.Error(),400);return}; var p *Problem; for i:=range store.Problems { if store.Problems[i].ID==req.ProblemID { p=&store.Problems[i]; break } }; if p==nil {http.Error(w,"unknown problem",404);return}; start:=time.Now(); out,verr:=execute(req.Code, p.TestCode, req.Mode); resp:=RunResp{Verdict:"Accepted",Output:out,DurationMS:time.Since(start).Milliseconds()}; if verr!=nil {resp.Verdict="Error"; resp.Error=verr.Error()}; writeJSON(w,resp) }
func execute(code, tests, mode string)(string,error){ if !strings.Contains(code,"package main") { code="package main\n"+code }; if mode!="submit" && !strings.Contains(code,"func main()") { code += "\nfunc main(){}\n" }
  dir,err:=os.MkdirTemp("","goprac-*"); if err!=nil {return "",err}; defer os.RemoveAll(dir)
  file:=filepath.Join(dir,"main.go"); if err:=os.WriteFile(file,[]byte(code),0600); err!=nil {return "",err}
  if mode=="submit" { judge := "package main\nimport (\"fmt\"; \"reflect\")\nfunc assertEqual(got, want any){ if !reflect.DeepEqual(got,want){ panic(fmt.Sprintf(\"got %#v, want %#v\", got, want)) } }\n"+tests; if err:=os.WriteFile(filepath.Join(dir,"judge.go"), []byte(judge), 0600); err!=nil {return "",err} }
  ctx,cancel:=context.WithTimeout(context.Background(),3*time.Second); defer cancel(); args:=[]string{"run", file}; if mode=="submit" { args=[]string{"run", file, filepath.Join(dir,"judge.go")} }; cmd:=exec.CommandContext(ctx,"go",args...); cmd.Dir=dir; var buf bytes.Buffer; cmd.Stdout=&buf; cmd.Stderr=&buf
  err=cmd.Run(); if errors.Is(ctx.Err(), context.DeadlineExceeded){return buf.String(),fmt.Errorf("time limit exceeded")}; if err!=nil { return buf.String(), fmt.Errorf("%s", strings.TrimSpace(buf.String())) }
  if buf.Len()==0 { if mode=="submit" { io.WriteString(&buf,"All tests passed.") } else { io.WriteString(&buf,"Compiled and ran successfully. Add fmt.Println calls to inspect sample behavior in Run mode.") } }
  return buf.String(),nil }
