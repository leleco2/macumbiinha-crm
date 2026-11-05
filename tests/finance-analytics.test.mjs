import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeFinancialMonths,financialChart,expenseDonutChart} from '../public/finance-analytics.js';

const today=new Date('2026-11-05T12:00:00Z');

test('finance chart fills missing months without inventing income or expenses',()=>{
 const months=normalizeFinancialMonths([{month:'2026-10',income_cents:12000,expense_cents:3500}],3,today);
 assert.deepEqual(months.map(m=>m.month),['2026-09','2026-10','2026-11']);
 assert.equal(months[0].income_cents,0);
 assert.equal(months[1].expense_cents,3500);
 assert.equal(months[2].income_cents,0);
});

test('period is limited to supported values and spans previous year',()=>{
 assert.equal(normalizeFinancialMonths([],12,today).length,12);
 assert.equal(normalizeFinancialMonths([],999,today).length,6);
 assert.equal(normalizeFinancialMonths([],12,today)[0].month,'2025-12');
});

test('charts reflect only real payments, and make zero states explicit',()=>{
 const chart=financialChart([{month:'2026-11',income_cents:4500,expense_cents:1500}],3,today);
 assert.match(chart,/R\$\s?45,00/);
 assert.match(chart,/R\$\s?15,00/);
 assert.match(chart,/R\$\s?30,00/);
 assert.match(financialChart([],6,today),/Ainda não há movimentações pagas/);
 assert.match(expenseDonutChart([]),/Nenhuma despesa paga/);
});

test('expense category labels are escaped to avoid markup injection',()=>{
 const html=expenseDonutChart([{category:'<img src=x onerror=alert(1)>',amount_cents:10000}]);
 assert.doesNotMatch(html,/<img/);
 assert.match(html,/&lt;img/);
 assert.match(html,/R\$\s?100,00/);
});
