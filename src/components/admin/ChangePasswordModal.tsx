import { useChangePassword } from '../../hooks/useChangePassword';

interface ChangePasswordModalProps {
  passwordActions: ReturnType<typeof useChangePassword>;
}

export default function ChangePasswordModal({ passwordActions }: ChangePasswordModalProps) {
  const {
    setShowModal,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    handleSubmit,
  } = passwordActions;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] border-4 border-black overflow-hidden">
        <div className="bg-black text-white px-5 py-4 flex justify-between items-center border-b-2 border-black">
          <h3 className="font-display font-black text-sm uppercase tracking-wider">GANTI PASSWORD</h3>
          <button
            onClick={() => setShowModal(false)}
            className="text-brand hover:text-white font-mono font-black text-xs uppercase cursor-pointer"
          >
            CLOSE
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 bg-white text-black">
          {error && (
            <div className="bg-red-50 border-2 border-red-600 text-red-700 text-[11px] font-bold px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-black text-black uppercase">Password Saat Ini</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black focus:bg-brand/10 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-black uppercase">Password Baru</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="MINIMAL 6 KARAKTER"
              className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black focus:bg-brand/10 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-black text-black uppercase">Konfirmasi Password Baru</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black focus:bg-brand/10 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] uppercase tracking-widest transition-all mt-4 cursor-pointer"
          >
            Simpan Password Baru
          </button>
        </form>
      </div>
    </div>
  );
}
