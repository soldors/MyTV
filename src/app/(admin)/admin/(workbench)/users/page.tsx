'use client';

// 用户管理（M4）：审批 / 禁用 / 启用 / 重置密码 / 删除（级联清理云端数据）。
// 密码重置审批（忘记密码流程）：用户申请 → 站长批准生成一次性重置码 → 用户自助重置。
// 站长（admin，环境变量派生）不在此列。

import { useCallback, useEffect, useState } from 'react';
import {
  approvePasswordReset,
  deleteUser,
  listPasswordResets,
  listUsers,
  rejectPasswordReset,
  resetUserPassword,
  updateUserStatus,
  type PasswordResetRequestView,
} from '@/lib/admin-api';
import type { StoredUser } from '@/lib/storage';
import { AdminLoading, useRequireAdmin } from '@/components/admin/admin-guard';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<StoredUser['status'], { text: string; className: string }> = {
  pending: { text: '待审批', className: 'bg-rating/15 text-rating' },
  active: { text: '正常', className: 'bg-[#3FB950]/15 text-[#3FB950]' },
  disabled: { text: '已禁用', className: 'bg-accent/15 text-accent' },
};

const RESET_STATUS_LABEL: Record<PasswordResetRequestView['status'], { text: string; className: string }> = {
  pending: { text: '待审批', className: 'bg-rating/15 text-rating' },
  approved: { text: '已批准', className: 'bg-[#3FB950]/15 text-[#3FB950]' },
  rejected: { text: '已拒绝', className: 'bg-overlay text-t3' },
  used: { text: '已使用', className: 'bg-overlay text-t3' },
};

const fmtTime = (ts?: number) =>
  ts ? new Date(ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

/** 密码重置审批区：批准时生成的一次性重置码仅当场展示（明文不落库，刷新即不可见） */
function ResetRequestsSection({ onChanged }: { onChanged: () => void }) {
  const [requests, setRequests] = useState<PasswordResetRequestView[] | null>(null);
  /** id → 本次会话批准时拿到的重置码明文 */
  const [issuedCodes, setIssuedCodes] = useState<Record<number, string>>({});

  const reload = useCallback(() => {
    void listPasswordResets().then((r) => setRequests(r.requests)).catch(() => setRequests([]));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // 只关心近期待处理的：pending 全显，其余只显示 7 天内的（列表别被历史淹没）
  const visible = (requests ?? []).filter(
    (r) => r.status === 'pending' || Date.now() - (r.decidedAt ?? r.createdAt) < 7 * 24 * 3600 * 1000
  );
  const pendingCount = (requests ?? []).filter((r) => r.status === 'pending').length;

  if (requests === null || visible.length === 0) return null;

  async function act(id: number, action: 'approve' | 'reject') {
    try {
      if (action === 'approve') {
        const res = await approvePasswordReset(id);
        setIssuedCodes((prev) => ({ ...prev, [id]: res.code }));
      } else {
        await rejectPasswordReset(id);
      }
      reload();
      onChanged();
    } catch {
      reload();
    }
  }

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-t1">密码重置申请</h2>
        {pendingCount > 0 && <p className="text-xs text-rating">{pendingCount} 个待审批</p>}
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border border-overlay/60 bg-elevated">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-overlay/60 text-left text-[11px] text-t3">
              <th className="px-4 py-2 font-normal">用户名</th>
              <th className="px-3 py-2 font-normal">申请时间</th>
              <th className="px-3 py-2 font-normal">状态</th>
              <th className="px-4 py-2 text-right font-normal">操作 / 重置码</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const label = RESET_STATUS_LABEL[r.status];
              const expired = r.status === 'approved' && r.expiresAt !== undefined && r.expiresAt < Date.now();
              return (
                <tr key={r.id} className="border-b border-overlay/40 last:border-0">
                  <td className="px-4 py-2.5 text-sm text-t1">{r.username}</td>
                  <td className="px-3 py-2.5 text-xs text-t3">{fmtTime(r.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <span className={cn('rounded px-2 py-0.5 text-[11px]', label.className)}>
                      {expired ? '已过期' : label.text}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap">
                    {r.status === 'pending' ? (
                      <>
                        <button
                          onClick={() => void act(r.id, 'approve')}
                          className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
                        >
                          批准
                        </button>
                        <button
                          onClick={() => void act(r.id, 'reject')}
                          className="ml-2 rounded-lg border border-overlay px-2.5 py-1 text-xs text-t2 hover:text-accent"
                        >
                          拒绝
                        </button>
                      </>
                    ) : issuedCodes[r.id] ? (
                      <span className="font-mono text-xs text-rating" title="一次性重置码，请复制告知用户；关闭页面后不可再查看">
                        {issuedCodes[r.id]}
                      </span>
                    ) : (
                      <span className="text-[11px] text-t3">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-t3">
        批准后生成一次性重置码（24 小时有效），复制发给用户，用户在登录页「忘记密码？」中自助设置新密码；重置码仅批准时显示一次。
      </p>
    </div>
  );
}

function UserRow({ user, onChanged }: { user: StoredUser; onChanged: () => void }) {
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const status = STATUS_LABEL[user.status];

  async function act(fn: () => Promise<void>) {
    try {
      await fn();
      onChanged();
    } catch {
      /* 列表刷新呈现真实状态 */
    }
  }

  return (
    <tr className="border-b border-overlay/40 last:border-0">
      <td className="px-4 py-2.5 text-sm text-t1">{user.name}</td>
      <td className="px-3 py-2.5 text-xs text-t2">{user.role === 'admin' ? '管理员' : '用户'}</td>
      <td className="px-3 py-2.5">
        <span className={cn('rounded px-2 py-0.5 text-[11px]', status.className)}>{status.text}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-t3">{new Date(user.createdAt).toLocaleDateString()}</td>
      <td className="px-4 py-2.5 text-right whitespace-nowrap">
        {user.status === 'pending' && (
          <button
            onClick={() => void act(() => updateUserStatus(user.name, 'active'))}
            className="rounded-lg bg-accent px-2.5 py-1 text-xs font-medium text-white hover:opacity-90"
          >
            批准
          </button>
        )}
        {user.status === 'active' && (
          <button
            onClick={() => void act(() => updateUserStatus(user.name, 'disabled'))}
            className="rounded-lg border border-overlay px-2.5 py-1 text-xs text-t2 hover:text-t1"
          >
            禁用
          </button>
        )}
        {user.status === 'disabled' && (
          <button
            onClick={() => void act(() => updateUserStatus(user.name, 'active'))}
            className="rounded-lg border border-overlay px-2.5 py-1 text-xs text-t2 hover:text-t1"
          >
            启用
          </button>
        )}
        <button
          onClick={() => setResetting((v) => !v)}
          className="ml-2 rounded-lg border border-overlay px-2.5 py-1 text-xs text-t2 hover:text-t1"
        >
          重置密码
        </button>
        <button
          onClick={() => (confirmingDelete ? void act(() => deleteUser(user.name)) : setConfirmingDelete(true))}
          className={cn(
            'ml-2 rounded-lg px-2.5 py-1 text-xs transition',
            confirmingDelete ? 'bg-accent text-white' : 'border border-overlay text-t2 hover:text-accent'
          )}
        >
          {confirmingDelete ? '确认删除' : '删除'}
        </button>

        {resetting && (
          <div className="mt-2 flex justify-end gap-2">
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="新密码（≥6 位）"
              className="rounded-lg border border-overlay bg-bg px-2.5 py-1 text-xs text-t1 outline-none focus:border-accent"
            />
            <button
              onClick={() =>
                void act(async () => {
                  await resetUserPassword(user.name, newPassword);
                  setNewPassword('');
                  setResetting(false);
                })
              }
              disabled={newPassword.length < 6}
              className="rounded-lg bg-accent px-3 py-1 text-xs text-white disabled:opacity-40"
            >
              保存
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

export default function AdminUsersPage() {
  const { ready } = useRequireAdmin();
  const [users, setUsers] = useState<StoredUser[] | null>(null);

  const reload = useCallback(() => {
    void listUsers().then((r) => setUsers(r.users)).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    if (ready) reload();
  }, [ready, reload]);

  if (!ready) return <AdminLoading />;

  const pending = (users ?? []).filter((u) => u.status === 'pending').length;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold text-t1">用户</h1>
        {pending > 0 && <p className="text-xs text-rating">{pending} 个待审批</p>}
      </div>

      {users === null ? (
        <div className="mt-5 h-32 animate-pulse rounded-lg bg-elevated" />
      ) : users.length === 0 ? (
        <p className="mt-5 text-xs text-t3">暂无注册用户（站长由环境变量 PASSWORD 管理，不在此列）</p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded-lg border border-overlay/60 bg-elevated">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-overlay/60 text-left text-[11px] text-t3">
                <th className="px-4 py-2 font-normal">用户名</th>
                <th className="px-3 py-2 font-normal">角色</th>
                <th className="px-3 py-2 font-normal">状态</th>
                <th className="px-3 py-2 font-normal">注册时间</th>
                <th className="px-4 py-2 text-right font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.name} user={u} onChanged={reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ResetRequestsSection onChanged={reload} />

      <p className="mt-4 text-[11px] leading-relaxed text-t3">
        删除用户会同时清理其云端播放记录、收藏与搜索历史；重置密码立即生效（旧会话最迟 90 天自然过期）。
      </p>
    </div>
  );
}
