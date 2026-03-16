"use client";

import {
  ALL_PERMISSION_AREAS,
  AREA_LABELS,
  PERMISSION_TEMPLATES,
  type PermissionArea,
  type AreaPermissions,
  type PermissionTemplateKey,
  TEMPLATE_LABELS,
} from "@/lib/auth/permissions-shared";

export type PermissionsMap = Record<PermissionArea, AreaPermissions>;

type Props = {
  permissions: PermissionsMap;
  onChange: (next: PermissionsMap) => void;
  readOnly?: boolean;
  showTemplateSelector?: boolean;
};

const OP_LABELS = [
  { key: "can_read" as const, label: "Ler", locked: true },
  { key: "can_write" as const, label: "Escrever", locked: false },
  { key: "can_edit" as const, label: "Editar", locked: false },
  { key: "can_delete" as const, label: "Apagar", locked: false },
];

function emptyPermissions(): PermissionsMap {
  return Object.fromEntries(
    ALL_PERMISSION_AREAS.map((a) => [
      a,
      { can_read: true, can_write: false, can_edit: false, can_delete: false },
    ]),
  ) as PermissionsMap;
}

export function buildPermissionsFromArray(
  rows: Array<{ area: string; can_read: boolean; can_write: boolean; can_edit: boolean; can_delete: boolean }>,
): PermissionsMap {
  const base = emptyPermissions();
  for (const row of rows) {
    if (row.area in base) {
      base[row.area as PermissionArea] = {
        can_read: true, // always true
        can_write: row.can_write,
        can_edit: row.can_edit,
        can_delete: row.can_delete,
      };
    }
  }
  return base;
}

export function templateToPermissions(key: PermissionTemplateKey): PermissionsMap {
  const tpl = PERMISSION_TEMPLATES[key];
  return { ...tpl };
}

export function PermissionsGrid({ permissions, onChange, readOnly, showTemplateSelector }: Props) {
  function toggle(area: PermissionArea, op: keyof AreaPermissions) {
    if (readOnly || op === "can_read") return;
    const next = { ...permissions };
    next[area] = { ...next[area], [op]: !next[area][op] };
    onChange(next);
  }

  function applyTemplate(key: PermissionTemplateKey) {
    onChange(templateToPermissions(key));
  }

  return (
    <div className="space-y-3">
      {showTemplateSelector && !readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Aplicar template:</span>
          {(Object.keys(TEMPLATE_LABELS) as PermissionTemplateKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => applyTemplate(key)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {TEMPLATE_LABELS[key]}
            </button>
          ))}
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden sm:block">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-1.5 text-slate-500 font-medium">Área</th>
              {OP_LABELS.map((op) => (
                <th key={op.key} className="text-center py-1.5 text-slate-500 font-medium w-16">
                  {op.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_PERMISSION_AREAS.map((area) => (
              <tr key={area} className="border-b border-slate-50">
                <td className="py-1.5 text-slate-700">{AREA_LABELS[area]}</td>
                {OP_LABELS.map((op) => (
                  <td key={op.key} className="text-center py-1.5">
                    <ToggleCheck
                      checked={permissions[area][op.key]}
                      locked={op.locked || readOnly}
                      onChange={() => toggle(area, op.key)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {ALL_PERMISSION_AREAS.map((area) => (
          <div key={area} className="rounded-lg border border-slate-100 p-2.5">
            <p className="text-xs font-medium text-slate-700 mb-1.5">{AREA_LABELS[area]}</p>
            <div className="flex flex-wrap gap-1.5">
              {OP_LABELS.map((op) => (
                <button
                  key={op.key}
                  type="button"
                  onClick={() => toggle(area, op.key)}
                  disabled={op.locked || readOnly}
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                    permissions[area][op.key]
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-400"
                  } ${op.locked || readOnly ? "cursor-default" : "cursor-pointer hover:opacity-80"}`}
                >
                  {op.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToggleCheck({ checked, locked, onChange }: { checked: boolean; locked?: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={locked}
      className={`inline-flex h-5 w-5 items-center justify-center rounded transition-colors ${
        checked
          ? "bg-emerald-500 text-white"
          : "bg-slate-100 text-slate-300"
      } ${locked ? "cursor-default opacity-70" : "cursor-pointer hover:opacity-80"}`}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
