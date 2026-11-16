const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

let characters = [];
let worlds = [];
let writes = 0;
let request;
let reply = { content: "" };
const mocks = {
  "./api-helpers": { simpleLLMCall: async (...args) => { request = args; return reply; } },
  "./settings-storage": { loadApiConfigs: () => [{ id: "test-api", apiKey: "not-a-real-key" }] },
  "./character-storage": {
    loadCharacters: () => characters,
    saveCharacters: next => { writes++; characters = next; },
    createCharacter: data => ({ ...data, id: `test-${characters.length}-${Math.random()}` }),
  },
  "./character-world-storage": {
    createCharacterWorldGroup: name => { const group = { id: `world-${worlds.length}`, name }; worlds.push(group); return group; },
    moveCharacterToWorld: (id, world) => { characters.find(character => character.id === id).world = world; },
    updateCharacterWorldDescription: (id, description) => { worlds.find(world => world.id === id).description = description; },
  },
};
const exportsObject = {};
const source = fs.readFileSync("lib/character-lab.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, reportDiagnostics: true });
assert.equal(compiled.diagnostics.length, 0);
vm.runInNewContext(compiled.outputText, { exports: exportsObject, require: name => { assert.ok(mocks[name], name); return mocks[name]; } });
const lab = exportsObject;
const draft = { name: "甲", background: "背景", world: "世界A", worldDescription: "世界说明", role: "npc" };

(async () => {
  assert.equal(lab.characterBackground({ persona: "经历", personality: "冷静" }), "经历\n\n性格：冷静");
  assert.equal(lab.characterBackground({ persona: "经历" }), "经历");
  assert.equal(JSON.stringify(lab.roleTags(["朋友", "配角"], "main")), '["朋友"]');
  assert.equal(JSON.stringify(lab.roleTags(["朋友"], "npc")), '["朋友","配角"]');
  const parsed = lab.parseImportDrafts("```json\n" + JSON.stringify([draft]) + "\n```");
  assert.equal(parsed[0].name, "甲");
  assert.equal(writes, 0, "preview must not write storage");
  assert.throws(() => lab.parseImportDrafts('[{"name":"缺背景"}]'));
  assert.throws(() => lab.parseImportDrafts("[]"));
  assert.throws(() => lab.parseImportDrafts('{"characters":"wrong"}'));
  assert.throws(() => lab.commitCharacterDrafts([draft, draft], "fallback"));
  assert.equal(writes, 0, "duplicate names must fail before writes");
  const created = lab.commitCharacterDrafts([draft, { ...draft, name: "乙", role: "main" }, { ...draft, name: "丙", world: "" }], "fallback");
  assert.equal(created.length, 3);
  assert.equal(worlds.length, 1, "same imported world must be shared");
  assert.equal(created[0].world, created[1].world);
  assert.equal(created[2].world, "fallback");
  assert.equal(created[0].tags[0], "配角");
  assert.equal(created[1].tags.length, 0);
  const id = created[0].id;
  created[0].tags = lab.roleTags(created[0].tags, "main");
  assert.equal(created[0].id, id, "switching role must retain identity");
  assert.throws(() => lab.commitCharacterDrafts([draft], "fallback"));
  assert.equal(characters.length, 3, "existing character must not be overwritten");
  await assert.rejects(lab.extractCharacterDrafts("", "test-api"));
  await assert.rejects(lab.extractCharacterDrafts("资料", "missing-api"));
  reply = { content: JSON.stringify([draft]), wasTruncated: true };
  await assert.rejects(lab.extractCharacterDrafts("资料", "test-api"));
  reply = { content: JSON.stringify([draft]) };
  const result = await lab.extractCharacterDrafts("资料", "test-api");
  assert.equal(result[0].name, "甲");
  assert.equal(request[1][1].content, "资料");
  for (const file of ["components/phone-character-app.tsx", "components/character/bulk-import-sheet.tsx"]) {
    const check = ts.transpileModule(fs.readFileSync(file, "utf8"), { fileName: file, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
    assert.equal(check.diagnostics.length, 0, file);
  }
  console.log("PASS: background merge, identity retention, parsing, preview isolation, duplicate protection, world assignment, API errors/truncation, TSX syntax");
})().catch(error => { console.error(error); process.exitCode = 1; });

