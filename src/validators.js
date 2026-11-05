export const STAGES=['novo','contato','negociacao','ganho','perdido'];
export const SEGMENTS=['varejo','atacado'];
export const CONTACT_STATUSES=['lead','cliente'];
export const ORIGINS=['manual','site','whatsapp'];
export const ORDER_STATUSES=['novo','confirmado','separando','enviado','concluido','cancelado'];
export const PAYMENTS=['pendente','pago','estornado'];
export const FINANCE_STATUSES=['pendente','pago','cancelado'];
export const FINANCE_TYPES=['receita','despesa'];
export const integer=(v,min=0,max=9999999999)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
export const clean=(s,max=160)=>typeof s==='string'?s.trim().slice(0,max):'';
export const choice=(s,options,label)=>{if(!options.includes(s))throw new Error(`${label} inválido.`);return s};
export const emailOk=s=>!s||(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)&&s.length<=160);
export const phoneOk=s=>!s||/^[0-9+()\-\s]{8,24}$/.test(s);
export function contactFields(body){
 const name=clean(body.name,120),phone=clean(body.phone,24),email=clean(body.email,160).toLowerCase();
 if(name.length<2)throw new Error('Nome precisa ter pelo menos 2 caracteres.');
 if(!phoneOk(phone))throw new Error('Telefone inválido.');
 if(!emailOk(email))throw new Error('E-mail inválido.');
 return {name,phone,email,segment:choice(body.segment||'varejo',SEGMENTS,'Perfil'),status:choice(body.status||'lead',CONTACT_STATUSES,'Situação'),origin:choice(body.origin||'manual',ORIGINS,'Origem'),notes:clean(body.notes,3000)};
}
export function productFields(body){
 const sku=clean(body.sku,70).toUpperCase(),name=clean(body.name,170);
 if(!/^[A-Z0-9][A-Z0-9._\-]{1,69}$/.test(sku))throw new Error('SKU deve usar letras, números, hífen ou ponto.');
 if(name.length<2)throw new Error('Informe o nome do produto.');
 const cost_cents=Number(body.cost_cents??0),retail_cents=Number(body.retail_cents??0),wholesale_cents=Number(body.wholesale_cents??0),quantity=Number(body.quantity??0),min_quantity=Number(body.min_quantity??5);
 if(![cost_cents,retail_cents,wholesale_cents].every(n=>integer(n,0,100000000000)))throw new Error('Preços devem ser valores em centavos, não negativos.');
 if(!integer(quantity,0,1000000)||!integer(min_quantity,0,1000000))throw new Error('Estoque inválido.');
 return {sku,name,category:clean(body.category,80)||'geral',description:clean(body.description,3000),cost_cents,retail_cents,wholesale_cents,quantity,min_quantity,active:body.active===0||body.active===false?0:1,supplier_id:clean(body.supplier_id,40)||null};
}
export function dealFields(body){
 const title=clean(body.title,180),contact_id=clean(body.contact_id,40),amount_cents=Number(body.amount_cents??0);
 if(title.length<2||!contact_id||!integer(amount_cents,0,100000000000))throw new Error('Oportunidade inválida.');
 return {title,contact_id,amount_cents,stage:choice(body.stage||'novo',STAGES,'Etapa'),origin:choice(body.origin||'manual',ORIGINS,'Origem'),notes:clean(body.notes,2500)};
}
export function taskFields(body){
 const title=clean(body.title,160),due_date=clean(body.due_date,10)||null;
 if(title.length<2)throw new Error('Informe uma tarefa.');
 if(due_date&&!/^\d{4}-\d{2}-\d{2}$/.test(due_date))throw new Error('Data inválida.');
 return {title,description:clean(body.description,2000),due_date,contact_id:clean(body.contact_id,40)||null,deal_id:clean(body.deal_id,40)||null};
}
export function financeFields(body){
 const title=clean(body.title,160),amount_cents=Number(body.amount_cents),due_date=clean(body.due_date,10)||null;
 if(title.length<2||!integer(amount_cents,1,100000000000))throw new Error('Lançamento financeiro inválido.');
 if(due_date&&!/^\d{4}-\d{2}-\d{2}$/.test(due_date))throw new Error('Vencimento inválido.');
 const status=choice(body.status||'pendente',FINANCE_STATUSES,'Situação');
 return {title,amount_cents,due_date,type:choice(body.type,FINANCE_TYPES,'Tipo'),status,category:clean(body.category,70)||'outros',method:clean(body.method,60)||'outro',notes:clean(body.notes,1500),supplier_id:clean(body.supplier_id,40)||null,order_id:clean(body.order_id,40)||null};
}
export function orderStatusAllowed(oldStatus,newStatus){
 const transitions={novo:['confirmado','cancelado'],confirmado:['separando','cancelado'],separando:['enviado','cancelado'],enviado:['concluido'],concluido:[],cancelado:[]};
 return (transitions[oldStatus]||[]).includes(newStatus);
}
