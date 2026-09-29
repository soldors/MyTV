'use client';

// 用户管理（M4）：审批 / 禁用 / 启用 / 重置密码 / 删除（级联清理云端数据）。
// 站长（admin，环境变量派生）不在此列。

import { useCallback, useEffect, useState } from 'react';
import { deleteUser, listUsers, resetUserPassword, updateUserStatus } from '@/lib/admin-api';
import type { StoredUser } from '@/lib/storage';
import { AdminLoading, useRequireAdmin } from '@/components/admin/admin-guard';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<StoredUser['status'], { text: string; className: string }> = {
  pending: { text: '待审批', className: 'bg-rating/15 text-rating' },
  active: { text: '正常', className: 'bg-[#3FB950]/15 text-[#3FB950]' },
  disabled: { text: '已禁用', className: 'bg-accent/15 text-accent' },
};

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

      <p className="mt-4 text-[11px] leading-relaxed text-t3">
        删除用户会同时清理其云端播放记录、收藏与搜索历史；重置密码立即生效（旧会话最迟 90 天自然过期）。
      </p>
    </div>
  );
}
