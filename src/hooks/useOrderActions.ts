import { useState, useEffect, Dispatch, SetStateAction } from 'react';
import { Order, OrderListItem, OrderStatus } from '../types';
import { jsonAuthHeaders, parseJsonOrThrow } from '../lib/api';
import { useLoading } from '../contexts/LoadingContext';
import { useNotification } from '../contexts/NotificationContext';

interface UseOrderActionsParams {
  token: string;
  orders: OrderListItem[];
  setOrders: Dispatch<SetStateAction<OrderListItem[]>>;
  fetchStats: () => Promise<void>;
}

// Formats a Date as the naive local "YYYY-MM-DDTHH:mm" string a
// datetime-local input expects - Date.toISOString() is UTC and would silently
// default the picker to the wrong local time on this server (Asia/Jakarta).
function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function useOrderActions({ token, orders, setOrders, fetchStats }: UseOrderActionsParams) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Keeps an open detail panel in sync with the orders list, which is now
  // refreshed independently of this hook's own actions (the background poll
  // in useAdminData, or another admin's edit landing via that poll). The list
  // item carries every field the panel needs except personalPhotoBase64
  // (omitted from GET /api/orders, see handleOpenOrderDetail below) - so this
  // is a local merge, not a fetch. Since OrderListItem never carries that
  // field at all, `{ ...prev, ...latest }` below naturally can't clobber it
  // either way - this holds regardless of whether the photo was set once at
  // creation or added later by staff (see handleUploadPersonalPhoto), which
  // patches selectedOrder directly from its own response instead of relying
  // on this merge to pick it up. After this hook's own mutations,
  // orders/selectedOrder are already patched from the same response in the
  // same tick, so the merge below is a no-op then; it only does real work for
  // external changes.
  useEffect(() => {
    if (!selectedOrder) return;
    const latest = orders.find(o => o.id === selectedOrder.id);
    if (!latest) return;
    // Skip the update (and the new object reference it would create) if
    // nothing about this order actually changed - a background poll refires
    // this effect on every tick regardless, and an unconditional new
    // reference would cascade into anything keyed on selectedOrder by
    // reference (e.g. useOrderEditActions' availability-check effect),
    // re-triggering it needlessly - or worse, flickering shown numbers -
    // while an admin has this exact order open and is mid-edit.
    const latestKeys = Object.keys(latest) as (keyof OrderListItem)[];
    const changed = latestKeys.some((key) => JSON.stringify(selectedOrder[key]) !== JSON.stringify(latest[key]));
    if (!changed) return;
    setSelectedOrder(prev => prev ? { ...prev, ...latest } : prev);
  }, [orders]);

  // Late Fee Calculation Modal/State
  const [showLateCalc, setShowLateCalc] = useState<boolean>(false);
  const [customReturnDateTime, setCustomReturnDateTime] = useState<string>(
    toLocalDateTimeInputValue(new Date())
  );
  const [lateCalculationResult, setLateCalculationResult] = useState<{
    lateDays: number;
    lateFee: number;
    breakdown: any[];
    deadline: string;
  } | null>(null);
  const { withLoading } = useLoading();
  const { notifySuccess, notifyError, confirmAction } = useNotification();

  // Fetches the full order (including personalPhotoBase64, omitted from the
  // list payload - see GET /api/orders/:id) and opens the detail panel with
  // it, rather than reusing the photo-less list item the click came from.
  const handleOpenOrderDetail = async (orderId: string) => {
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, { headers: jsonAuthHeaders(token) });
        const fullOrder = await parseJsonOrThrow(res);
        setSelectedOrder(fullOrder);
      } catch (err: any) {
        notifyError(`Gagal membuka detail pesanan: ${err.message}`);
      }
    });
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus, pickupIdType?: string, amountPaid?: number) => {
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/status`, {
          method: 'PUT',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ status: newStatus, pickupIdType, amountPaid })
        });
        const updatedOrder = await parseJsonOrThrow(res);

        // Update local state
        setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(updatedOrder);
        }

        // Refresh dashboard stats
        fetchStats();
      } catch (err: any) {
        notifyError(`Gagal memperbarui status: ${err.message}`);
      }
    });
  };

  // Corrects/tops-up the amount collected on an order without touching its
  // status - e.g. a partially-paying customer pays more before pickup.
  const handleUpdatePayment = async (orderId: string, amountPaid: number) => {
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/payment`, {
          method: 'PUT',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ amountPaid })
        });
        const updatedOrder = await parseJsonOrThrow(res);
        setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(updatedOrder);
        }
        notifySuccess('Jumlah pembayaran berhasil diperbarui!');
        fetchStats();
      } catch (err: any) {
        notifyError(`Gagal memperbarui pembayaran: ${err.message}`);
      }
    });
  };

  // Adds a damage/loss penalty entry to an order at return time - same
  // request/response shape as handleUpdatePayment, since both mutate the
  // order in place without changing its status.
  const handleAddPenalty = async (orderId: string, penalty: { type: 'Kerusakan' | 'Kehilangan'; productId: string; description: string; amount: number }) => {
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/penalties`, {
          method: 'POST',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify(penalty)
        });
        const updatedOrder = await parseJsonOrThrow(res);
        setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(updatedOrder);
        }
        notifySuccess('Denda berhasil ditambahkan!');
        fetchStats();
      } catch (err: any) {
        notifyError(`Gagal menambahkan denda: ${err.message}`);
      }
    });
  };

  const handleRemovePenalty = async (orderId: string, penaltyId: string) => {
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/penalties/${penaltyId}`, {
          method: 'DELETE',
          headers: jsonAuthHeaders(token),
        });
        const updatedOrder = await parseJsonOrThrow(res);
        setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(updatedOrder);
        }
        notifySuccess('Denda berhasil dihapus!');
        fetchStats();
      } catch (err: any) {
        notifyError(`Gagal menghapus denda: ${err.message}`);
      }
    });
  };

  // Retroactively attaches a photo to an order that has none - e.g. the
  // customer skipped it on the booking form and staff verified ID in person
  // instead, but want a photo on file after all. Purely optional: an order is
  // allowed to have no photo indefinitely (see OrderDetailPanel's "Tidak ada
  // foto diunggah" placeholder) - this action exists so staff *can* add one,
  // never so they must. Unlike handleUpdatePayment/handleAddPenalty, the
  // response here carries a REAL resolved photo (a signed URL or legacy
  // base64, see server.ts's readOrderPhoto) rather than the always-empty
  // placeholder those routes' responses happen to carry - so it's applied
  // only to selectedOrder (the open detail panel, which needs it), never to
  // the orders list state, keeping OrderListItem genuinely photo-free.
  const handleUploadPersonalPhoto = async (orderId: string, photoDataUrl: string) => {
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/personal-photo`, {
          method: 'POST',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ photo: photoDataUrl })
        });
        const updatedOrder = await parseJsonOrThrow(res);
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(updatedOrder);
        }
        notifySuccess('Foto berhasil diunggah!');
      } catch (err: any) {
        notifyError(`Gagal mengunggah foto: ${err.message}`);
      }
    });
  };

  // Owner-only (enforced server-side too) - permanently removes an order,
  // e.g. an erroneous double-booking. Not allowed once completed.
  const handleDeleteOrder = async (orderId: string) => {
    if (!(await confirmAction('Apakah Anda yakin ingin menghapus pesanan ini? Tindakan ini tidak bisa dibatalkan.'))) return;
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: 'DELETE',
          headers: jsonAuthHeaders(token),
        });
        await parseJsonOrThrow(res);
        setOrders(prev => prev.filter(o => o.id !== orderId));
        setSelectedOrder(null);
        notifySuccess('Pesanan berhasil dihapus.');
        fetchStats();
      } catch (err: any) {
        notifyError(`Gagal menghapus pesanan: ${err.message}`);
      }
    });
  };

  // Owner-only (enforced server-side too) - resets an already-applied late
  // fee back to 0, even after completion. Doesn't touch amountPaid; the
  // remaining-balance display already clamps to 0 (shows Lunas) if this
  // leaves the order looking "overpaid" relative to the now-lower invoice.
  const handleRemoveLateFee = async (orderId: string) => {
    if (!(await confirmAction('Apakah Anda yakin ingin menghapus denda keterlambatan ini?'))) return;
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}/late-fee`, {
          method: 'DELETE',
          headers: jsonAuthHeaders(token),
        });
        const updatedOrder = await parseJsonOrThrow(res);
        setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(updatedOrder);
        }
        notifySuccess('Denda keterlambatan berhasil dihapus!');
        fetchStats();
      } catch (err: any) {
        notifyError(`Gagal menghapus denda keterlambatan: ${err.message}`);
      }
    });
  };

  const handleCalculateLateFees = async () => {
    if (!selectedOrder) return;
    await withLoading(async () => {
      try {
        const res = await fetch(`/api/orders/${selectedOrder.id}/calculate-late`, {
          method: 'POST',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ returnDateTime: customReturnDateTime })
        });
        const data = await parseJsonOrThrow(res);
        setLateCalculationResult(data);
      } catch (err: any) {
        notifyError(`Gagal menghitung denda: ${err.message}`);
      }
    });
  };

  const handleApplyLateFeesAndComplete = async () => {
    if (!selectedOrder || !lateCalculationResult) return;
    await withLoading(async () => {
      try {
        // 1. Double check order is returned
        await handleUpdateOrderStatus(selectedOrder.id, 'Item Returned/Completed');
        setShowLateCalc(false);
        setLateCalculationResult(null);
        notifySuccess('Denda berhasil dihitung dan pesanan diselesaikan!');
      } catch (err: any) {
        notifyError(`Gagal menyimpan: ${err.message}`);
      }
    });
  };

  const openLateCalc = () => {
    setShowLateCalc(true);
    setLateCalculationResult(null);
  };

  const closeOrderDetail = () => {
    setSelectedOrder(null);
    setShowLateCalc(false);
    setLateCalculationResult(null);
  };

  return {
    selectedOrder,
    setSelectedOrder,
    showLateCalc,
    setShowLateCalc,
    customReturnDateTime,
    setCustomReturnDateTime,
    lateCalculationResult,
    setLateCalculationResult,
    handleOpenOrderDetail,
    handleUpdateOrderStatus,
    handleUpdatePayment,
    handleAddPenalty,
    handleRemovePenalty,
    handleUploadPersonalPhoto,
    handleDeleteOrder,
    handleRemoveLateFee,
    handleCalculateLateFees,
    handleApplyLateFeesAndComplete,
    openLateCalc,
    closeOrderDetail,
  };
}
