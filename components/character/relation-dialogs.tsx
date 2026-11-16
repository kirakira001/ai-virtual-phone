"use client";

// 画布拉线的两个纸片风弹窗：
// RelationLinkDialog —— 点照片A→照片B后输入关系标签
// RelationPairSheet —— 点线上标签，逐条查看/删除两人之间的关系

import { useState } from "react";
import type { CharacterWorldRelation } from "@/lib/character-world-storage";
import { DEFAULT_KNOWLEDGE_RULE, knowledgeKey, type KnowledgeRule } from "@/lib/character-knowledge";

export function RelationLinkDialog({
  fromName,
  toName,
  onConfirm,
  onCancel,
}: {
  fromName: string;
  toName: string;
  onConfirm: (label: string) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState("");
  const submit = () => {
    if (!label.trim()) return;
    onConfirm(label.trim());
  };
  return (
    <div className="wt-modal" onClick={onCancel}>
      <div className="wt-paper" onClick={e => e.stopPropagation()}>
        <div className="wt-paper-tape" aria-hidden />
        <div className="wt-paper-kicker">RED STRING</div>
        <div className="wt-relation-row">
          <strong>{fromName}</strong>
          <span className="wt-relation-dash">是</span>
          <strong>{toName}</strong>
          <span className="wt-relation-dash">的…</span>
        </div>
        <input
          className="wt-paper-input"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          placeholder="如：哥哥 / 宿敌 / 上司"
        />
        <div className="wt-paper-actions">
          <button type="button" className="wt-btn" onClick={onCancel}>取消</button>
          <span className="wt-paper-spacer" />
          <button type="button" className="wt-btn wt-btn-primary" disabled={!label.trim()} onClick={submit}>牵线</button>
        </div>
      </div>
    </div>
  );
}

export function RelationPairSheet({
  relations,
  nameById,
  onDelete,
  onClose,
  knowledgeRules,
  onKnowledgeChange,
}: {
  /** 这对角色之间的全部关系（两个方向都算） */
  relations: CharacterWorldRelation[];
  nameById: Map<string, string>;
  onDelete: (relationId: string) => void;
  onClose: () => void;
  knowledgeRules?: Record<string, KnowledgeRule>;
  onKnowledgeChange: (viewerId: string, subjectId: string, rule: KnowledgeRule) => void;
}) {
  const pair = relations[0];
  return (
    <div className="wt-modal" onClick={onClose}>
      <div className="wt-paper" style={{ maxHeight: "85dvh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        <div className="wt-paper-tape" aria-hidden />
        <div className="wt-paper-kicker">RELATIONS</div>
        {pair && [
          [pair.fromCharacterId, pair.toCharacterId],
          [pair.toCharacterId, pair.fromCharacterId],
        ].map(([viewer, subject]) => <KnowledgeEditor key={knowledgeKey(viewer, subject)} viewerName={nameById.get(viewer) || "?"} subjectName={nameById.get(subject) || "?"} initialRule={knowledgeRules?.[knowledgeKey(viewer, subject)]} onSave={rule => onKnowledgeChange(viewer, subject, rule)} />)}
        {relations.length === 0 ? (
          <p className="wt-paper-hint">这两人之间已经没有关系线了。</p>
        ) : (
          <ul className="wt-relation-list">
            {relations.map(relation => (
              <li key={relation.id} className="wt-relation-item">
                <span className="wt-relation-text">
                  {nameById.get(relation.fromCharacterId) ?? "?"}
                  是{nameById.get(relation.toCharacterId) ?? "?"}的
                  「{relation.label}」
                </span>
                <button
                  type="button"
                  className="wt-btn wt-btn-danger wt-btn-small"
                  onClick={() => onDelete(relation.id)}
                  aria-label="删除这条关系"
                >
                  剪断
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="wt-paper-actions">
          <span className="wt-paper-spacer" />
          <button type="button" className="wt-btn wt-btn-primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}

function KnowledgeEditor({ viewerName, subjectName, initialRule, onSave }: { viewerName: string; subjectName: string; initialRule?: KnowledgeRule; onSave: (rule: KnowledgeRule) => void }) {
  const [rule, setRule] = useState<KnowledgeRule>({ ...DEFAULT_KNOWLEDGE_RULE, ...initialRule });
  const [saved, setSaved] = useState(false);
  const patch = (value: Partial<KnowledgeRule>) => { setRule(previous => ({ ...previous, ...value })); setSaved(false); };
  return <fieldset className="mt-3 mb-4 border-t pt-3">
    <legend>{viewerName} 了解 {subjectName} 的资料</legend>
    <label className="wt-paper-label">资料范围</label>
    <select className="wt-paper-input" value={rule.mode} onChange={event => patch({ mode: event.target.value as KnowledgeRule["mode"] })}>
      <option value="brief">现有简量人设</option><option value="full">完整角色背景</option><option value="custom">自定义可知资料</option>
    </select>
    {rule.mode === "full" && <p className="wt-paper-hint">完整背景可能包含秘密；选择此项等于允许带入全部背景，且增加请求长度。</p>}
    {rule.mode === "custom" && <textarea aria-label={`${viewerName}对${subjectName}的可知资料`} className="wt-paper-textarea" value={rule.customText} onChange={event => patch({ customText: event.target.value })} placeholder="由你决定这个人知道哪些事情，不必写成标签。" />}
    <label className="wt-paper-label">注入时机</label>
    <select className="wt-paper-input" value={rule.trigger} onChange={event => patch({ trigger: event.target.value as KnowledgeRule["trigger"] })}>
      <option value="always">始终</option><option value="keywords">关键词命中</option><option value="off">不注入人物资料</option>
    </select>
    {rule.trigger === "keywords" && <><input aria-label="触发关键词" className="wt-paper-input" value={rule.keywords} onChange={event => patch({ keywords: event.target.value })} placeholder="关键词用逗号分隔，命中任意一个即可" /><p className="wt-paper-hint">检查最近 6 条聊天文本，不区分英文大小写，不递归触发；没有关键词时不注入。</p></>}
    <p className="wt-paper-hint">这里只控制此方向的人物资料。世界描述、姓名和关系线仍按原逻辑发送；不修改对方自己的角色卡。</p>
    <button className="wt-btn" disabled={rule.trigger === "keywords" && !rule.keywords.trim()} onClick={() => { onSave(rule); setSaved(true); }}>{saved ? "已保存" : "保存此方向设置"}</button>
  </fieldset>;
}

