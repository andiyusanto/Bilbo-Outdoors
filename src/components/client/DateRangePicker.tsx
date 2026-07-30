import { useRef, RefObject } from 'react';
import { Calendar } from 'lucide-react';

interface DateRangePickerProps {
  startDate: string;
  setStartDate: (value: string) => void;
  endDate: string;
  setEndDate: (value: string) => void;
  rentDuration: number;
}

// Opens the native date picker on click anywhere in the input's box, not just
// the browser-drawn calendar icon glyph - desktop (mouse/trackpad) only, so
// mobile's own tap-to-open behavior is left completely untouched.
function openPickerOnDesktop(ref: RefObject<HTMLInputElement | null>) {
  if (window.matchMedia('(pointer: fine)').matches) {
    ref.current?.showPicker?.();
  }
}

export default function DateRangePicker({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  rentDuration,
}: DateRangePickerProps) {
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  return (
    <div className="bg-white border-2 border-black p-6 rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] space-y-4">
      <h2 className="font-display font-black text-black text-lg flex items-center uppercase tracking-tight">
        <Calendar className="w-5 h-5 mr-2 text-black stroke-[3]" />
        PILIH TANGGAL PENYEWAAN
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="startDate" className="block text-[10px] font-black text-black uppercase tracking-wider">Tanggal Mulai Sewa</label>
          <input
            ref={startRef}
            id="startDate"
            type="date"
            required
            min={new Date().toISOString().split('T')[0]}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            onClick={() => openPickerOnDesktop(startRef)}
            className="mt-1 block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white cursor-pointer uppercase text-black"
          />
        </div>

        <div>
          <label htmlFor="endDate" className="block text-[10px] font-black text-black uppercase tracking-wider">Tanggal Selesai Sewa</label>
          <input
            ref={endRef}
            id="endDate"
            type="date"
            required
            min={startDate || new Date().toISOString().split('T')[0]}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            onClick={() => openPickerOnDesktop(endRef)}
            className="mt-1 block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white cursor-pointer uppercase text-black"
          />
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
