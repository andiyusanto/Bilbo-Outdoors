import { useState, useEffect, Dispatch, SetStateAction } from 'react';
import { JSON_HEADERS } from '../lib/api';
import { useLoading } from '../contexts/LoadingContext';

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
  const { withLoading } = useLoading();

  // Check database stock in real-time
  const checkInventoryStock = async (startStr: string, endStr: string) => {
    await withLoading(async () => {
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
    });
  };

  // Recalculate duration when dates change
  useEffect(() => {
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      // Strictly after, not >= - same-day pickup/return isn't a bookable
      // option (see DateRangePicker's endDate `min`, which already prevents
      // picking it through the UI; this is the same rule enforced in the
      // duration calc itself, in case a stale endDate survives a startDate
      // change without the picker being touched again).
      if (end > start) {
        const diffTime = Math.abs(end.getTime() - start.getTime());
        // Non-inclusive ("nights") day count - mirrors server.ts's order-creation
        // formula exactly. The Math.max(1, ...) floor is now just defensive
        // (end > start already guarantees at least one day) rather than doing
        // real work, since same-day is no longer reachable through the picker.
        const days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
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
