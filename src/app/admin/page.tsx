"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";

// ─── Types ───────────────────────────────────────────────────────────────────

type User = {
  _id: Id<"users">;
  _creationTime: number;
  name: string;
  age: number;
  profile: "General" | "Patient";
};

type EditState = {
  name: string;
  age: string;
  profile: "General" | "Patient";
};

// ─── Password Gate ────────────────────────────────────────────────────────────

function PasswordGate({ onUnlock }: { onUnlock: () => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const correct = process.env.NEXT_PUBLIC_ADMIN_PASSWORD;
    if (input === correct) {
      onUnlock();
    } else {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
      setInput("");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-rose-600/10 rounded-full blur-3xl" />
      </div>

      <div
        className={`relative z-10 w-full max-w-md bg-slate-900/80 border ${
          error ? "border-rose-500" : "border-slate-700"
        } rounded-2xl p-10 backdrop-blur-md shadow-2xl transition-colors duration-300 ${
          shake ? "animate-shake" : ""
        }`}
      >
        <div className="flex justify-center mb-6">
          <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center text-4xl shadow-inner">
            🔒
          </div>
        </div>

        <h1 className="text-3xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-400 mb-2">
          ADMIN PANEL
        </h1>
        <p className="text-slate-400 text-center text-sm mb-8">
          กรุณาใส่รหัสผ่านผู้ดูแลระบบ
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setError(false);
            }}
            placeholder="รหัสผ่าน..."
            autoFocus
            className={`w-full bg-slate-800 border-2 ${
              error ? "border-rose-500 text-rose-300" : "border-slate-600 text-white"
            } rounded-xl px-5 py-4 text-xl font-mono tracking-widest placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-colors`}
          />

          {error && (
            <p className="text-rose-400 text-sm text-center">
              ❌ รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง
            </p>
          )}

          <button
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-rose-600 to-orange-500 hover:from-rose-500 hover:to-orange-400 text-white font-bold text-lg rounded-xl transition-all duration-200 shadow-lg hover:scale-[1.02] active:scale-95"
          >
            เข้าสู่ระบบ Admin →
          </button>
        </form>

        <p className="text-slate-600 text-xs text-center mt-6">
          VRX Admin Panel • จัดการข้อมูลผู้ใช้
        </p>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-6px); }
          80%       { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.4s ease-in-out; }
      `}</style>
    </main>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────────────────

function EditUserModal({
  user,
  onSave,
  onClose,
}: {
  user: User;
  onSave: (data: EditState) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EditState>({
    name: user.name,
    age: String(user.age),
    profile: user.profile,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!form.name.trim() || !form.age) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl">
        <h2 className="text-2xl font-bold text-cyan-400 mb-6">✏️ แก้ไขข้อมูล</h2>

        <div className="flex flex-col gap-4 mb-6">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-slate-400">ชื่อ</span>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-slate-400">อายุ</span>
            <input
              type="number"
              value={form.age}
              onChange={(e) => setForm((p) => ({ ...p, age: e.target.value }))}
              min={1}
              max={120}
              className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-cyan-500"
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-widest text-slate-400">โปรไฟล์</span>
            <div className="flex gap-3">
              {(["General", "Patient"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setForm((prev) => ({ ...prev, profile: p }))}
                  className={`flex-1 py-3 rounded-xl border-2 font-semibold transition-all ${
                    form.profile === p
                      ? "bg-cyan-900/50 border-cyan-400 text-cyan-300"
                      : "bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-400"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-slate-800 border border-slate-600 rounded-xl text-slate-300 hover:bg-slate-700 transition-all"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-xl transition-all disabled:opacity-50"
          >
            {saving ? "กำลังบันทึก..." : "💾 บันทึก"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: "cyan" | "green" | "purple";
}) {
  const colors = {
    cyan: "from-cyan-900/40 border-cyan-800 text-cyan-400",
    green: "from-green-900/40 border-green-800 text-green-400",
    purple: "from-purple-900/40 border-purple-800 text-purple-400",
  };
  return (
    <div className={`bg-gradient-to-br ${colors[color]} border rounded-2xl p-5 flex flex-col gap-1`}>
      <span className="text-slate-400 text-sm">{label}</span>
      <span className="text-4xl font-extrabold">{value}</span>
    </div>
  );
}

// ─── User Row ─────────────────────────────────────────────────────────────────

function UserRow({
  user,
  isDeleting,
  confirmingDelete,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  user: User;
  isDeleting: boolean;
  confirmingDelete: boolean;
  onEdit: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  const createdDate = new Date(user._creationTime).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      className={`flex items-center justify-between px-6 py-4 transition-colors ${
        isDeleting ? "opacity-40 pointer-events-none" : "hover:bg-slate-800/40"
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600 flex items-center justify-center text-xl font-bold text-cyan-400 shrink-0">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-white text-lg leading-tight">{user.name}</p>
          <p className="text-slate-400 text-sm">
            อายุ {user.age} ปี •{" "}
            <span className={user.profile === "General" ? "text-green-400" : "text-purple-400"}>
              {user.profile}
            </span>{" "}
            • สร้างเมื่อ {createdDate}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {confirmingDelete ? (
          <>
            <span className="text-rose-400 text-sm font-medium mr-1">ยืนยันลบ?</span>
            <button
              onClick={onConfirmDelete}
              disabled={isDeleting}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-sm transition-all disabled:opacity-50"
            >
              {isDeleting ? "กำลังลบ..." : "✓ ลบเลย"}
            </button>
            <button
              onClick={onCancelDelete}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-sm transition-all"
            >
              ยกเลิก
            </button>
          </>
        ) : (
          <>
            <button
              onClick={onEdit}
              className="px-4 py-2 bg-slate-800 border border-slate-600 hover:border-cyan-500 hover:text-cyan-300 text-slate-300 rounded-xl text-sm font-medium transition-all"
            >
              ✏️ แก้ไข
            </button>
            <button
              onClick={onRequestDelete}
              className="px-4 py-2 bg-rose-950/60 border border-rose-800 hover:border-rose-500 hover:bg-rose-900/60 text-rose-400 rounded-xl text-sm font-medium transition-all"
            >
              🗑️ ลบบัญชี
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Admin Panel (after unlock) ─────────────────────────────────────────

function AdminPanel() {
  const users = useQuery(api.users.getAllUsersAdmin);
  const deleteUserMutation = useMutation(api.users.deleteUser);
  const updateUserMutation = useMutation(api.users.updateUser);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"users"> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<"users"> | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const showToast = (msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleDelete = async (userId: Id<"users">) => {
    setDeletingId(userId);
    try {
      await deleteUserMutation({ userId });
      showToast("ลบบัญชีสำเร็จ ✓");
    } catch {
      showToast("เกิดข้อผิดพลาด ลองอีกครั้ง", "error");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleSaveEdit = async (form: EditState) => {
    if (!editingUser) return;
    try {
      await updateUserMutation({
        userId: editingUser._id,
        name: form.name.trim(),
        age: parseInt(form.age),
        profile: form.profile,
      });
      showToast("อัปเดตข้อมูลสำเร็จ ✓");
      setEditingUser(null);
    } catch {
      showToast("เกิดข้อผิดพลาด ลองอีกครั้ง", "error");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-orange-400">
              🛡️ VRX Admin Panel
            </h1>
            <p className="text-slate-400 mt-1">จัดการข้อมูลบัญชีผู้ใช้ทั้งหมด</p>
          </div>
          <a
            href="/"
            className="px-5 py-2 bg-slate-800 border border-slate-600 rounded-xl text-slate-300 hover:bg-slate-700 hover:border-slate-400 transition-all text-sm font-medium"
          >
            ← กลับหน้าหลัก
          </a>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <StatCard label="ผู้ใช้ทั้งหมด" value={users?.length ?? "..."} color="cyan" />
          <StatCard
            label="โปรไฟล์ General"
            value={users?.filter((u) => u.profile === "General").length ?? "..."}
            color="green"
          />
          <StatCard
            label="โปรไฟล์ Patient"
            value={users?.filter((u) => u.profile === "Patient").length ?? "..."}
            color="purple"
          />
        </div>

        {/* User List */}
        <div className="bg-slate-900/60 border border-slate-700 rounded-2xl overflow-hidden shadow-xl backdrop-blur-sm">
          <div className="px-6 py-4 border-b border-slate-700 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <h2 className="text-lg font-semibold text-slate-200">รายชื่อผู้ใช้</h2>
          </div>

          {users === undefined ? (
            <div className="p-12 text-center text-slate-400 animate-pulse">กำลังโหลด...</div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-slate-500">ยังไม่มีผู้ใช้ในระบบ</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {users.map((user) => (
                <UserRow
                  key={user._id}
                  user={user}
                  isDeleting={deletingId === user._id}
                  confirmingDelete={confirmDeleteId === user._id}
                  onEdit={() => setEditingUser(user)}
                  onRequestDelete={() => setConfirmDeleteId(user._id)}
                  onConfirmDelete={() => handleDelete(user._id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onSave={handleSaveEdit}
          onClose={() => setEditingUser(null)}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl font-semibold text-white shadow-2xl z-50 ${
            toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </main>
  );
}

// ─── Page Entry ───────────────────────────────────────────────────────────────

export default function AdminPage() {
  const [unlocked, setUnlocked] = useState(false);

  // Persist unlock in sessionStorage so no re-entry needed on same tab
  useEffect(() => {
    if (sessionStorage.getItem("vrx_admin_unlocked") === "1") {
      setUnlocked(true);
    }
  }, []);

  const handleUnlock = () => {
    sessionStorage.setItem("vrx_admin_unlocked", "1");
    setUnlocked(true);
  };

  if (!unlocked) return <PasswordGate onUnlock={handleUnlock} />;
  return <AdminPanel />;
}
