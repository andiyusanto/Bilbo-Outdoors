import { Calendar } from 'lucide-react';
import DateInput from '../DateInput';
import { getTodayDateString, addDaysToDateString } from '../../lib/date';

interface DateRangePickerProps {
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  rentDuration: number;
}

export default function DateRangePicker({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  rentDuration,
}: DateRangePickerProps) {
  return (
    <div className="bg-white border-2 border-black p-6 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] space-y-4">
      <h2 className="font-display font-black text-black text-lg flex items-center uppercase tracking-tight">
        <Calendar className="w-5 h-5 mr-2 text-black stroke-[3]" />
        PILIH TANGGAL PENYEWAAN
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="startDate" className="block text-[10px] font-black text-black uppercase tracking-wider">Tanggal Mulai Sewa</label>
          <div className="mt-1">
            <DateInput
              id="startDate"
              required
              min={getTodayDateString()}
              value={startDate}
              onChange={setStartDate}
              className="w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold bg-white uppercase text-black"
            />
          </div>
        </div>

        <div>
          <label htmlFor="endDate" className="block text-[10px] font-black text-black uppercase tracking-wider">Tanggal Selesai Sewa</label>
          <div className="mt-1">
            <DateInput
              id="endDate"
              required
              // Strictly after startDate, never equal to it - same-day
              // pickup/return isn't a bookable option (owner decision,
              // 2026-08-30): every rental must span at least one real night.
              min={startDate ? addDaysToDateString(startDate, 1) : getTodayDateString()}
              value={endDate}
              onChange={setEndDate}
              className="w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold bg-white uppercase text-black"
            />
          </div>
        </div>
      </div>

      {rentDuration > 0 ? (
        <div className="bg-black text-white px-4 py-3.5 rounded-none flex justify-between items-center text-xs font-bold font-mono tracking-widest uppercase border-2 border-black shadow-[2px_2px_0px_rgba(0,0,0,0.15)]">
          <span>DURASI SEWA DIHITUNG:</span>
          <span className="text-black bg-brand px-3 py-1 font-black text-sm border border-black">{rentDuration} HARI</span>
        </div>
      ) : (
        <p className="text-xs text-amber-700 font-bold uppercase tracking-wide">🚨 SILAKAN PILIH RENTANG TANGGAL SEWA UNTUK MELIHAT KETERSEDIAAN STOK AKTUAL DAN MULAI MEMESAN.</p>
      )}
    </div>
  );
}
