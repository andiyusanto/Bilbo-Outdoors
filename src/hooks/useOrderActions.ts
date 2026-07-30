import { useState, Dispatch, SetStateAction } from 'react';
import { Order, OrderStatus } from '../types';
import { jsonAuthHeaders, parseJsonOrThrow } from '../lib/api';

interface UseOrderActionsParams {
  token: string;
  setOrders: Dispatch<SetStateAction<Order[]>>;
  fetchAdminData: () => Promise<void>;
}

// Formats a Date as the naive local "YYYY-MM-DDTHH:mm" string a
// datetime-local input expects - Date.toISOString() is UTC and would silently
// default the picker to the wrong local time on this server (Asia/Jakarta).
function toLocalDateTimeInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function useOrderActions({ token, setOrders, fetchAdminData }: UseOrderActionsParams) {
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

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

  const handleUpdateOrderStatus = async (orderId: string, newStatus: OrderStatus, pickupIdType?: string) => {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PUT',
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ status: newStatus, pickupIdType })
      });
      const updatedOrder = await parseJsonOrThrow(res);

      // Update local state
      setOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updatedOrder);
      }

      // Refresh dashboard stats
      fetchAdminData();
    } catch (err: any) {
      alert(`Gagal memperbarui status: ${err.message}`);
    }
  };

  const handleCalculateLateFees = async () => {
    if (!selectedOrder) return;
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/calculate-late`, {
        method: 'POST',
        headers: jsonAuthHeaders(token),
        body: JSON.stringify({ returnDateTime: customReturnDateTime })
      });
      const data = await parseJsonOrThrow(res);
      setLateCalculationResult(data);
    } catch (err: any) {
      alert(`Gagal menghitung denda: ${err.message}`);
    }
  };

  const handleApplyLateFeesAndComplete = async () => {
    if (!selectedOrder || !lateCalculationResult) return;
    try {
      // 1. Double check order is returned
      await handleUpdateOrderStatus(selectedOrder.id, 'Item Returned/Completed');
      setShowLateCalc(false);
      setLateCalculationResult(null);
      alert('Denda berhasil dihitung dan pesanan diselesaikan!');
    } catch (err: any) {
      alert(`Gagal menyimpan: ${err.message}`);
    }
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
    handleUpdateOrderStatus,
    handleCalculateLateFees,
    handleApplyLateFeesAndComplete,
    openLateCalc,
    closeOrderDetail,
  };
}
