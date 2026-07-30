import { Plus } from 'lucide-react';
import { PublicUser } from '../../types';
import { useUserActions } from '../../hooks/useUserActions';

interface UserTabProps {
  users: PublicUser[];
  userActions: ReturnType<typeof useUserActions>;
}

export default function UserTab({ users, userActions }: UserTabProps) {
  const {
    showUserModal,
    setShowUserModal,
    userFormData,
    setUserFormData,
    handleSaveUser,
    openAddUserModal,
  } = userActions;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">MANAJEMEN USER</h2>
          <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Kelola akun staff dan hak akses (owner/karyawan).</p>
        </div>

        <button
          onClick={openAddUserModal}
          className="bg-black hover:bg-brand hover:text-black text-brand font-black text-xs px-5 py-3 rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] border-2 border-black transition-all flex items-center self-start sm:self-auto uppercase tracking-widest cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-2 stroke-[3]" />
          Tambah User
        </button>
      </div>

      <div className="border-2 border-black rounded-none overflow-hidden shadow-[4px_4px_0px_rgba(0,0,0,1)] bg-white">
        <table className="w-full text-left">
          <thead className="bg-black text-white text-[10px] uppercase tracking-wider font-black">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {users.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-xs text-zinc-400 font-bold uppercase">
                  Belum ada user.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="text-xs font-bold">
                  <td className="px-4 py-3 text-black uppercase">{u.displayName}</td>
                  <td className="px-4 py-3 text-zinc-600 font-mono">{u.username}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 border font-black uppercase text-[10px] ${
                      u.role === 'owner' ? 'bg-brand/20 border-black text-black' : 'bg-zinc-100 border-zinc-300 text-zinc-600'
                    }`}>
                      {u.role === 'owner' ? 'Owner/Master' : 'Karyawan'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showUserModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] border-4 border-black overflow-hidden">
            <div className="bg-black text-white px-5 py-4 flex justify-between items-center border-b-2 border-black">
              <h3 className="font-display font-black text-sm uppercase tracking-wider">TAMBAH USER BARU</h3>
              <button
                onClick={() => setShowUserModal(false)}
                className="text-brand hover:text-white font-mono font-black text-xs uppercase cursor-pointer"
              >
                CLOSE
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-5 space-y-4 bg-white text-black">
              <div>
                <label className="block text-xs font-black text-black uppercase">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={userFormData.displayName}
                  onChange={(e) => setUserFormData({ ...userFormData, displayName: e.target.value })}
                  placeholder="Contoh: Fachrul Rozi"
                  className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black tracking-wider focus:bg-brand/10 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-black uppercase">Username</label>
                <input
                  type="text"
                  required
                  value={userFormData.username}
                  onChange={(e) => setUserFormData({ ...userFormData, username: e.target.value })}
                  className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black focus:bg-brand/10 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-black uppercase">Password Awal</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={userFormData.password}
                  onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                  placeholder="MINIMAL 6 KARAKTER"
                  className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black focus:bg-brand/10 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-black uppercase">Role</label>
                <select
                  value={userFormData.role}
                  onChange={(e) => setUserFormData({ ...userFormData, role: e.target.value as 'owner' | 'karyawan' })}
                  className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none cursor-pointer"
                >
                  <option value="karyawan">Karyawan</option>
                  <option value="owner">Owner/Master</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] uppercase tracking-widest transition-all mt-4 cursor-pointer"
              >
                Simpan User
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
