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
const knowledge = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("lib/character-knowledge.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: knowledge });
const subject = { id: "peer", name: "B", persona: "完整背景及秘密", personality: "耐心", briefPersona: "公开简介" };
assert.equal(knowledge.renderKnownCharacter(subject, undefined, ""), "公开简介");
assert.match(knowledge.renderKnownCharacter(subject, { mode: "full" }, ""), /完整背景及秘密/);
assert.equal(knowledge.renderKnownCharacter(subject, { mode: "custom", customText: "A只知道B是医生" }, ""), "A只知道B是医生");
assert.equal(knowledge.renderKnownCharacter(subject, { trigger: "off", mode: "full" }, ""), "");
assert.equal(knowledge.renderKnownCharacter(subject, { trigger: "keywords", keywords: "医院,Doctor" }, "今天遇到DOCTOR"), "公开简介");
assert.equal(knowledge.renderKnownCharacter(subject, { trigger: "keywords", keywords: "医院" }, "聊音乐"), "");
assert.equal(knowledge.renderKnownCharacter(subject, { trigger: "keywords", keywords: "" }, ""), "");
assert.notEqual(knowledge.knowledgeKey("A", "B"), knowledge.knowledgeKey("B", "A"));
// Exercise real world storage normalization and prompt formatting with in-memory persistence.
const storedWorlds = new Map();
const worldExports = {};
const worldMocks = {
  "./character-knowledge": knowledge,
  "./character-storage": { loadCharacters: () => [{ ...subject, id: "A" }, subject] },
  "./chat-storage": { loadChatContacts: () => [] },
  "./kv-db": { registerKvMigration: () => {}, kvGet: key => storedWorlds.get(key) || null, kvSet: (key, value) => storedWorlds.set(key, value) },
};
const worldSource = ts.transpileModule(fs.readFileSync("lib/character-world-storage.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
vm.runInNewContext(worldSource, { exports: worldExports, require: key => { assert.ok(worldMocks[key], key); return worldMocks[key]; }, window: { dispatchEvent: () => {} }, CustomEvent: class {} });
const world = worldExports.createCharacterWorldGroup("测试世界");
worldExports.moveCharacterToWorld("A", world.id);
worldExports.moveCharacterToWorld("peer", world.id);
worldExports.addCharacterWorldRelation(world.id, "A", "peer", "同事");
worldExports.updateCharacterKnowledgeRule(world.id, "A", "peer", { ...knowledge.DEFAULT_KNOWLEDGE_RULE, mode: "full", trigger: "keywords", keywords: "医院" });
assert.equal(worldExports.loadCharacterWorldGroups().find(item => item.id === world.id).knowledgeRules[knowledge.knowledgeKey("A", "peer")].mode, "full");
assert.doesNotMatch(worldExports.formatCharacterRelationsForPrompt("A", "音乐"), /完整背景及秘密/);
assert.match(worldExports.formatCharacterRelationsForPrompt("A", "医院"), /完整背景及秘密/);
worldExports.updateCharacterKnowledgeRule(world.id, "A", "peer", { ...knowledge.DEFAULT_KNOWLEDGE_RULE, mode: "custom", customText: "只知道职业" });
assert.match(worldExports.formatCharacterRelationsForPrompt("A", ""), /只知道职业/);
assert.doesNotMatch(worldExports.formatCharacterRelationsForPrompt("A", ""), /完整背景及秘密/);
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
  for (const file of ["components/phone-character-app.tsx", "components/character/bulk-import-sheet.tsx", "components/character/relation-dialogs.tsx", "lib/llm-prompt-assembler.ts", "lib/character-world-storage.ts"]) {
    const check = ts.transpileModule(fs.readFileSync(file, "utf8"), { fileName: file, reportDiagnostics: true, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } });
    assert.equal(check.diagnostics.length, 0, file);
  }
  console.log("PASS: character import, role identity, directional knowledge, full/custom/brief modes, keyword/off triggers, real storage normalization and prompt formatting, TSX syntax");
})().catch(error => { console.error(error); process.exitCode = 1; });

