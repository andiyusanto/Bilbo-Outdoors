import { useState, Dispatch, SetStateAction, FormEvent } from 'react';
import { PublicUser, UserRole } from '../types';
import { jsonAuthHeaders, parseJsonOrThrow } from '../lib/api';

interface UseUserActionsParams {
  token: string;
  fetchAdminData: () => Promise<void>;
  setUsers: Dispatch<SetStateAction<PublicUser[]>>;
}

const DEFAULT_USER_FORM = {
  username: '',
  password: '',
  role: 'karyawan' as UserRole,
  displayName: '',
};

export function useUserActions({ token, fetchAdminData }: UseUserActionsParams) {
  const [showUserModal, setShowUserModal] = useState<boolean>(false);
  const [userFormData, setUserFormData] = useState(DEFAULT_USER_FORM);

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: jsonAuthHeaders(token),
        body: JSON.stringify(userFormData)
      });
      await parseJsonOrThrow(res);
      alert('User baru berhasil ditambahkan!');
      setShowUserModal(false);
      setUserFormData(DEFAULT_USER_FORM);
      fetchAdminData();
    } catch (err: any) {
      alert(`Gagal menambahkan user: ${err.message}`);
    }
  };

  const openAddUserModal = () => {
    setUserFormData(DEFAULT_USER_FORM);
    setShowUserModal(true);
  };

  return {
    showUserModal,
    setShowUserModal,
    userFormData,
    setUserFormData,
    handleSaveUser,
    openAddUserModal,
  };
}
