import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ALL_PERMISSIONS,ROLE_PRESETS,normalizedRole,effectivePermissions,can,publicUser,validateAccessInput,requiredPermission,redactProduct} from '../src/access-control.js';

const person=(role_key,permissions_json=null)=>({id:'staff',email:'staff@example.org',role:'operador',role_key,permissions_json,active:1});
test('administrador has everything and legacy accounts preserve admin access',()=>{
 assert.deepEqual(effectivePermissions({id:'a',role:'admin',active:1}),ALL_PERMISSIONS);
 assert.ok(can({role:'admin'},'users.manage'));
 assert.equal(normalizedRole(person('estoque')),'estoque');
});
test('financeiro can manage finance but not stock, users, or product pricing',()=>{
 const finance=person('financeiro');
 for(const key of ['finance.manage','finance.view','reports.view','invoices.manage','orders.payments'])assert.ok(can(finance,key),key);
 for(const key of ['users.manage','inventory.adjust','store.manage','products.manage'])assert.equal(can(finance,key),false,key);
});
test('estoque can update inventory and photos without viewing costs or payments',()=>{
 const warehouse=person('estoque');
 for(const key of ['inventory.adjust','products.view','inventory.view','store.photos'])assert.ok(can(warehouse,key));
 for(const key of ['finance.view','finance.manage','orders.payments','users.manage','store.manage'])assert.equal(can(warehouse,key),false,key);
});
test('vendas can create orders and leads but cannot manage payment or finance',()=>{
 const staff=person('vendas');
 assert.ok(can(staff,'orders.create'));
 assert.ok(can(staff,'contacts.manage'));
 assert.ok(!can(staff,'orders.payments'));
 assert.ok(!can(staff,'finance.view'));
});
test('custom permissions restrict predefined role and cannot grant users.manage',()=>{
 const staff=person('gerente',JSON.stringify(['orders.view']));
 assert.deepEqual(effectivePermissions(staff),['orders.view']);
 assert.equal(can(staff,'finance.view'),false);
 assert.throws(()=>validateAccessInput({name:'Vendedor',role:'vendas',permissions:['users.manage']}),/administra/);
 assert.throws(()=>validateAccessInput({name:'Vendedor',role:'superadmin'}),/Cargo inválido/);
 assert.deepEqual(effectivePermissions({...staff,active:0}),[]);
});
test('routes enforce permissions by operation and do not allow leakage',()=>{
 const cases=[
  ['/api/users','GET','users.manage'],['/api/users/x/password','POST','users.manage'],
  ['/api/finance','GET','finance.view'],['/api/finance','POST','finance.manage'],
  ['/api/reports/financial','GET','reports.view'],['/api/orders/abcdef/status','PATCH','orders.manage'],
  ['/api/orders/abcdef/payment','PATCH','orders.payments'],['/api/orders','GET','orders.view'],
  ['/api/products','GET','products.view'],['/api/products/abcdef/adjust','POST','inventory.adjust'],
  ['/api/products','PATCH','products.manage'],['/api/inventory','GET','inventory.view'],
  ['/api/store/products/abcdef/variants/xyz/stock','POST','inventory.adjust'],
  ['/api/store/products/abcdef/gallery','POST','store.photos'],['/api/store/catalog','POST','store.manage'],
  ['/api/store/settings','PATCH','store.manage'],['/api/invoices','POST','invoices.manage'],
  ['/api/invoices','GET','invoices.view'],['/api/push/test','POST','users.manage'],
  ['/api/contacts','POST','contacts.manage'],['/api/tasks','GET','tasks.view']
 ];
 for(const [path,method,key] of cases)assert.equal(requiredPermission(path,method),key,path);
 assert.equal(requiredPermission('/api/secret-unknown','GET'),undefined);
});
test('warehouse product output never includes confidential cost and supplier',()=>{
 const product={id:'p1',sku:'SKU-01',name:'Seda',quantity:8,cost_cents:350,supplier_id:'private-supplier',supplier_name:'Fornecedor Privado'};
 const row=redactProduct(product,false);
 assert.equal(row.quantity,8);assert.equal(row.cost_cents,undefined);assert.equal(row.supplier_id,undefined);assert.equal(row.supplier_name,undefined);
 assert.equal(redactProduct(product,true).cost_cents,350);
});
test('user profile exposes only public role and capabilities, not hashed credentials',()=>{
 const profile=publicUser({...person('financeiro'),name:'Julia',password_hash:'do-not-expose'});
 assert.equal(profile.name,'Julia');
 assert.equal(profile.password_hash,undefined);
 assert.equal(profile.role_label,ROLE_PRESETS.financeiro.label);
});
