/** Optional access prompt: no focus trap, no automatic browser permissions. */
const PROMPT_KEY='macumbiinha_access_choices_dismissed_v1';
const PUSH_READY_KEY='macumbiinha_push_opted_in_v1';
const RETRY_AFTER_MS=30*24*60*60*1000;
let notificationHandler=null;
let installHandler=null;
let authenticated=false;
let inviteTimer=null;
let installSupported=false;
let initialized=false;
const svgPhone='<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="6.5" y="2" width="11" height="20" rx="2"/><path d="M11 18h2"/></svg>';
const svgBell='<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9M10 21h4"/></svg>';
function stored(key){try{return localStorage.getItem(key)}catch{return null}}
function save(key,value){try{localStorage.setItem(key,value)}catch{}}
function installed(){return (typeof matchMedia==='function'&&matchMedia('(display-mode: standalone)').matches)||Boolean(navigator.standalone)}
function ios(){return /iPhone|iPad|iPod/i.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1)}
function hint(){
 if(ios())return 'No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.';
 return 'Abra o menu do Chrome ou Edge e escolha Instalar aplicativo ou Adicionar à tela inicial.';
}
function dismissed(){
 const date=Number(stored(PROMPT_KEY));
 return Number.isFinite(date)&&date>0&&Date.now()-date<RETRY_AFTER_MS;
}
function remove(){
 clearTimeout(inviteTimer);
 document.getElementById('crm-access-prompt')?.remove();
}
function dismiss(){save(PROMPT_KEY,String(Date.now()));remove()}
function status(text){
 const el=document.getElementById('crm-access-status');
 if(el)el.textContent=text;
}
function render(){
 const pop=document.getElementById('crm-access-prompt');
 if(!pop)return;
 const button=pop.querySelector('[data-access="install"]');
 if(button){
  button.disabled=installed();
  button.textContent=installed()?'Aplicativo instalado':installSupported?'Instalar aplicativo':'Como instalar aplicativo';
 }
 const bell=pop.querySelector('[data-access="notifications"]');
 if(bell){
  const supported=('Notification' in window)&&('serviceWorker' in navigator)&&('PushManager' in window);
  const blocked=supported&&Notification.permission==='denied';
  bell.disabled=!supported||blocked;
  bell.textContent=!supported?'Não disponível neste navegador':blocked?'Bloqueado pelo navegador':!authenticated?'Ativar após o login':stored(PUSH_READY_KEY)==='yes'&&Notification.permission==='granted'?'Reativar notificações':'Ativar notificações';
 }
 const installSection=pop.querySelector('[data-access-section="install"]');
 if(installSection)installSection.hidden=installed();
}
function build(){
 if(dismissed()||document.getElementById('crm-access-prompt')){render();return}
 const pop=document.createElement('aside');
 pop.id='crm-access-prompt';
 pop.className='crm-access-prompt';
 pop.setAttribute('role','region');
 pop.setAttribute('aria-labelledby','crm-access-title');
 pop.innerHTML=[
 '<div class="crm-access-head"><span class="crm-access-mark" aria-hidden="true"><img src="/icon.svg" alt=""></span>',
 '<div><span class="crm-access-eyebrow">MACUMBIINHA · CRM</span><h2 id="crm-access-title">Seu CRM sempre à mão.</h2></div></div>',
 '<button type="button" class="crm-access-close" aria-label="Fechar sugestões e continuar" data-access="close">×</button>',
 '<div class="crm-access-body"><p class="crm-access-description">Instale como aplicativo e receba avisos importantes, se quiser. Você pode fechar e usar o CRM normalmente.</p>',
 '<section class="crm-access-option" data-access-section="install"><span class="crm-access-option-icon" aria-hidden="true">'+svgPhone+'</span>',
 '<div class="crm-access-option-copy"><strong>Aplicativo no celular ou computador</strong>',
 '<p>Acesso rápido pela tela inicial. Não é necessário baixar APK.</p>',
 '<button class="crm-access-action" type="button" data-access="install">Como instalar aplicativo</button></div></section>',
 '<section class="crm-access-option"><span class="crm-access-option-icon" aria-hidden="true">'+svgBell+'</span>',
 '<div class="crm-access-option-copy"><strong>Ativar notificações</strong>',
 '<p>Receba alertas de pedidos e do sistema. A permissão só será solicitada se você escolher.</p>',
 '<button class="crm-access-action is-secondary" type="button" data-access="notifications">Ativar notificações</button></div></section>',
 '<p class="crm-access-status" id="crm-access-status" role="status" aria-live="polite"></p></div>',
 '<footer class="crm-access-footer"><span>Opcional · nenhuma etapa obrigatória.</span>',
 '<button type="button" class="crm-access-later" data-access="close">Agora não</button></footer>'
 ].join('');
 document.body.appendChild(pop);
 render();
 requestAnimationFrame(()=>pop.classList.add('is-visible'));
}
export function showAccessPrompt(isAuthenticated=false){
 authenticated=Boolean(isAuthenticated);
 if(dismissed()){remove();return}
 clearTimeout(inviteTimer);
 if(document.getElementById('crm-access-prompt')){render();return}
 inviteTimer=setTimeout(build,550);
}
export function setupAccessPrompt(install,notifications){
 if(initialized)return;
 initialized=true;
 installHandler=install;
 notificationHandler=notifications;
 document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-access]');
  if(!button||!button.closest('#crm-access-prompt'))return;
  const action=button.dataset.access;
  if(action==='close'){dismiss();return}
  if(action==='install'){
   button.disabled=true;
   try{
    await installHandler();
    status(installSupported?'Siga as orientações exibidas pelo navegador.':hint());
   }catch{status('A instalação não abriu. '+hint())}
   finally{render()}
   return;
  }
  if(action==='notifications'){
   if(!authenticated){
    status('Entre na sua conta primeiro. Depois você poderá autorizar as notificações.');
    document.querySelector('#login-form input[name="email"]')?.focus();
    return;
   }
   button.disabled=true;
   try{
    const ok=await notificationHandler();
    if(ok===true){save(PUSH_READY_KEY,'yes');status('Notificações habilitadas neste navegador. Você pode continuar usando o CRM.')}
    else status('Notificações não ativadas. Você pode continuar normalmente e tentar em Configurações.');
   }catch{status('Não foi possível ativar agora. Confira a permissão do navegador ou tente em Configurações.')}
   finally{render()}
  }
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById('crm-access-prompt'))dismiss()});
 window.addEventListener('beforeinstallprompt',()=>{installSupported=true;render()});
 window.addEventListener('appinstalled',()=>{installSupported=false;render()});
}
