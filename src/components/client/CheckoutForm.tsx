import { FormEvent, ChangeEvent } from 'react';
import { FileText, AlertCircle, Upload, ShieldAlert } from 'lucide-react';

interface CheckoutFormProps {
  customerName: string;
  setCustomerName: (value: string) => void;
  customerWhatsApp: string;
  setCustomerWhatsApp: (value: string) => void;
  idCardFile: File | null;
  idCardBase64: string;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  checkoutError: string;
  submittingOrder: boolean;
  cartIsEmpty: boolean;
  onSubmit: (e: FormEvent) => void;
}

export default function CheckoutForm({
  customerName,
  setCustomerName,
  customerWhatsApp,
  setCustomerWhatsApp,
  idCardFile,
  idCardBase64,
  onFileChange,
  checkoutError,
  submittingOrder,
  cartIsEmpty,
  onSubmit,
}: CheckoutFormProps) {
  return (
    <div className="bg-white border-2 border-black rounded-none shadow-[4px_4px_0px_rgba(0,0,0,1)] p-6 space-y-5">
      <h3 className="font-display font-black text-black text-lg flex items-center uppercase tracking-tight border-b-4 border-brand pb-2">
        <FileText className="w-5 h-5 mr-2 text-black stroke-[3]" />
        FORMULIR PENYEWA
      </h3>

      {checkoutError && (
        <div className="bg-red-50 border-2 border-red-500 text-red-800 text-xs p-3 rounded-none flex items-start font-bold uppercase">
          <AlertCircle className="w-4.5 h-4.5 mr-2 shrink-0 text-red-600 stroke-[3]" />
          <span>{checkoutError}</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="block text-[10px] font-black text-black uppercase tracking-wider">Nama Lengkap Anda</label>
          <input
            type="text"
            required
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Contoh: Budi Santoso"
            className="mt-1 block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white uppercase text-black"
          />
        </div>

        <div>
          <label className="block text-[10px] font-black text-black uppercase tracking-wider">No. WhatsApp Aktif</label>
          <input
            type="tel"
            required
            value={customerWhatsApp}
            onChange={(e) => setCustomerWhatsApp(e.target.value)}
            placeholder="Contoh: 08123456789"
            className="mt-1 block w-full rounded-none border-2 border-black px-4 py-2.5 text-xs font-bold focus:bg-brand/10 focus:outline-none bg-white uppercase text-black"
          />
        </div>

        {/* ID Card file uploader */}
        <div className="space-y-1.5">
          <label className="block text-[10px] font-black text-black uppercase tracking-wider">
            Upload Foto Jaminan (KTP / SIM)
          </label>

          <div className="border-2 border-dashed border-black rounded-none hover:bg-brand/5 transition-all bg-zinc-50 relative overflow-hidden">
            <input
              type="file"
              accept="image/*"
              onChange={onFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
            />

            {idCardBase64 ? (
              <div className="p-3 text-center">
                <img
                  src={idCardBase64}
                  alt="ID Card guarantee thumbnail"
                  referrerPolicy="no-referrer"
                  className="mx-auto max-h-32 rounded-none object-contain border border-black"
                />
                <p className="text-[10px] text-zinc-500 font-mono mt-2 truncate max-w-xs mx-auto font-bold uppercase">
                  {idCardFile?.name} (Siap Diunggah)
                </p>
              </div>
            ) : (
              <div className="py-6 text-center space-y-1">
                <Upload className="w-6 h-6 mx-auto text-zinc-600 stroke-[2.5]" />
                <p className="text-xs font-black text-black uppercase tracking-wider">Tarik gambar / Klik di sini</p>
                <p className="text-[10px] text-zinc-500 font-bold uppercase leading-normal px-2">KTP atau SIM sebagai jaminan rental fisik</p>
              </div>
            )}
          </div>
        </div>

        {/* Warning note */}
        <div className="flex p-3 bg-zinc-50 border-2 border-black rounded-none space-x-2.5 text-[10px] text-zinc-700 leading-normal uppercase font-bold">
          <ShieldAlert className="w-4 h-4 text-black shrink-0 stroke-[2.5]" />
          <p>Kartu identitas Anda diunggah dengan aman ke server enkripsi Bilbo Outdoors dan hanya digunakan untuk kepentingan administrasi jaminan.</p>
        </div>

        <button
          type="submit"
          disabled={submittingOrder || cartIsEmpty}
          className="w-full flex justify-center py-4 px-4 border-2 border-black rounded-none shadow-[4px_4px_0px_var(--brand-color)] text-xs font-black uppercase tracking-widest bg-black text-brand hover:bg-brand hover:text-black transition-colors focus:outline-none mt-6 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {submittingOrder ? 'Memproses Pesanan...' : 'Kirim Pemesanan & Bayar'}
        </button>
      </form>
    </div>
  );
}
