import React, { useState, useEffect } from 'react';
import { WEBVIEW_STRINGS, type Language } from '../i18n';
import { Icon } from './Icon';
import {
  mdiAccountMultipleOutline,
  mdiClose,
  mdiPlus,
  mdiDeleteOutline,
  mdiCheck,
  mdiInformationOutline,
} from '@mdi/js';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  detectedAuthors: string[];
  initialAliases?: Record<string, string[]>;
  language: Language;
  onSave: (target: 'settings' | 'mailmap', aliases: Record<string, string[]>) => void;
}

interface AliasGroup {
  id: string;
  primary: string;
  aliases: string[];
}

export const AuthorAliasModal: React.FC<Props> = ({
  isOpen,
  onClose,
  detectedAuthors,
  initialAliases,
  language,
  onSave,
}) => {
  const t = WEBVIEW_STRINGS[language];
  const kStrings = t.knowledge;

  const [groups, setGroups] = useState<AliasGroup[]>([]);
  const [target, setTarget] = useState<'settings' | 'mailmap'>('settings');
  const [aliasInputs, setAliasInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    const initialList: AliasGroup[] = [];
    if (initialAliases && Object.keys(initialAliases).length > 0) {
      let idx = 0;
      for (const [primary, aliases] of Object.entries(initialAliases)) {
        initialList.push({
          id: `group-${idx++}`,
          primary,
          aliases: Array.isArray(aliases) ? [...aliases] : [],
        });
      }
    }
    setGroups(initialList);
    setAliasInputs({});
  }, [isOpen, initialAliases]);

  if (!isOpen) return null;

  // All aliases currently assigned to any group
  const assignedAliases = new Set<string>();
  groups.forEach((g) => {
    assignedAliases.add(g.primary.trim().toLowerCase());
    g.aliases.forEach((a) => assignedAliases.add(a.trim().toLowerCase()));
  });

  // Authors detected in repository that are not yet assigned anywhere
  const unassignedDetected = detectedAuthors.filter(
    (name) => !assignedAliases.has(name.trim().toLowerCase())
  );

  const handleAddGroup = (defaultPrimary = '') => {
    const newId = `group-${Date.now()}-${Math.random()}`;
    setGroups((prev) => [
      ...prev,
      { id: newId, primary: defaultPrimary, aliases: [] },
    ]);
  };

  const handleRemoveGroup = (groupId: string) => {
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
  };

  const handlePrimaryChange = (groupId: string, value: string) => {
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, primary: value } : g))
    );
  };

  const handleAddAlias = (groupId: string, aliasToAdd: string) => {
    const trimmed = aliasToAdd.trim();
    if (!trimmed) return;
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        if (g.aliases.some((a) => a.toLowerCase() === trimmed.toLowerCase())) return g;
        return { ...g, aliases: [...g.aliases, trimmed] };
      })
    );
    setAliasInputs((prev) => ({ ...prev, [groupId]: '' }));
  };

  const handleRemoveAlias = (groupId: string, aliasToRemove: string) => {
    setGroups((prev) =>
      prev.map((g) => {
        if (g.id !== groupId) return g;
        return {
          ...g,
          aliases: g.aliases.filter(
            (a) => a.toLowerCase() !== aliasToRemove.toLowerCase()
          ),
        };
      })
    );
  };

  const handleSave = () => {
    const result: Record<string, string[]> = {};
    for (const g of groups) {
      const primaryClean = g.primary.trim();
      const aliasesClean = g.aliases.map((a) => a.trim()).filter(Boolean);
      if (primaryClean && aliasesClean.length > 0) {
        result[primaryClean] = aliasesClean;
      }
    }
    onSave(target, result);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(2px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          maxHeight: '90vh',
          backgroundColor: 'var(--bg-primary, #1e1e1e)',
          border: '1px solid var(--border-color)',
          borderRadius: 8,
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: 'var(--text-primary)',
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-secondary, #252526)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon path={mdiAccountMultipleOutline} size={0.9} color="var(--accent-color)" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                {kStrings.aliasModalTitle}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {kStrings.aliasModalSubtitle}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              padding: 4,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title={kStrings.aliasCancelBtn}
          >
            <Icon path={mdiClose} size={0.8} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: '16px 18px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            flex: 1,
          }}
        >
          {/* Unassigned Authors Quick-Bar */}
          {unassignedDetected.length > 0 && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 6,
                backgroundColor: 'var(--bg-card, rgba(255,255,255,0.03))',
                border: '1px solid var(--border-color)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon path={mdiInformationOutline} size={0.65} color="var(--accent-color)" />
                <span>{kStrings.unassignedAuthorsTitle}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {unassignedDetected.map((authorName) => (
                  <button
                    key={authorName}
                    onClick={() => handleAddGroup(authorName)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 12,
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                    }}
                    title={`+ Neue Person mit "${authorName}" erstellen`}
                  >
                    <Icon path={mdiPlus} size={0.55} color="var(--accent-color)" />
                    <span>{authorName}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Alias Groups List */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {groups.length === 0 ? (
              <div
                style={{
                  padding: '24px 16px',
                  textAlign: 'center',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  border: '1px dashed var(--border-color)',
                  borderRadius: 6,
                }}
              >
                {kStrings.aliasNoGroups}
              </div>
            ) : (
              groups.map((group) => {
                const inputValue = aliasInputs[group.id] || '';
                return (
                  <div
                    key={group.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: 6,
                      backgroundColor: 'var(--bg-card, #252526)',
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    {/* Primary Name & Delete Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="text"
                        value={group.primary}
                        onChange={(e) => handlePrimaryChange(group.id, e.target.value)}
                        placeholder={kStrings.aliasGroupPrimaryPlaceholder}
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          fontSize: 12,
                          fontWeight: 600,
                          borderRadius: 4,
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-input, #1e1e1e)',
                          color: 'var(--text-primary)',
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={() => handleRemoveGroup(group.id)}
                        style={{
                          background: 'none',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: '6px 8px',
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                        }}
                        title={kStrings.aliasRemoveGroup}
                      >
                        <Icon path={mdiDeleteOutline} size={0.65} color="#ef4444" />
                      </button>
                    </div>

                    {/* Assigned Aliases Badges */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 24 }}>
                      {group.aliases.map((alias) => (
                        <span
                          key={alias}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '2px 8px',
                            borderRadius: 12,
                            backgroundColor: 'rgba(59, 130, 246, 0.15)',
                            border: '1px solid rgba(59, 130, 246, 0.35)',
                            fontSize: 11,
                            color: 'var(--accent-color)',
                          }}
                        >
                          <span>{alias}</span>
                          <button
                            onClick={() => handleRemoveAlias(group.id, alias)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              padding: 0,
                              display: 'flex',
                              alignItems: 'center',
                            }}
                            title="Alias entfernen"
                          >
                            <Icon path={mdiClose} size={0.5} />
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Add Alias Input + Quick Select Unassigned Dropdown */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) =>
                          setAliasInputs((prev) => ({ ...prev, [group.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddAlias(group.id, inputValue);
                          }
                        }}
                        placeholder={kStrings.aliasInputPlaceholder}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          fontSize: 11,
                          borderRadius: 4,
                          border: '1px solid var(--border-color)',
                          backgroundColor: 'var(--bg-input, #1e1e1e)',
                          color: 'var(--text-primary)',
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={() => handleAddAlias(group.id, inputValue)}
                        disabled={!inputValue.trim()}
                        style={{
                          padding: '5px 10px',
                          fontSize: 11,
                          borderRadius: 4,
                          border: '1px solid var(--border-color)',
                          backgroundColor: inputValue.trim() ? 'var(--accent-color)' : 'transparent',
                          color: inputValue.trim() ? '#fff' : 'var(--text-secondary)',
                          cursor: inputValue.trim() ? 'pointer' : 'default',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Icon path={mdiPlus} size={0.6} />
                      </button>

                      {/* Dropdown for quick-adding an unassigned author */}
                      {unassignedDetected.length > 0 && (
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAddAlias(group.id, e.target.value);
                              e.target.value = '';
                            }
                          }}
                          defaultValue=""
                          style={{
                            maxWidth: 160,
                            padding: '5px 6px',
                            fontSize: 11,
                            borderRadius: 4,
                            border: '1px solid var(--border-color)',
                            backgroundColor: 'var(--bg-input, #1e1e1e)',
                            color: 'var(--text-primary)',
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="" disabled>
                            {kStrings.aliasSelectAuthorPlaceholder}
                          </option>
                          {unassignedDetected.map((authorName) => (
                            <option key={authorName} value={authorName}>
                              + {authorName}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Add Group Button */}
            <button
              onClick={() => handleAddGroup('')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 6,
                border: '1px dashed var(--border-color)',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <Icon path={mdiPlus} size={0.7} color="var(--accent-color)" />
              <span>{kStrings.aliasGroupAdd}</span>
            </button>
          </div>

          {/* Storage Target Selector */}
          <div
            style={{
              marginTop: 4,
              padding: '10px 12px',
              borderRadius: 6,
              backgroundColor: 'var(--bg-card, rgba(255,255,255,0.03))',
              border: '1px solid var(--border-color)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              fontSize: 11,
            }}
          >
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
              {kStrings.aliasSaveTargetLabel}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="aliasTarget"
                checked={target === 'settings'}
                onChange={() => setTarget('settings')}
              />
              <span>{kStrings.aliasSaveTargetSettings}</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="radio"
                name="aliasTarget"
                checked={target === 'mailmap'}
                onChange={() => setTarget('mailmap')}
              />
              <span>{kStrings.aliasSaveTargetMailmap}</span>
            </label>
          </div>
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            backgroundColor: 'var(--bg-secondary, #252526)',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '6px 14px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid var(--border-color)',
              backgroundColor: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            {kStrings.aliasCancelBtn}
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '6px 16px',
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 4,
              border: 'none',
              backgroundColor: 'var(--accent-color, #3b82f6)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon path={mdiCheck} size={0.65} />
            <span>{kStrings.aliasSaveBtn}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
