import { FormEvent } from 'react';
import { Lock, ArrowLeft, AlertTriangle } from 'lucide-react';

interface AdminLoginScreenProps {
  onClose: () => void;
  usernameInput: string;
  setUsernameInput: (value: string) => void;
  passwordInput: string;
  setPasswordInput: (value: string) => void;
  loginError: string;
  handleLogin: (e: FormEvent) => void;
}

export default function AdminLoginScreen({
  onClose,
  usernameInput,
  setUsernameInput,
  passwordInput,
  setPasswordInput,
  loginError,
  handleLogin,
}: AdminLoginScreenProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col justify-center py-12 px-6 lg:px-8">
      <div className="absolute top-6 left-6">
        <button
          onClick={onClose}
          className="flex items-center text-xs font-black text-black uppercase tracking-widest hover:bg-black hover:text-brand border-2 border-black px-4 py-2 bg-white shadow-[2px_2px_0px_rgba(0,0,0,1)] transition-all rounded-none cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5 stroke-[2.5]" />
          Kembali ke Portal Rental
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="w-14 h-14 bg-brand text-black border-2 border-black flex items-center justify-center font-display font-black text-xl rounded-none shadow-[3px_3px_0px_rgba(0,0,0,1)]">
            BO
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-display font-black tracking-tighter text-black uppercase">
          Staff Admin Login
        </h2>
        <p className="mt-2 text-center text-[10px] font-mono text-zinc-500 tracking-widest uppercase">
          BILBO OUTDOORS SURABAYA
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 border-4 border-black rounded-none shadow-[6px_6px_0px_rgba(0,0,0,1)]">
          {loginError && (
            <div className="mb-4 bg-red-50 border-2 border-red-500 text-red-800 text-xs p-3 rounded-none flex items-start uppercase font-bold">
              <AlertTriangle className="w-4 h-4 mr-2 shrink-0 text-red-600 stroke-[2.5]" />
              <span>{loginError}</span>
            </div>
          )}

          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="block text-[10px] font-black text-black uppercase tracking-wider">
                Username
              </label>
              <div className="mt-1 relative">
                <input
                  type="text"
                  required
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="admin"
                  className="block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white text-black uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-black uppercase tracking-wider">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="••••••••••••"
                  className="block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white text-black uppercase"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-3.5 px-4 border-2 border-black rounded-none shadow-[4px_4px_0px_var(--brand-color)] text-xs font-black bg-black text-brand hover:bg-brand hover:text-black focus:outline-none transition-colors mt-6 uppercase tracking-widest cursor-pointer"
            >
              <Lock className="w-4 h-4 mr-2" />
              Masuk Sistem Admin
            </button>
          </form>

          <div className="mt-6 border-t border-zinc-200 pt-4 text-center">
            <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
              Credentials Default: <strong className="text-zinc-600">admin</strong> / <strong className="text-zinc-600">bilbooutdoor2026</strong>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
