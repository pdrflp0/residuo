/**
 * Relatório HTML compartilhável (nível 3): um único arquivo, sem nenhum recurso externo,
 * para anexar numa issue, num PR ou mandar por e-mail. Mostra a linha do tempo clicável,
 * a evidência de cada etapa e o veredito.
 *
 * Segurança: os dados vão embutidos como JSON escapado (sem "</script>" possível) e todo
 * texto é inserido com textContent. Respostas de sistemas de terceiros nunca viram HTML.
 */
import type { ReportV1 } from '@residuo/contracts';
import { describeStep } from './narrative';

const LANE_NAME: Record<string, string> = {
  api: 'API',
  client: 'Cliente offline',
  consumer: 'Consumidor',
  ops: 'Operação',
  observer: 'Observador',
};
const LANE_ORDER = ['api', 'client', 'consumer', 'ops', 'observer'];
const VERDICT_LABEL: Record<string, string> = {
  VIOLATION: 'Violação: o registro excluído voltou',
  NO_VIOLATION_OBSERVED: 'Nenhuma violação observada',
  INCONCLUSIVE: 'Inconclusivo',
  POLICY_ALLOWED: 'Permitido pela política',
};

export function renderHtml(report: ReportV1): string {
  const verdict = report.verdict;
  const lanes = LANE_ORDER.filter((l) => report.steps.some((s) => s.lane === l)).map((id) => ({ id, name: LANE_NAME[id] ?? id }));
  const data = {
    title: report.scenario.title,
    scenario: `${report.scenario.id} v${report.scenario.version}`,
    disclaimer: report.disclaimer,
    generatedAt: report.generatedAt,
    run: {
      id: report.run.id,
      mode: report.run.config.mode,
      policy: report.run.config.policy,
      seed: report.run.config.seed,
      entityId: report.run.entityId,
      adapter: `${report.run.adapter.name} v${report.run.adapter.version}`,
      engine: report.run.engineVersion,
    },
    verdict: verdict
      ? {
          result: verdict.result,
          label: VERDICT_LABEL[verdict.result],
          summary: verdict.summary,
          reasons: verdict.inconclusiveReasons,
          confirmationSeq: verdict.confirmationSeq ?? null,
          violations: verdict.violations.map((v) => ({ seq: v.observedAtSeq, cause: v.causedBySeq ?? null, text: v.explanation })),
          allowances: verdict.allowances.map((a) => ({ seq: a.observedAtSeq, text: a.explanation })),
        }
      : null,
    lanes,
    steps: report.steps.map((s) => {
      const n = describeStep(s, verdict);
      return {
        seq: s.seq,
        lane: s.lane,
        title: s.title,
        status: s.status,
        tone: n.tone,
        headline: n.headline,
        code: s.exchange?.response?.status ?? null,
        request: s.exchange ? `${s.exchange.request.method} ${s.exchange.request.path}` : null,
        requestBody: s.exchange?.request.body ?? null,
        responseBody: s.exchange?.response?.body ?? null,
        facts: s.facts,
        error: s.error ?? null,
      };
    }),
    ai: report.aiSummary
      ? { model: report.aiSummary.model, headline: report.aiSummary.headline, findings: report.aiSummary.findings, nextSteps: report.aiSummary.nextSteps }
      : null,
    limits: report.limits,
    reproduce: report.reproduce.cli,
  };
  const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const title = escapeHtml(`Resíduo — ${report.scenario.title}`);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Resíduo">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
<main>
  <header>
    <p class="eyebrow">Relatório Resíduo · <span id="scenario"></span></p>
    <h1 id="title"></h1>
    <p class="muted small" id="disclaimer"></p>
  </header>
  <section id="verdict" class="verdict" aria-live="polite"></section>
  <section id="ai" class="panel" hidden aria-labelledby="ai-title">
    <h2 id="ai-title">Resumo gerado por IA</h2>
    <p class="muted small" id="ai-note"></p>
    <p id="ai-headline"></p>
    <ul id="ai-findings"></ul>
    <p class="small muted" id="ai-next-title" hidden>O que investigar:</p>
    <ul id="ai-next"></ul>
  </section>
  <dl id="config" class="config"></dl>
  <section class="panel">
    <h2>Linha do tempo</h2>
    <p class="muted small">Clique numa etapa (ou use as setas) para ver a evidência. Depois da confirmação da exclusão, a área fica vigiada.</p>
    <div class="scroll"><div id="timeline" class="timeline" role="group" aria-label="Linha do tempo"></div></div>
  </section>
  <section class="panel" id="evidence" aria-live="polite"></section>
  <section class="panel">
    <h2>Limites desta evidência</h2>
    <ul id="limits"></ul>
    <h2>Como reproduzir</h2>
    <pre id="reproduce"></pre>
  </section>
  <footer class="muted small">Gerado em <span id="generated"></span>. Dados sintéticos; campos sensíveis são mascarados na captura.</footer>
</main>
<script type="application/json" id="data">${json}</script>
<script>${JS}</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

const CSS = `
:root{--paper:#f5f3ee;--panel:#fff;--ink:#1b1a17;--ink2:#47453f;--ink3:#75726a;--rule:#e0dcd2;
--live:#1d7350;--liveBg:#e5f1ea;--deleted:#5c5952;--deletedBg:#ebe8e1;--conflict:#9c5600;--conflictBg:#fbefd9;
--reappeared:#b42318;--reappearedBg:#fde8e5;--new:#2454a6;--newBg:#e6eefb;--restored:#0d6b67;--restoredBg:#def1ef;
--failure:#51508a;--failureBg:#ebeaf6;--neutral:#75726a;--neutralBg:#f1efe9}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:28px 16px 48px}h1{font-size:26px;margin:4px 0}h2{font-size:17px;margin:0 0 8px}
.eyebrow{font:12px ui-monospace,Menlo,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3);margin:0}
.muted{color:var(--ink3)}.small{font-size:13px}
.panel{background:var(--panel);border:1px solid var(--rule);border-radius:10px;padding:16px 18px;margin-top:16px}
.verdict{margin-top:16px;padding:16px 18px;border-radius:10px;background:var(--panel);border:1px solid var(--rule);box-shadow:inset 4px 0 0 var(--c)}
.verdict h2{color:var(--c);font-size:20px}.verdict ul{margin:8px 0 0;padding-left:18px}
.config{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 0}.config div{background:var(--panel);border:1px solid var(--rule);border-radius:999px;padding:2px 10px;font:12px ui-monospace,Menlo,monospace}
.config dt{display:inline;color:var(--ink3)}.config dd{display:inline;margin:0 0 0 4px}
.scroll{overflow-x:auto}.timeline{display:grid;gap:0;min-width:760px;position:relative}
.lane{grid-column:1;font-weight:600;font-size:13px;padding:10px 8px 10px 0;border-top:1px solid var(--rule);display:flex;align-items:center}
.track{border-top:1px solid var(--rule)}.head{font:11px ui-monospace,Menlo,monospace;color:var(--ink3);text-align:center;padding-bottom:6px}
.zone{background:repeating-linear-gradient(-45deg,rgba(180,35,24,.05) 0 10px,transparent 10px 20px);border-left:2px dashed rgba(180,35,24,.5)}
.cell{padding:6px 4px;display:flex;align-items:center;z-index:1}
.node{width:100%;text-align:left;font:inherit;font-size:12px;padding:7px 8px;border-radius:8px;background:var(--panel);border:1px solid var(--rule);cursor:pointer;border-left:4px solid var(--c)}
.node[aria-pressed=true]{outline:2px solid var(--c);outline-offset:1px}.node b{display:block;font-size:12.5px}
.node span{font:11px ui-monospace,Menlo,monospace;color:var(--c);overflow-wrap:anywhere}
.t-live{--c:var(--live);--bg:var(--liveBg)}.t-deleted{--c:var(--deleted);--bg:var(--deletedBg)}.t-conflict{--c:var(--conflict);--bg:var(--conflictBg)}
.t-reappeared{--c:var(--reappeared);--bg:var(--reappearedBg)}.t-new{--c:var(--new);--bg:var(--newBg)}.t-restored{--c:var(--restored);--bg:var(--restoredBg)}
.t-failure{--c:var(--failure);--bg:var(--failureBg)}.t-neutral,.t-skipped{--c:var(--neutral);--bg:var(--neutralBg)}
.callout{padding:10px 12px;border-radius:8px;background:var(--bg);border:1px solid var(--rule);margin:8px 0}
.cite{font:11px ui-monospace,Menlo,monospace;margin-left:6px;padding:1px 6px;border-radius:999px;border:1px solid var(--rule);background:var(--paper);cursor:pointer;color:var(--ink2)}
#ai-headline{font-weight:600}#ai li{margin:4px 0}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}pre{margin:0;padding:10px;background:#faf9f6;border:1px solid var(--rule);border-radius:8px;overflow:auto;max-height:300px;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word}
table{border-collapse:collapse;font:12px ui-monospace,Menlo,monospace}td{padding:2px 12px 2px 0;vertical-align:top}td:first-child{color:var(--ink3)}
:focus-visible{outline:2px solid #2457c5;outline-offset:2px}
@media (max-width:700px){.grid2{grid-template-columns:1fr}}
`;

const JS = `
(function(){
var D=JSON.parse(document.getElementById('data').textContent);
function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=String(text);return e;}
function txt(id,v){document.getElementById(id).textContent=v;}
txt('title',D.title);txt('scenario',D.scenario);txt('disclaimer',D.disclaimer);txt('generated',D.generatedAt);txt('reproduce',D.reproduce);
var tone={VIOLATION:'t-reappeared',NO_VIOLATION_OBSERVED:'t-live',INCONCLUSIVE:'t-failure',POLICY_ALLOWED:'t-new'};
var v=document.getElementById('verdict');
if(D.verdict){v.className='verdict '+tone[D.verdict.result];v.appendChild(el('p','eyebrow',D.verdict.result));v.appendChild(el('h2',null,D.verdict.label));v.appendChild(el('p',null,D.verdict.summary));
 if(D.verdict.reasons.length>1){var ul=el('ul');D.verdict.reasons.slice(1).forEach(function(r){ul.appendChild(el('li',null,r));});v.appendChild(ul);}}
else{v.appendChild(el('h2',null,'Execução sem veredito'));}
var cfg=document.getElementById('config');
[['execução',D.run.id],['modo',D.run.mode],['política',D.run.policy],['semente',D.run.seed],['registro',D.run.entityId],['adapter',D.run.adapter],['engine','v'+D.run.engine]].forEach(function(p){var d=el('div');d.appendChild(el('dt',null,p[0]));d.appendChild(el('dd',null,p[1]));cfg.appendChild(d);});
D.limits.forEach(function(l){document.getElementById('limits').appendChild(el('li',null,l));});
var tl=document.getElementById('timeline');var n=D.steps.length;
tl.style.gridTemplateColumns='120px repeat('+n+',minmax(96px,1fr))';
D.steps.forEach(function(s,i){var h=el('div','head',('0'+s.seq).slice(-2));h.style.gridColumn=i+2;h.style.gridRow=1;tl.appendChild(h);});
D.lanes.forEach(function(l,li){var a=el('div','lane',l.name);a.style.gridRow=li+2;tl.appendChild(a);var t=el('div','track');t.style.gridRow=li+2;t.style.gridColumn='2 / '+(n+2);tl.appendChild(t);});
var cs=D.verdict&&D.verdict.confirmationSeq;
if(cs&&cs<n){var z=el('div','zone');z.style.gridRow='2 / '+(D.lanes.length+2);z.style.gridColumn=(cs+2)+' / '+(n+2);tl.appendChild(z);}
var buttons=[];
D.steps.forEach(function(s,i){var c=el('div','cell');c.style.gridColumn=i+2;c.style.gridRow=D.lanes.findIndex(function(l){return l.id===s.lane;})+2;
 var b=el('button','node t-'+s.tone);b.type='button';b.setAttribute('aria-pressed','false');b.setAttribute('aria-label','Etapa '+s.seq+': '+s.title+'. '+s.headline);
 b.appendChild(el('b',null,s.title));b.appendChild(el('span',null,(s.code!=null?s.code+' · ':'')+(s.facts.writeOutcome||s.facts.confirmationStatus||(s.facts.visible===true?'visível':s.facts.visible===false?'ausente':s.status))));
 b.addEventListener('click',function(){select(i);});b.addEventListener('keydown',function(e){if(e.key==='ArrowRight'&&i<n-1){e.preventDefault();select(i+1,true);}if(e.key==='ArrowLeft'&&i>0){e.preventDefault();select(i-1,true);}});
 c.appendChild(b);tl.appendChild(c);buttons.push(b);});
function pre(v){return el('pre',null,v==null?'(sem corpo)':JSON.stringify(v,null,2));}
function select(i,focus){buttons.forEach(function(b,j){b.setAttribute('aria-pressed',String(i===j));b.tabIndex=i===j?0:-1;});if(focus)buttons[i].focus();
 var s=D.steps[i];var ev=document.getElementById('evidence');ev.textContent='';
 ev.appendChild(el('p','eyebrow','etapa '+s.seq+' · '+(D.lanes.find(function(l){return l.id===s.lane;})||{name:s.lane}).name));ev.appendChild(el('h2',null,s.title));
 ev.appendChild(el('div','callout t-'+s.tone,s.headline));
 if(D.verdict){D.verdict.violations.filter(function(x){return x.seq===s.seq;}).forEach(function(x){ev.appendChild(el('div','callout t-reappeared',x.text));});
  D.verdict.allowances.filter(function(x){return x.seq===s.seq;}).forEach(function(x){ev.appendChild(el('div','callout t-new',x.text));});}
 if(s.error)ev.appendChild(el('div','callout t-failure',s.error));
 var tb=el('table');Object.keys(s.facts).forEach(function(k){var tr=el('tr');tr.appendChild(el('td',null,k));tr.appendChild(el('td',null,typeof s.facts[k]==='object'?JSON.stringify(s.facts[k]):s.facts[k]));tb.appendChild(tr);});
 ev.appendChild(el('h2',null,'Fatos extraídos'));ev.appendChild(tb);
 if(s.request){var g=el('div','grid2');var a=el('div');a.appendChild(el('p','small muted',s.request));a.appendChild(pre(s.requestBody));var r=el('div');r.appendChild(el('p','small muted','HTTP '+(s.code==null?'—':s.code)));r.appendChild(pre(s.responseBody));g.appendChild(a);g.appendChild(r);ev.appendChild(el('h2',null,'Troca HTTP'));ev.appendChild(g);}}
if(D.ai){var ai=document.getElementById('ai');ai.hidden=false;
 txt('ai-note','Escrito por '+D.ai.model+' a partir das evidências desta execução. Não decide o veredito acima. Cada afirmação cita as etapas usadas, e as citações foram conferidas.');
 txt('ai-headline',D.ai.headline);
 function item(f,list){var li=el('li',null,f.text);f.steps.forEach(function(seq){var b=el('button','cite','etapa '+seq);b.type='button';
  b.addEventListener('click',function(){var k=D.steps.findIndex(function(s){return s.seq===seq;});if(k>=0){select(k,true);document.getElementById('evidence').scrollIntoView();}});li.appendChild(b);});list.appendChild(li);}
 D.ai.findings.forEach(function(f){item(f,document.getElementById('ai-findings'));});
 if(D.ai.nextSteps.length){document.getElementById('ai-next-title').hidden=false;D.ai.nextSteps.forEach(function(f){item(f,document.getElementById('ai-next'));});}}
var start=D.verdict&&D.verdict.violations.length?D.steps.findIndex(function(s){return s.seq===D.verdict.violations[0].seq;}):n-1;
select(Math.max(0,start));
})();
`;
