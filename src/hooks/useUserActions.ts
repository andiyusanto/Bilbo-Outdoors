import { useState, Dispatch, SetStateAction, FormEvent } from 'react';
import { PublicUser, UserRole } from '../types';
import { jsonAuthHeaders, authHeaders, parseJsonOrThrow } from '../lib/api';
import { useLoading } from '../contexts/LoadingContext';
import { useNotification } from '../contexts/NotificationContext';

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
  const [editingUser, setEditingUser] = useState<PublicUser | null>(null);
  const [userFormData, setUserFormData] = useState(DEFAULT_USER_FORM);
  const { withLoading } = useLoading();
  const { notifySuccess, notifyError, confirmAction } = useNotification();

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    await withLoading(async () => {
      try {
        // Editing never touches password - that's exclusively self-service via
        // "Ganti Password" (change-password), so it's simply never sent here.
        const body = editingUser
          ? { displayName: userFormData.displayName, username: userFormData.username, role: userFormData.role }
          : userFormData;
        const method = editingUser ? 'PUT' : 'POST';
        const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
        const res = await fetch(url, {
          method,
          headers: jsonAuthHeaders(token),
          body: JSON.stringify(body)
        });
        await parseJsonOrThrow(res);
        notifySuccess(editingUser ? 'Perubahan user berhasil disimpan!' : 'User baru berhasil ditambahkan!');
        setShowUserModal(false);
        setEditingUser(null);
        setUserFormData(DEFAULT_USER_FORM);
        fetchAdminData();
      } catch (err: any) {
        notifyError(`Gagal menyimpan user: ${err.message}`);
      }
    });
  };

  const handleDeleteUser = async (user: PublicUser) => {
    if (!(await confirmAction(`Apakah Anda yakin ingin menghapus PERMANEN akun "${user.displayName}"? Tindakan ini tidak bisa dibatalkan - gunakan "Nonaktifkan" jika hanya ingin mencabut aksesnya sementara.`))) return;
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'DELETE',
          headers: authHeaders(token)
        });
        await parseJsonOrThrow(res);
        fetchAdminData();
      } catch (err: any) {
        notifyError(`Gagal menghapus user: ${err.message}`);
      }
    });
  };

  const handleToggleActive = async (user: PublicUser) => {
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/users/${user.id}`, {
          method: 'PUT',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ active: user.active === false ? true : false })
        });
        await parseJsonOrThrow(res);
        fetchAdminData();
      } catch (err: any) {
        notifyError(`Gagal mengubah status user: ${err.message}`);
      }
    });
  };

  const openAddUserModal = () => {
    setEditingUser(null);
    setUserFormData(DEFAULT_USER_FORM);
    setShowUserModal(true);
  };

  const openEditUserModal = (user: PublicUser) => {
    setEditingUser(user);
    setUserFormData({
      username: user.username,
      password: '',
      role: user.role,
      displayName: user.displayName,
    });
    setShowUserModal(true);
  };

  return {
    showUserModal,
    setShowUserModal,
    editingUser,
    userFormData,
    setUserFormData,
    handleSaveUser,
    handleDeleteUser,
    handleToggleActive,
    openAddUserModal,
    openEditUserModal,
  };
}
