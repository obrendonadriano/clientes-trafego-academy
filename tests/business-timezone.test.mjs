import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  businessToday,
  clampMetricsWindowForRole,
  getDefaultMetricsWindow,
  resolveMetricsWindow,
} from '../src/lib/data/date-range.ts';

// A Vercel roda em UTC. Depois das 21h de Brasília o servidor já está no dia
// seguinte, e as janelas terminavam num dia que ainda não existe para o
// negócio — enquanto o fechamento decidia o que é "hoje" por São Paulo.
// Resultado: "Último dia 30/09" com o cliente vendo tudo zerado no dia 29.

// 2026-09-30T00:30Z  =  2026-09-29 21:30 em São Paulo.
const noiteEmSaoPaulo = new Date('2026-09-30T00:30:00Z');
// 2026-09-29T12:00Z  =  2026-09-29 09:00 em São Paulo (mesmo dia nos dois).
const manha = new Date('2026-09-29T12:00:00Z');

test('o dia de hoje vem de São Paulo, não do relógio do servidor', () => {
  assert.equal(businessToday(noiteEmSaoPaulo).getDate(), 29);
  assert.equal(businessToday(noiteEmSaoPaulo).getMonth(), 8); // setembro
  assert.equal(businessToday(manha).getDate(), 29);
});

test('a janela padrão nunca termina num dia futuro para o negócio', () => {
  assert.equal(getDefaultMetricsWindow(noiteEmSaoPaulo).endDate, '2026-09-29');
  assert.equal(getDefaultMetricsWindow(manha).endDate, '2026-09-29');
});

test('o corte por papel não deixa passar um dia que ainda não chegou', () => {
  // Era exatamente o que aparecia na tela: último dia 30/09 no dia 29.
  const pedido = { startDate: '2026-09-01', endDate: '2026-09-30' };

  for (const role of ['admin', 'client']) {
    assert.equal(
      clampMetricsWindowForRole(role, pedido, noiteEmSaoPaulo).endDate,
      '2026-09-29',
      `${role}: a janela terminou depois de hoje`,
    );
  }
});

test('os períodos das telas de campanha seguem o mesmo fuso', () => {
  // `comparar: nenhum` pede só o período em si. Sem ele a janela é estendida
  // para trás de propósito, para carregar o período de comparação junto.
  const sem = { comparar: 'nenhum' };

  const hoje = resolveMetricsWindow('admin', { ...sem, periodo: 'hoje' }, noiteEmSaoPaulo);
  assert.equal(hoje.startDate, '2026-09-29');
  assert.equal(hoje.endDate, '2026-09-29');

  const d30 = resolveMetricsWindow('admin', { ...sem, periodo: 'd30' }, noiteEmSaoPaulo);
  assert.equal(d30.endDate, '2026-09-29');
  assert.equal(d30.startDate, '2026-08-31');

  const ontem = resolveMetricsWindow('admin', { ...sem, periodo: 'ontem' }, noiteEmSaoPaulo);
  assert.equal(ontem.endDate, '2026-09-28');

  // E a comparação, quando pedida, continua terminando hoje — nunca amanhã.
  const comparando = resolveMetricsWindow('admin', { periodo: 'd30' }, noiteEmSaoPaulo);
  assert.equal(comparando.endDate, '2026-09-29');
});

test('o limite de 92 dias do cliente continua valendo', () => {
  const window = clampMetricsWindowForRole(
    'client',
    { startDate: '2020-01-01', endDate: '2026-09-30' },
    noiteEmSaoPaulo,
  );

  assert.equal(window.endDate, '2026-09-29');
  assert.equal(window.startDate, '2026-06-30');
});
