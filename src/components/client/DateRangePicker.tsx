import { Calendar } from 'lucide-react';

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
      <h3 className="font-display font-black text-black text-lg flex items-center uppercase tracking-tight">
        <Calendar className="w-5 h-5 mr-2 text-black stroke-[3]" />
        PILIH TANGGAL PENYEWAAN
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-black text-black uppercase tracking-wider">Tanggal Mulai Sewa</label>
          <input
            type="date"
            required
            min={new Date().toISOString().split('T')[0]}
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white cursor-pointer uppercase text-black"
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-black uppercase tracking-wider">Tanggal Selesai Sewa</label>
          <input
            type="date"
            required
            min={startDate || new Date().toISOString().split('T')[0]}
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
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
        <p className="text-xs text-amber-600 font-bold uppercase tracking-wide">🚨 SILAKAN PILIH RENTANG TANGGAL SEWA UNTUK MELIHAT KETERSEDIAAN STOK AKTUAL DAN MULAI MEMESAN.</p>
      )}
    </div>
  );
}
