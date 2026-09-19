"use client";

import type { ReactNode } from "react";

type Props = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  extra?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "확인",
  danger,
  extra,
  onCancel,
  onConfirm,
}: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md bg-ink-800 p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-brass-400">확인이 필요합니다</p>
        <h2 className="mt-2 text-lg font-semibold">{title}</h2>
        <p className="mt-3 whitespace-pre-line text-sm leading-6 text-cream-100">{body}</p>
        {extra}
        <div className="mt-5 flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={onCancel} type="button">
            닫기
          </button>
          <button className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={onConfirm} type="button">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
