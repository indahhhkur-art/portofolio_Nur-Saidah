const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const assert = require('node:assert/strict');

const html = readFileSync(join(__dirname, 'index.html'), 'utf8');
const script = html.match(/<script id="accounting-math">([\s\S]*?)<\/script>/)?.[1];
const context = vm.createContext({});
vm.runInContext(script || 'globalThis.AccountingMath = {}', context);
const math = context.AccountingMath;

test('parses whole rupiah exactly and accepts negative balances only when requested', () => {
  assert.equal(math.parseAmount('999999999999999999'), 999999999999999999n);
  assert.equal(math.parseAmount(' 0 '), 0n);
  assert.equal(math.parseAmount('-100', true), -100n);
  for (const value of ['', '1.000', '1,5', '1.5', 'abc', '-1', '1000000000000000000']) {
    assert.throws(() => math.parseAmount(value));
  }
});

test('compares balances without losing a single rupiah', () => {
  assert.equal(math.compareBalances(100n, 100n).difference, 0n);
  assert.equal(math.compareBalances(-100n, 100n).difference, -200n);
  assert.equal(math.compareBalances(999999999999999999n, 999999999999999998n).difference, 1n);
});

test('totals multiple debit and credit entries and identifies an imbalance', () => {
  const result = math.trialBalance([
    { side: 'debit', amount: 100n }, { side: 'debit', amount: 50n },
    { side: 'credit', amount: 150n }
  ]);
  assert.equal(result.debit, 150n);
  assert.equal(result.credit, 150n);
  assert.equal(result.difference, 0n);
  assert.equal(math.trialBalance([{ side: 'credit', amount: 2n }]).difference, -2n);
  assert.throws(() => math.trialBalance([]));
  assert.throws(() => math.trialBalance([{ side: 'other', amount: 1n }]));
  assert.throws(() => math.trialBalance([{ side: 'debit', amount: -1n }]));
});

test('calculates profit, loss, and break-even from multiple expenses', () => {
  assert.equal(math.profitLoss(1000n, [200n, 300n]).net, 500n);
  assert.equal(math.profitLoss(100n, [200n]).net, -100n);
  assert.equal(math.profitLoss(0n, [0n]).net, 0n);
  assert.throws(() => math.profitLoss(-1n, [0n]));
  assert.throws(() => math.profitLoss(100n, [-1n]));
});

test('calculates straight-line depreciation with residual value and valid useful life', () => {
  const result = math.depreciation(12000000n, 2000000n, 5);
  assert.equal(result.base, 10000000n);
  assert.equal(result.years, 5n);
  assert.equal(math.depreciation(100n, 100n, 1).base, 0n);
  for (const years of [0, -1, 1.5, 101]) {
    assert.throws(() => math.depreciation(100n, 0n, years));
  }
  assert.throws(() => math.depreciation(0n, 0n, 1));
  assert.throws(() => math.depreciation(100n, 101n, 1));
  assert.throws(() => math.depreciation(100n, -1n, 1));
});

test('rounds recurring depreciation only for display, with two decimal places', () => {
  assert.equal(math.fractionCents(10000000n, 60n), 16666667n);
  assert.equal(math.fractionCents(1n, 8n), 13n);
  assert.equal(math.fractionCents(0n, 12n), 0n);
});

test('ledger sorts dates, preserves same-day order, and computes running balance', () => {
  const result = math.ledger(100n, [
    { date: '2026-02-02', description: 'Beban', side: 'out', amount: 30n },
    { date: '2026-02-01', description: 'Penjualan', side: 'in', amount: 50n },
    { date: '2026-02-02', description: 'Biaya lain', side: 'out', amount: 10n }
  ]);
  assert.equal(result.rows[0].description, 'Penjualan');
  assert.equal(result.rows[0].balance, 150n);
  assert.equal(result.rows[1].balance, 120n);
  assert.equal(result.finalBalance, 110n);
  assert.equal(result.totalIncoming, 50n);
  assert.equal(result.totalOutgoing, 40n);
  assert.equal(math.ledger(-100n, [
    { date: '2026-02-01', description: 'Masuk', side: 'in', amount: 10n }
  ]).finalBalance, -90n);
});

test('ledger rejects invalid dates, negative transactions, and empty descriptions', () => {
  const valid = { date: '2026-02-01', description: 'Transaksi', side: 'in', amount: 1n };
  for (const changes of [
    { date: '2026-02-30' }, { date: '' }, { amount: -1n }, { side: 'other' }, { description: ' ' }
  ]) {
    assert.throws(() => math.ledger(0n, [{ ...valid, ...changes }]));
  }
  assert.throws(() => math.ledger(0n, []));
  assert.equal(math.validDate('2024-02-29'), true);
  assert.equal(math.validDate('2026-02-29'), false);
});

test('invoice totals use exact integer quantity multiplication across multiple lines', () => {
  const result = math.invoice([
    { description: 'Jasa A', quantity: 2n, price: 150000n },
    { description: 'Jasa B', quantity: 3n, price: 50000n }
  ]);
  assert.equal(result.rows[0].total, 300000n);
  assert.equal(result.total, 450000n);
  assert.equal(math.invoice([
    { description: 'Jasa', quantity: 999999n, price: 999999999999999999n }
  ]).total, 999998999999999999000001n);
});

test('invoice rejects empty items, zero/fractional quantities, and negative unit prices', () => {
  const valid = { description: 'Jasa', quantity: 1n, price: 1n };
  assert.throws(() => math.invoice([]));
  for (const changes of [
    { description: '' }, { quantity: 0n }, { quantity: -1n }, { quantity: 1.5 },
    { quantity: 1000000n }, { price: -1n }
  ]) {
    assert.throws(() => math.invoice([{ ...valid, ...changes }]));
  }
});

test('decimal quantities and payments remain exact, with per-line whole-rupiah rounding', () => {
  assert.equal(math.parseQuantity('2,5'), 2500n);
  assert.equal(math.parseQuantity('0.125'), 125n);
  for (const raw of ['0', '-1', '1.2345', '1000000', '']) assert.throws(() => math.parseQuantity(raw));
  const invoice = math.invoice([
    { description: 'Jasa', quantityMilli: math.parseQuantity('2.5'), price: 150000n },
    { description: 'Item', quantityMilli: 500n, price: 1n }
  ], { discount: 25000n, paid: 100000n });
  assert.equal(invoice.rows[1].total, 1n);
  assert.equal(invoice.subtotal, 375001n);
  assert.equal(invoice.total, 350001n);
  assert.equal(invoice.balance, 250001n);
  const items = [{ description: 'Jasa', quantity: 1n, price: 100n }];
  assert.throws(() => math.invoice(items, { discount: 101n }));
  assert.throws(() => math.invoice(items, { paid: 101n }));
  assert.equal(math.invoice(items, { paid: 100n }).balance, 0n);
});

test('ledger period carries forward earlier transactions, excludes later ones, and flags possible duplicates', () => {
  const entries = [
    { date: '2026-01-01', description: 'Modal', side: 'in', amount: 100n },
    { date: '2026-02-01', description: 'Beban', side: 'out', amount: 20n },
    { date: '2026-02-01', description: 'Beban', side: 'out', amount: 20n },
    { date: '2026-03-01', description: 'Penjualan', side: 'in', amount: 50n }
  ];
  const ledger = math.ledger(10n, entries, { from: '2026-02-01', to: '2026-02-28' });
  assert.equal(ledger.openingBalance, 110n);
  assert.equal(ledger.rows.length, 2);
  assert.equal(ledger.finalBalance, 70n);
  assert.equal(ledger.totalIncoming, 0n);
  assert.equal(ledger.duplicateCount, 1);
  const empty = math.ledger(10n, entries, { from: '2026-04-01' });
  assert.equal(empty.rows.length, 0);
  assert.equal(empty.finalBalance, 120n);
  assert.throws(() => math.ledger(10n, entries, { from: '2026-03-01', to: '2026-02-01' }));
});

test('CSV quotes separators and neutralizes spreadsheet formulas in user-entered text', () => {
  assert.equal(math.csvCell('Biaya, "lain"'), '"Biaya, ""lain"""');
  assert.equal(math.csvCell('=1+1'), '"\'=1+1"');
  assert.equal(math.csvCell('  @SUM(A1)'), '"\'  @SUM(A1)"');
  assert.equal(math.csvCell(-100n), '"-100"');
});

test('percentage discounts round once in rupiah and reject invalid rates', () => {
  assert.equal(math.parsePercent('12,50'), 1250n);
  assert.equal(math.parsePercent('100'), 10000n);
  for (const raw of ['100.01', '-1', '1.234', '']) assert.throws(() => math.parsePercent(raw));
  const items = [{ description: 'Jasa', quantity: 1n, price: 100005n }];
  const result = math.invoice(items, { discountRate: 1000n, paid: 50000n });
  assert.equal(result.discount, 10001n);
  assert.equal(result.total, 90004n);
  assert.equal(result.balance, 40004n);
  assert.throws(() => math.invoice(items, { discountRate: 10001n }));
  assert.throws(() => math.invoice(items, { discountRate: 1000n, discount: 1n }));
});

test('receivable aging uses date-only boundaries and distinguishes paid, partial, and overdue', () => {
  assert.equal(math.receivableStatus(0n, 100n, '2026-01-01', '2026-01-03').payment, 'Lunas');
  assert.equal(math.receivableStatus(50n, 50n, '2026-01-03', '2026-01-03').daysLate, 0);
  const overdue = math.receivableStatus(100n, 0n, '2026-01-01', '2026-01-03');
  assert.equal(overdue.payment, 'Belum dibayar');
  assert.equal(overdue.daysLate, 2);
  assert.equal(math.receivableStatus(50n, 50n, '2026-01-01', '2026-01-03').payment, 'Dibayar sebagian');
  assert.throws(() => math.receivableStatus(1n, 0n, '2026-02-30', '2026-03-01'));
});

test('boundary cases: 100% discount, half-rupiah rounding, leap day, and same-day due dates', () => {
  const item = { description: 'Demo', quantityMilli: 500n, price: 1n };
  assert.equal(math.invoice([item]).subtotal, 1n);
  assert.equal(math.invoice([{ ...item, quantityMilli: 499n }]).subtotal, 0n);
  const free = math.invoice([item], { discountRate: 10000n });
  assert.equal(free.total, 0n);
  assert.equal(free.balance, 0n);
  assert.throws(() => math.invoice([item], { discountRate: 10000n, paid: 1n }));
  assert.equal(math.receivableStatus(1n, 0n, '2024-02-28', '2024-03-01').daysLate, 2);
  assert.equal(math.receivableStatus(1n, 0n, '2026-03-01', '2026-03-01').daysLate, 0);
});

test('200 deterministic scenarios preserve invoice and ledger accounting identities', () => {
  for (let i = 1; i <= 200; i++) {
    const price = BigInt(i) * 999999999999n;
    const items = [
      { description: 'A', quantityMilli: BigInt(i * 37), price },
      { description: 'B', quantityMilli: BigInt(i * 11), price: price + 1n }
    ];
    const unpaid = math.invoice(items, { discountRate: BigInt(i % 101) * 100n });
    const paid = unpaid.total / 3n;
    const invoice = math.invoice(items, { discountRate: BigInt(i % 101) * 100n, paid });
    assert.equal(invoice.subtotal, invoice.rows.reduce((sum, row) => sum + row.total, 0n));
    assert.equal(invoice.total + invoice.discount, invoice.subtotal);
    assert.equal(invoice.balance + invoice.paid, invoice.total);
    assert.ok(invoice.balance >= 0n);
    const ledger = math.ledger(-price, [
      { date: '2026-01-01', description: 'Awal', side: 'in', amount: price * 2n },
      { date: '2026-02-01', description: 'Masuk', side: 'in', amount: price },
      { date: '2026-02-02', description: 'Keluar', side: 'out', amount: price / 2n },
      { date: '2026-03-01', description: 'Setelah', side: 'out', amount: 1n }
    ], { from: '2026-02-01', to: '2026-02-28' });
    assert.equal(ledger.openingBalance + ledger.totalIncoming - ledger.totalOutgoing, ledger.finalBalance);
  }
});

test('optional invoice VAT is computed after discount and included in outstanding balance', () => {
  const items = [{ description: 'Jasa demo', quantity: 1n, price: 100000n }];
  const general = math.invoice(items, { discount: 10000n, paid: 20000n, taxMode: 'effective11' });
  assert.equal(general.net, 90000n);
  assert.equal(general.vat, 9900n);
  assert.equal(general.total, 99900n);
  assert.equal(general.balance, 79900n);
  assert.equal(general.dppNumerator, 990000n);
  assert.equal(general.dppDenominator, 12n);
  const luxury = math.invoice(items, { discount: 10000n, taxMode: 'full12' });
  assert.equal(luxury.vat, 10800n);
  assert.equal(luxury.total, 100800n);
  const untaxed = math.invoice(items);
  assert.equal(untaxed.vat, 0n);
  assert.equal(untaxed.total, 100000n);
  assert.throws(() => math.invoice(items, { taxMode: 'unknown' }));
});

test('VAT avoids intermediate DPP rounding and handles zero, full discounts, and payment boundaries', () => {
  const item = { description: 'Demo', quantity: 1n, price: 50n };
  assert.equal(math.invoice([item], { taxMode: 'effective11' }).vat, 6n);
  assert.equal(math.invoice([item], { discountRate: 10000n, taxMode: 'full12' }).vat, 0n);
  assert.equal(math.invoice([item], { paid: 56n, taxMode: 'effective11' }).balance, 0n);
  assert.throws(() => math.invoice([item], { paid: 57n, taxMode: 'effective11' }));
  for (let i = 1; i <= 200; i++) {
    const invoice = math.invoice([{ ...item, price: BigInt(i) * 99999999999n }], {
      taxMode: i % 2 ? 'effective11' : 'full12', discountRate: BigInt(i % 101) * 100n
    });
    assert.equal(invoice.net + invoice.vat, invoice.total);
    assert.equal(invoice.total - invoice.paid, invoice.balance);
  }
});

test('invoice terbilang is exact for zero, Indonesian special forms, and large amounts', () => {
  for (const [amount, words] of [
    [0n, 'Nol rupiah'], [11n, 'Sebelas rupiah'], [100n, 'Seratus rupiah'],
    [1000n, 'Seribu rupiah'], [1001n, 'Seribu satu rupiah'],
    [466000n, 'Empat ratus enam puluh enam ribu rupiah'],
    [1000000n, 'Satu juta rupiah'], [-12n, 'Minus dua belas rupiah'],
    [1000000000000000000000000n, 'Satu septiliun rupiah']
  ]) assert.equal(math.rupiahWords(amount), words);
});
