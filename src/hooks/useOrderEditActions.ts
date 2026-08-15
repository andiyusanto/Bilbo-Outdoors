import { useState, useEffect, Dispatch, SetStateAction } from 'react';
import { Order, OrderListItem } from '../types';
import { jsonAuthHeaders, parseJsonOrThrow } from '../lib/api';
import { useLoading } from '../contexts/LoadingContext';
import { useNotification } from '../contexts/NotificationContext';

interface StockInfo {
  remaining: number;
  allocated: number;
}

interface UseOrderEditActionsParams {
  token: string;
  selectedOrder: Order | null;
  setOrders: Dispatch<SetStateAction<OrderListItem[]>>;
  setSelectedOrder: Dispatch<SetStateAction<Order | null>>;
  fetchStats: () => Promise<void>;
}

// Mirrors useAvailability.ts's date-change-triggers-availability-refetch
// pattern, but for editing an existing Pending/Approved-Paid order's
// items/dates instead of building a new cart - the key difference is
// excludeOrderId, so the order's own current allocation never counts as
// "unavailable" against itself.
export function useOrderEditActions({ token, selectedOrder, setOrders, setSelectedOrder, fetchStats }: UseOrderEditActionsParams) {
  const [showEditOrder, setShowEditOrder] = useState<boolean>(false);
  const [editStartDate, setEditStartDate] = useState<string>('');
  const [editEndDate, setEditEndDate] = useState<string>('');
  const [editItems, setEditItems] = useState<Record<string, number>>({});
  const [editAvailability, setEditAvailability] = useState<Record<string, StockInfo>>({});
  const [editProductSearch, setEditProductSearch] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('ALL');
  const { withLoading } = useLoading();
  const { notifySuccess, notifyError } = useNotification();

  const openEditOrder = (order: Order) => {
    setEditStartDate(order.startDate);
    setEditEndDate(order.endDate);
    const itemsMap: Record<string, number> = {};
    order.items.forEach(item => { itemsMap[item.productId] = item.quantity; });
    setEditItems(itemsMap);
    setEditProductSearch('');
    setEditCategory('ALL');
    setShowEditOrder(true);
  };

  const closeEditOrder = () => {
    setShowEditOrder(false);
    setEditAvailability({});
  };

  // Live-checks stock for the in-progress edit whenever its dates change,
  // same round trip the client checkout already makes via useAvailability.ts,
  // just with excludeOrderId added.
  useEffect(() => {
    if (!showEditOrder || !selectedOrder || !editStartDate || !editEndDate) return;
    const end = new Date(editEndDate);
    const start = new Date(editStartDate);
    if (end < start) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/check-availability', {
          method: 'POST',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ startDate: editStartDate, endDate: editEndDate, excludeOrderId: selectedOrder.id })
        });
        const data = await res.json();
        if (!cancelled && res.ok && data.details) {
          const stockMap: Record<string, StockInfo> = {};
          data.details.forEach((item: any) => {
            stockMap[item.productId] = { remaining: item.remaining, allocated: item.allocated };
          });
          setEditAvailability(stockMap);
        }
      } catch (err) {
        console.error('Error checking stock for order edit:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [showEditOrder, selectedOrder, editStartDate, editEndDate, token]);

  const handleSaveOrderEdit = async () => {
    if (!selectedOrder) return;
    const items = Object.entries(editItems)
      .filter(([, quantity]: [string, number]) => quantity > 0)
      .map(([productId, quantity]) => ({ productId, quantity }));

    await withLoading(async () => {
      try {
        const res = await fetch(`/api/orders/${selectedOrder.id}/edit`, {
          method: 'PUT',
          headers: jsonAuthHeaders(token),
          body: JSON.stringify({ startDate: editStartDate, endDate: editEndDate, items })
        });
        const updatedOrder = await parseJsonOrThrow(res);
        setOrders(prev => prev.map(o => o.id === selectedOrder.id ? updatedOrder : o));
        setSelectedOrder(updatedOrder);
        notifySuccess('Pesanan berhasil diperbarui!');
        closeEditOrder();
        fetchStats();
      } catch (err: any) {
        notifyError(`Gagal menyimpan perubahan: ${err.message}`);
      }
    });
  };

  return {
    showEditOrder,
    editStartDate,
    setEditStartDate,
    editEndDate,
    setEditEndDate,
    editItems,
    setEditItems,
    editAvailability,
    editProductSearch,
    setEditProductSearch,
    editCategory,
    setEditCategory,
    openEditOrder,
    closeEditOrder,
    handleSaveOrderEdit,
  };
}
