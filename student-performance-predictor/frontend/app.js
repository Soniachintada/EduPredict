const form = document.getElementById('prediction-form');
const message = document.getElementById('form-message');
const predictButton = document.getElementById('predict-button');
const emptyState = document.getElementById('empty-state');
const resultContent = document.getElementById('result-content');

async function loadModelInfo() {
  try {
    const response = await fetch('/api/model-info');
    if (!response.ok) throw new Error('Could not load model details');
    const info = await response.json();
    document.getElementById('training-records').textContent = Number(info.training_records).toLocaleString();
  } catch (error) {
    document.getElementById('training-records').textContent = 'Unavailable';
  }
}

function renderPrediction(data) {
  emptyState.classList.add('hidden');
  resultContent.classList.remove('hidden');

  document.getElementById('predicted-score').textContent = data.predicted_score.toFixed(1);
  document.getElementById('ring-score').textContent = Math.round(data.predicted_score);
  const ring = document.getElementById('score-ring');
  ring.style.background = `conic-gradient(#6759dc ${data.predicted_score * 3.6}deg, #ecebfa 0deg)`;

  document.getElementById('performance-band').textContent = data.performance_band;
  const risk = document.getElementById('risk-level');
  risk.textContent = `${data.risk_level} risk`;
  risk.className = `risk-tag ${data.risk_level.toLowerCase()}`;

  const recommendationList = document.getElementById('recommendations');
  recommendationList.replaceChildren();
  data.recommendations.forEach((recommendation) => {
    const item = document.createElement('li');
    item.textContent = recommendation;
    recommendationList.appendChild(item);
  });

  const factorBars = document.getElementById('factor-bars');
  factorBars.replaceChildren();
  data.overall_factors.forEach((factor) => {
    const row = document.createElement('div');
    row.className = 'factor-row';
    const name = document.createElement('span');
    name.textContent = factor.name;
    const track = document.createElement('div');
    track.className = 'factor-track';
    const fill = document.createElement('div');
    fill.className = 'factor-fill';
    fill.style.width = `${factor.importance}%`;
    track.appendChild(fill);
    const value = document.createElement('span');
    value.className = 'factor-value';
    value.textContent = `${factor.importance}%`;
    row.append(name, track, value);
    factorBars.appendChild(row);
  });
  document.getElementById('disclaimer').textContent = data.disclaimer;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  message.textContent = '';
  predictButton.disabled = true;
  predictButton.textContent = 'Predicting...';

  const payload = {
    study_hours: Number(document.getElementById('study_hours').value),
    attendance: Number(document.getElementById('attendance').value),
    previous_score: Number(document.getElementById('previous_score').value),
    assignments_completed: Number(document.getElementById('assignments_completed').value),
  };

  try {
    const response = await fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Prediction failed. Check the entered values.');
    renderPrediction(data);
  } catch (error) {
    message.textContent = error.message || 'Could not connect to the backend. Please restart the server.';
  } finally {
    predictButton.disabled = false;
    predictButton.innerHTML = 'Predict performance <span>↗</span>';
  }
});

document.getElementById('reset-button').addEventListener('click', () => {
  form.reset();
  message.textContent = '';
  resultContent.classList.add('hidden');
  emptyState.classList.remove('hidden');
});

loadModelInfo();


// My Task Journey — separate from the student-performance ML predictor.
const journeyNav = document.getElementById('journey-nav');
const predictorSections = [...document.querySelectorAll('.main-content > section:not(#task-journey)')];
const journeyPage = document.getElementById('task-journey');
let journeyTasks = []; let selectedTaskId = null; let reminderTimers = new Map();
function showJourney(show) { predictorSections.forEach(el => el.classList.toggle('hidden', show)); journeyPage.classList.toggle('hidden', !show); journeyNav.classList.toggle('active', show); document.querySelector('.nav-item[href="#predict"]').classList.toggle('active', !show); document.querySelector('.breadcrumb strong').textContent = show ? 'My Task Journey' : 'Performance predictor'; if(show) loadTasks(); }
journeyNav.addEventListener('click', e => { e.preventDefault(); showJourney(true); });
document.querySelector('.nav-item[href="#predict"]').addEventListener('click', e => { e.preventDefault(); showJourney(false); });
document.getElementById('add-task-open').addEventListener('click', () => openTaskForm());
const modal = document.getElementById('task-modal'), detail = document.getElementById('task-detail'), taskForm = document.getElementById('task-form');
function openTaskForm(task=null) { detail.classList.add('hidden'); modal.classList.remove('hidden'); taskForm.reset(); document.getElementById('task-id').value=task?.id||''; document.getElementById('task-modal-title').textContent=task?'Edit task':'Create a task'; document.getElementById('task-title').value=task?.title||''; document.getElementById('task-description').value=task?.description||''; document.getElementById('task-category').value=task?.category||'Immediate'; document.getElementById('task-start').value=task?.start_at||''; document.getElementById('task-due').value=task?.due_at||''; document.getElementById('task-reminder').value=String(task?.reminder_minutes||0); }
function closeTaskForm(){modal.classList.add('hidden')}
document.getElementById('task-modal-close').onclick=closeTaskForm; document.getElementById('task-cancel').onclick=closeTaskForm;
document.getElementById('detail-close').onclick=()=>detail.classList.add('hidden');
taskForm.addEventListener('submit', async e=>{e.preventDefault(); const id=document.getElementById('task-id').value; const payload={title:document.getElementById('task-title').value.trim(),description:document.getElementById('task-description').value,category:document.getElementById('task-category').value,start_at:document.getElementById('task-start').value,due_at:document.getElementById('task-due').value,reminder_minutes:Number(document.getElementById('task-reminder').value)}; const r=await fetch(id?`/api/tasks/${id}`:'/api/tasks',{method:id?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}); if(!r.ok){alert('Could not save this task. Please check the details.');return;} closeTaskForm(); await loadTasks(); });
async function loadTasks(){try{const r=await fetch('/api/tasks');if(!r.ok)throw Error();journeyTasks=await r.json();renderJourney();scheduleReminders();}catch(e){document.getElementById('journey-nodes').textContent='Could not load tasks. Please check that EduPredict server is running.'}}
const categoryOrder={'Immediate':0,'Short-term':1,'Medium-term':2,'Long-term':3}; const categoryClass={'Immediate':'immediate','Short-term':'short','Medium-term':'medium','Long-term':'long'};
function renderJourney(){
 const nodes=document.getElementById('journey-nodes'),svg=document.getElementById('journey-svg');
 nodes.replaceChildren();svg.replaceChildren();
 // Keep a permanent set of empty level dots ahead of the user's assigned tasks.
 const ordered=[...journeyTasks].sort((a,b)=>a.id-b.id);
 const slotCount=Math.max(12,ordered.length+8),step=205,width=slotCount*step+80,height=300;
 const track=document.getElementById('journey-track');track.style.width=width+'px';track.style.height=height+'px';
 svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('width',width);svg.setAttribute('height',height);
 const points=Array.from({length:slotCount},(_,i)=>({x:70+i*step,y:150+(i%2===0?-52:52)}));
 let d=`M ${points[0].x} ${points[0].y}`;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],mid=(a.x+b.x)/2;d+=` C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`;}
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',d);path.setAttribute('class','journey-path');svg.append(path);
 points.forEach((pt,i)=>{
  const task=ordered[i],wrap=document.createElement('button');wrap.type='button';
  wrap.className=task?`journey-node ${categoryClass[task.category]||'short'} ${task.status}`:'journey-node journey-empty-node';
  wrap.style.left=pt.x+'px';wrap.style.top=pt.y+'px';
  const dot=document.createElement('span');dot.className='node-dot';dot.textContent=task?(task.status==='completed'?'✓':task.status==='skipped'?'↷':i+1):'+';wrap.append(dot);
  if(task){const label=document.createElement('span');label.className='node-label';const title=document.createElement('strong');title.textContent=task.title;const status=document.createElement('small');status.textContent=task.status==='pending'?'Tap to view':task.status;label.append(title,status);wrap.append(label);wrap.addEventListener('click',()=>openTaskDetail(task));}
  else{wrap.setAttribute('aria-label',`Empty journey spot ${i+1}. Add a task`);wrap.title='Add a task here';wrap.addEventListener('click',()=>openTaskForm());}
  nodes.append(wrap);
 });
 const completed=journeyTasks.filter(t=>t.status==='completed').length,skipped=journeyTasks.filter(t=>t.status==='skipped').length,pending=journeyTasks.filter(t=>t.status==='pending'||t.status==='paused').length;
 document.getElementById('journey-completed').textContent=completed;document.getElementById('journey-pending').textContent=pending;document.getElementById('journey-skipped').textContent=skipped;document.getElementById('journey-progress').textContent=journeyTasks.length?Math.round(completed/journeyTasks.length*100)+'%':'0%';
 // Keep the first available task in view after adding/progressing, without hiding the map's empty levels.
 const activeIndex=ordered.findIndex(t=>t.status==='pending');
 if(activeIndex>=0&&ordered.length>0){const viewport=document.getElementById('journey-viewport');const activeNode=nodes.querySelectorAll('.journey-node')[activeIndex];if(activeNode&&activeNode.offsetLeft>viewport.scrollLeft+viewport.clientWidth-120)viewport.scrollTo({left:Math.max(0,activeNode.offsetLeft-viewport.clientWidth*.35),behavior:'smooth'});}
}
function openTaskDetail(task){selectedTaskId=task.id;document.getElementById('detail-title').textContent=task.title;document.getElementById('detail-description').textContent=task.description||'No description added.';document.getElementById('detail-meta').textContent=`${task.category} · ${task.due_at?'Due '+new Date(task.due_at).toLocaleString():'No deadline'} · ${task.status}`;detail.classList.remove('hidden');modal.classList.add('hidden');}
detail.querySelectorAll('[data-status]').forEach(btn=>btn.addEventListener('click',async()=>{const r=await fetch(`/api/tasks/${selectedTaskId}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:btn.dataset.status})});if(r.ok){detail.classList.add('hidden');await loadTasks();}}));
document.getElementById('detail-edit').onclick=()=>{const task=journeyTasks.find(t=>t.id===selectedTaskId);if(task)openTaskForm(task)};
function scheduleReminders(){reminderTimers.forEach(clearTimeout);reminderTimers.clear();if(!('Notification'in window)||Notification.permission!=='granted')return;journeyTasks.filter(t=>t.status==='pending'&&t.due_at&&t.reminder_minutes>0).forEach(t=>{const when=new Date(t.due_at).getTime()-t.reminder_minutes*60000-Date.now();if(when>0&&when<2147480000){const timer=setTimeout(()=>new Notification('EduPredict task reminder',{body:`${t.title} is coming up.`}),when);reminderTimers.set(t.id,timer);}});}
if('Notification'in window&&Notification.permission==='default'){// Request only after the user opens the journey, not on initial page load.
 journeyNav.addEventListener('click',()=>Notification.requestPermission(),{once:true});}
