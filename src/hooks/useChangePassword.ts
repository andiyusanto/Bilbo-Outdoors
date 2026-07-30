import { useState, FormEvent } from 'react';
import { jsonAuthHeaders, parseJsonOrThrow } from '../lib/api';

export function useChangePassword(token: string, onSessionTokenRotated: (newToken: string) => void) {
  const [showModal, setShowModalState] = useState<boolean>(false);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [error, setError] = useState<string>('');

  const reset = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  };

  const setShowModal = (visible: boolean) => {
    setShowModalState(visible);
    if (!visible) reset();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak cocok.');
      return;
    }
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await parseJsonOrThrow(res);
      onSessionTokenRotated(data.token);
      alert('Password berhasil diubah!');
      setShowModal(false);
    } catch (err: any) {
      setError(err.message || 'Gagal mengubah password.');
    }
  };

  return {
    showModal,
    setShowModal,
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    confirmPassword,
    setConfirmPassword,
    error,
    handleSubmit,
  };
}
