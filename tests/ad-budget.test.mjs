import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeBudgetReport,
  cycleDaysOf,
  parseControlCode,
  spendInBrl,
} from '../src/lib/ad-budget.ts';

const TAX = 0.1215;
const TODAY = '2026-11-24';

function weekly(amounts, firstDue) {
  return amounts.map((amount, index) => {
    const due = new Date(`${firstDue}T12:00:00Z`);
    due.setUTCDate(due.getUTCDate() + index * 7);
    const day = due.toISOString().slice(0, 10);
    return { id: `i${index}`, kind: 'recarga', dueDate: day, paidDate: day, trafficAdditional: amount };
  });
}

function spendDays(campaignId, from, to, amount, extra = {}) {
  const rows = [];
  for (let d = new Date(`${from}T12:00:00Z`); d <= new Date(`${to}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    rows.push({ campaignId, date: d.toISOString().slice(0, 10), amountSpent: amount, currency: 'BRL', exchangeRate: 1, ...extra });
  }
  return rows;
}

function report({ installments, company = '1234 - Loja', spend }) {
  return computeBudgetReport({
    controlClients: [{ id: 'c1', name: 'Loja', company, installments }],
    dashboardClients: [{ id: 'd1', name: 'Loja', code: '1234', active: true }],
    campaigns: [{ id: 'k1', clientId: 'd1', active: true }],
    spendRows: spend,
    today: TODAY,
    taxRate: TAX,
  });
}

test('o código vem do prefixo de 4 dígitos da empresa', () => {
  assert.equal(parseControlCode('1234 - Loja'), '1234');
  assert.equal(parseControlCode('1234-Loja'), '1234');
  assert.equal(parseControlCode(' 1234 Loja'), '1234');
  assert.equal(parseControlCode('12345 Loja'), null);
  assert.equal(parseControlCode('Loja 1234'), null);
  assert.equal(parseControlCode(''), null);
});

test('regra do gestor: R$ 500 na semana = R$ 62,75 por dia de anúncio', () => {
  const r = report({ installments: weekly([500, 500], '2026-11-10'), spend: [] });
  assert.equal(r.rows[0].cycleDays, 7);
  assert.equal(r.rows[0].recommendedDaily, 62.75);
});

test('o saldo desconta o gasto já com os 12,15% da Meta', () => {
  const r = report({
    installments: weekly([500], '2026-11-17'),
    spend: spendDays('k1', '2026-11-17', '2026-11-23', 62.75),
  });
  const row = r.rows[0];
  assert.equal(row.spendNet, 439.25);
  assert.equal(row.spendGross, 492.62);
  assert.equal(row.balance, 7.38);
  assert.equal(row.status, 'ok');
});

test('orçamento aumentado e esquecido: ritmo acima do pago acende o alerta', () => {
  const r = report({
    installments: weekly([500, 500, 500], '2026-11-04'),
    spend: [
      ...spendDays('k1', '2026-11-04', '2026-11-20', 50),
      ...spendDays('k1', '2026-11-21', '2026-11-24', 100),
    ],
  });
  assert.equal(r.rows[0].status, 'acima');
  assert.equal(r.rows[0].paceDaily, 100);
});

test('gastou mais do que pagou: estourado vem primeiro', () => {
  const r = report({
    installments: weekly([200], '2026-11-17'),
    spend: spendDays('k1', '2026-11-17', '2026-11-23', 40),
  });
  assert.equal(r.rows[0].status, 'estourado');
  assert.ok(r.rows[0].balance < 0);
  assert.equal(r.totals.estourados, 1);
});

test('gasto anterior à primeira verba paga não entra no saldo', () => {
  const r = report({
    installments: weekly([500], '2026-11-20'),
    spend: spendDays('k1', '2026-11-01', '2026-11-19', 100),
  });
  assert.equal(r.rows[0].spendNet, 0);
});

test('conta em dólar usa a cotação do cartão (5,15), não a PTAX', () => {
  const row = { campaignId: 'k', date: TODAY, amountSpent: 520, currency: 'USD', exchangeRate: 5.2 };
  assert.equal(Math.round(spendInBrl(row, 5.15) * 100) / 100, 515);
  assert.equal(spendInBrl({ ...row, currency: 'BRL', exchangeRate: 1 }, 5.15), 520);
});

test('ciclo pela mediana ignora uma recarga extra no meio da semana', () => {
  const paid = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-17', '2026-10-22', '2026-10-29']
    .map((day) => ({ dueDate: day, paidDate: day }));
  assert.equal(cycleDaysOf(paid), 7);
});

test('empresa sem código ou com código inexistente fica em "sem vínculo"', () => {
  const semCodigo = report({ installments: weekly([500], '2026-11-17'), company: 'Loja', spend: [] });
  assert.equal(semCodigo.rows.length, 0);
  assert.equal(semCodigo.unlinked[0].reason, 'sem_codigo');

  const desconhecido = report({ installments: weekly([500], '2026-11-17'), company: '9999 - Loja', spend: [] });
  assert.equal(desconhecido.unlinked[0].reason, 'codigo_desconhecido');
});

test('cliente gastando sem pagamento no controle aparece à parte', () => {
  const r = computeBudgetReport({
    controlClients: [],
    dashboardClients: [{ id: 'd1', name: 'Loja', code: '1234', active: true }],
    campaigns: [{ id: 'k1', clientId: 'd1', active: true }],
    spendRows: spendDays('k1', '2026-11-20', '2026-11-24', 10),
    today: TODAY,
    taxRate: TAX,
  });
  assert.equal(r.withoutControl.length, 1);
  assert.equal(r.withoutControl[0].spendLast7, 56.08);
});

test('gastando bem menos do que pode por dia vira "abaixo" (ritmo)', () => {
  const r = report({
    installments: weekly([500], '2026-11-20'),
    spend: spendDays('k1', '2026-11-20', '2026-11-24', 20),
  });
  const row = r.rows[0];
  assert.equal(row.status, 'abaixo');
  assert.equal(row.underReason, 'ritmo');
  assert.equal(row.pacePercent, 32);
  assert.equal(r.totals.abaixo, 1);
});

test('saldo guardado maior que uma verba inteira vira "abaixo" (sobra)', () => {
  // 3 verbas de 500 pagas, gastou só no ritmo certo na última semana.
  const r = report({
    installments: weekly([500, 500, 500], '2026-11-04'),
    spend: spendDays('k1', '2026-11-18', '2026-11-24', 62.75),
  });
  const row = r.rows[0];
  assert.equal(row.status, 'abaixo');
  assert.equal(row.underReason, 'sobra');
  assert.ok(row.balance > 500);
  assert.equal(r.totals.unspent, row.balance);
});

test('ritmo dentro do combinado continua "ok" com uso perto de 100%', () => {
  const r = report({
    installments: weekly([500], '2026-11-17'),
    spend: spendDays('k1', '2026-11-17', '2026-11-23', 62.75),
  });
  assert.equal(r.rows[0].status, 'ok');
  assert.equal(r.rows[0].pacePercent, 100);
  assert.equal(r.rows[0].underReason, null);
});
