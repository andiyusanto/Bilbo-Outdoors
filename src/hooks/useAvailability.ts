import { useState, useEffect, Dispatch, SetStateAction } from 'react';
import { JSON_HEADERS } from '../lib/api';

interface StockInfo {
  remaining: number;
  allocated: number;
}

export function useAvailability(setCart: Dispatch<SetStateAction<Record<string, number>>>) {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [rentDuration, setRentDuration] = useState<number>(0);

  // Real-time stock checked details from the backend
  const [stockDetails, setStockDetails] = useState<Record<string, StockInfo>>({});
  const [checkingStock, setCheckingStock] = useState<boolean>(false);

  // Check database stock in real-time
  const checkInventoryStock = async (startStr: string, endStr: string) => {
    setCheckingStock(true);
    try {
      const res = await fetch('/api/check-availability', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ startDate: startStr, endDate: endStr })
      });
      const data = await res.json();
      if (res.ok && data.details) {
        const stockMap: Record<string, StockInfo> = {};
        data.details.forEach((item: any) => {
          stockMap[item.productId] = {
            remaining: item.remaining,
            allocated: item.allocated
          };
        });
        setStockDetails(stockMap);

        // Adjust cart if any quantity exceeds new available stock
        setCart(prev => {
          const updated = { ...prev };
          let changed = false;
          Object.keys(updated).forEach(pId => {
            const avail = stockMap[pId]?.remaining ?? 999;
            if (updated[pId] > avail) {
              if (avail <= 0) {
                delete updated[pId];
              } else {
                updated[pId] = avail;
              }
              changed = true;
            }
          });
          return changed ? updated : prev;
        });
      }
    } catch (err) {
      console.error('Error checking stock:', err);
    } finally {
      setCheckingStock(false);
    }
  };

  // Recalculate duration when dates change
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (end >= start) {
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive rent days
        setRentDuration(days);
        // Automatically check remaining inventory stock whenever date changes
        checkInventoryStock(startDate, endDate);
      } else {
        setRentDuration(0);
        setStockDetails({});
      }
    } else {
      setRentDuration(0);
      setStockDetails({});
    }
  }, [startDate, endDate]);

  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    rentDuration,
    stockDetails,
    checkingStock,
  };
}
