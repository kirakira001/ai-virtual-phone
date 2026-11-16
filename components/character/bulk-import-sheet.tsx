"use client";

import { useEffect, useRef, useState } from "react";
import { loadApiConfigs } from "@/lib/settings-storage";
import { commitCharacterDrafts, extractCharacterDrafts, type ImportDraft } from "@/lib/character-lab";

export function BulkImportSheet({ worldId, onClose, onImported }: { worldId: string; onClose: () => void; onImported: () => void }) {
  const [configs] = useState(() => loadApiConfigs());
  const [apiId, setApiId] = useState(configs[0]?.id || "");
  const [source, setSource] = useState("");
  const [drafts, setDrafts] = useState<ImportDraft[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const patch = (index: number, value: Partial<ImportDraft>) => setDrafts(items => items?.map((item, i) => i === index ? { ...item, ...value } : item) || null);
  async function parse() {
    setError(""); setBusy(true);
    abort.current = new AbortController();
    try { setDrafts(await extractCharacterDrafts(source, apiId, abort.current.signal)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  function save() {
    try { if (drafts) { commitCharacterDrafts(drafts, worldId); onImported(); } }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  }
  return <div className="wt-modal" onClick={busy ? undefined : onClose}>
    <div className="wt-paper" style={{ maxHeight: "85dvh", overflowY: "auto" }} onClick={event => event.stopPropagation()}>
      <div className="wt-paper-kicker">批量导入角色 · 测试版</div>
      {!drafts ? <>
        <p className="wt-paper-hint">粘贴多位角色的资料。解析会发送至你选择的模型接口，确认预览前不会写入角色。</p>
        <label className="wt-paper-label">解析 API</label>
        <select className="wt-paper-input" value={apiId} onChange={event => setApiId(event.target.value)} disabled={busy}>
          {configs.map(config => <option key={config.id} value={config.id}>{config.name || config.id}</option>)}
        </select>
        {!configs.length && <p>请先在设置中配置 API。</p>}
        <textarea aria-label="待导入的角色资料" className="wt-paper-textarea" style={{ minHeight: 220 }} value={source} onChange={event => setSource(event.target.value)} disabled={busy} placeholder="把角色名字、背景、性格和世界设定一起粘贴到这里…" />
        <button className="wt-btn wt-btn-primary" onClick={parse} disabled={busy || !source.trim() || !apiId}>{busy ? "正在整理…" : "智能整理并预览"}</button>
      </> : <>
        <p className="wt-paper-hint">请核对身份和世界。不覆盖已有角色；具名世界将新建为“世界名（导入）”。世界名相同的角色归入同一世界，世界描述以第一位为准。</p>
        {drafts.map((draft, index) => <fieldset key={index} className="mt-4 border-t pt-3">
          <label className="wt-paper-label">姓名</label>
          <input className="wt-paper-input" value={draft.name} onChange={event => patch(index, { name: event.target.value })} />
          <label className="wt-paper-label">角色身份</label>
          <select className="wt-paper-input" value={draft.role} onChange={event => patch(index, { role: event.target.value as ImportDraft["role"] })}><option value="main">主要角色</option><option value="npc">NPC / 配角</option></select>
          <label className="wt-paper-label">角色背景</label>
          <textarea className="wt-paper-textarea" value={draft.background} onChange={event => patch(index, { background: event.target.value })} />
          <label className="wt-paper-label">所属世界（空白表示当前世界）</label>
          <input className="wt-paper-input" value={draft.world} onChange={event => patch(index, { world: event.target.value })} />
          <label className="wt-paper-label">世界背景</label>
          <textarea className="wt-paper-textarea" value={draft.worldDescription} onChange={event => patch(index, { worldDescription: event.target.value })} />
          <button className="wt-btn" onClick={() => setDrafts(items => items?.filter((_, i) => i !== index) || [])}>移除此角色</button>
        </fieldset>)}
        <div className="wt-paper-actions mt-4"><button className="wt-btn" onClick={() => setDrafts(null)}>返回资料</button><button className="wt-btn wt-btn-primary" disabled={!drafts.length || drafts.some(draft => !draft.name.trim() || !draft.background.trim())} onClick={save}>确认导入 {drafts.length} 位</button></div>
      </>}
      {error && <p role="alert" className="wt-paper-confirm mt-2">{error}</p>}
      <button className="wt-btn mt-3" disabled={busy} onClick={onClose}>关闭</button>
    </div>
  </div>;
}

