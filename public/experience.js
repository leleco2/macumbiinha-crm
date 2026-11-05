/** Progressive UI enhancements; no third-party dependencies and no tracking. */
const THEME_KEY='macumbiinha_crm_theme';
const INSTALL_DISMISSED_KEY='macumbiinha_install_dismissed';
const WEEK=7*24*60*60*1000;
let deferredInstall=null;
let isAuthenticated=false;
let notify=()=>{};
const safeStorage={
 get(key){try{return localStorage.getItem(key)}catch{return null}},
 set(key,value){try{localStorage.setItem(key,value)}catch{}}
};
const getSystemTheme=()=>typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
export function getTheme(){const selected=safeStorage.get(THEME_KEY);return selected==='dark'||selected==='light'?selected:getSystemTheme()}
function syncThemeButtons(){const dark=document.documentElement.dataset.theme==='dark';document.querySelectorAll('[data-experience="theme"]').forEach(button=>{button.setAttribute('aria-label',dark?'Ativar tema claro':'Ativar tema escuro');button.setAttribute('aria-pressed',String(dark));const label=button.querySelector('[data-theme-label]');if(label)label.textContent=dark?'Tema claro':'Tema escuro';const icon=button.querySelector('[data-theme-icon]');if(icon)icon.textContent=dark?'☀':'☾';});}
export function setTheme(value){const theme=value==='dark'?'dark':'light';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;safeStorage.set(THEME_KEY,theme);syncThemeButtons();return theme}
const standalone=()=>matchMedia('(display-mode: standalone)').matches||Boolean(navigator.standalone);
const mobile=()=>matchMedia('(max-width: 740px)').matches||/Android|iPad|iPhone|iPod/i.test(navigator.userAgent);
const apple=()=>/iPhone|iPad|iPod/i.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);
function installHint(){return apple()?'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.':'No Chrome ou Edge, abra o menu do navegador e escolha “Instalar aplicativo” ou “Adicionar à tela inicial”.'}
function hideBanner(){document.getElementById('crm-install-banner')?.remove()}
function dismissedRecently(){const last=Number(safeStorage.get(INSTALL_DISMISSED_KEY));return Number.isFinite(last)&&last>0&&Date.now()-last<WEEK}
function buildBanner(){
 if(!isAuthenticated||standalone()||dismissedRecently()||!mobile())return;
 if(document.getElementById('crm-install-banner'))return;
 const banner=document.createElement('aside');banner.id='crm-install-banner';banner.className='crm-install-banner';banner.setAttribute('role','region');banner.setAttribute('aria-label','Instalar CRM no celular');
 banner.innerHTML=`<div class="install-app-icon" aria-hidden="true">m.</div><div class="install-app-text"><span class="install-app-kicker">MACUMBIINHA · NO SEU CELULAR</span><strong>Seu CRM, sempre à mão.</strong><p>Acesse pedidos, estoque, vendas e alertas diretamente da tela inicial.</p></div><div class="install-app-controls"><button class="install-app-cta" type="button" data-experience="install">${deferredInstall?'Instalar agora':'Como instalar'} <span aria-hidden="true">↗</span></button></div><button type="button" class="install-app-dismiss" data-experience="dismiss" aria-label="Fechar convite de instalação">×</button>`;
 document.body.appendChild(banner);
 requestAnimationFrame(()=>banner.classList.add('is-visible'));
}
export function refreshExperience(authenticated=false){isAuthenticated=Boolean(authenticated);syncThemeButtons();document.querySelector('.crm-login-theme-toggle')?.remove();if(!isAuthenticated){hideBanner();const button=document.createElement('button');button.type='button';button.className='crm-login-theme-toggle';button.dataset.experience='theme';button.innerHTML='<span data-theme-icon>☾</span><span data-theme-label>Tema escuro</span>';document.body.append(button);syncThemeButtons();return;}
 const installButton=document.getElementById('install-btn');if(installButton)installButton.hidden=standalone()||(!mobile()&&!deferredInstall);
 if(!standalone())setTimeout(()=>{if(isAuthenticated)buildBanner()},1200);
}
export async function promptInstall(){if(standalone()){notify('O CRM já está instalado neste aparelho.');hideBanner();return}
 if(deferredInstall){const prompt=deferredInstall;deferredInstall=null;hideBanner();await prompt.prompt();const result=await prompt.userChoice.catch(()=>null);if(result?.outcome==='accepted'){safeStorage.set(INSTALL_DISMISSED_KEY,String(Date.now()));notify('Instalação iniciada. Confira a tela inicial do dispositivo.')}else notify('Você pode instalar mais tarde nas configurações.');return}
 const banner=document.getElementById('crm-install-banner');if(banner){const p=banner.querySelector('.install-app-text p');if(p)p.textContent=installHint();const button=banner.querySelector('[data-experience="install"]');if(button)button.textContent='Entendi';banner.dataset.instructions='true';return}
 notify(installHint());
}
export function setupExperience(toast){notify=toast;
 const preferred=getTheme();document.documentElement.dataset.theme=preferred;document.documentElement.style.colorScheme=preferred;
 document.addEventListener('click',event=>{const button=event.target.closest('[data-experience]');if(!button)return;
  if(button.dataset.experience==='theme'){setTheme(getTheme()==='dark'?'light':'dark')}
  else if(button.dataset.experience==='dismiss'){safeStorage.set(INSTALL_DISMISSED_KEY,String(Date.now()));hideBanner()}
  else if(button.dataset.experience==='install'){
   if(document.getElementById('crm-install-banner')?.dataset.instructions==='true'){safeStorage.set(INSTALL_DISMISSED_KEY,String(Date.now()));hideBanner()}
   else promptInstall().catch(()=>notify('Não foi possível iniciar a instalação. Use o menu do navegador.'));
  }
 });
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstall=event;const top=document.getElementById('install-btn');if(top)top.hidden=false;const current=document.getElementById('crm-install-banner');const button=current?.querySelector('[data-experience="install"]');if(button)button.innerHTML='Instalar agora <span aria-hidden="true">↗</span>';else if(isAuthenticated)buildBanner()});
 window.addEventListener('appinstalled',()=>{deferredInstall=null;safeStorage.set(INSTALL_DISMISSED_KEY,String(Date.now()));hideBanner();notify('Macumbiinha CRM instalado.');const top=document.getElementById('install-btn');if(top)top.hidden=true});
}
