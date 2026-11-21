// Teste de fumaça do baseline. As features seguintes adicionam testes de
// rota/unidade aqui (node --test test/). O script `test` do package.json
// aponta para este diretório para não colidir com o teste Playwright do
// projeto estático antigo em build/dashboard/test.js.
const test = require("node:test");
const assert = require("node:assert/strict");

test("baseline: ambiente Node operacional", () => {
  assert.equal(1 + 1, 2);
});
