import { Plus } from 'lucide-react';
import { JobEntry, JobPriceListItem, JobType } from '../../types';
import { useJobEntryActions } from '../../hooks/useJobEntryActions';
import { formatDateLabel } from '../../lib/date';

interface OperationalTabProps {
  jobEntries: JobEntry[];
  jobPriceList: JobPriceListItem[];
  jobEntryActions: ReturnType<typeof useJobEntryActions>;
}

const JOB_TYPE_LABELS: Record<JobType, string> = {
  CLEANING: 'Cleaning',
  LAUNDRY: 'Laundry',
  INVENTARIS: 'Inventaris',
};

function priceFor(item: JobPriceListItem | undefined, jobType: JobType | ''): number | undefined {
  if (!item || !jobType) return undefined;
  if (jobType === 'CLEANING') return item.cleaningPrice;
  if (jobType === 'LAUNDRY') return item.laundryPrice;
  return item.inventarisPrice;
}

export default function OperationalTab({ jobEntries, jobPriceList, jobEntryActions }: OperationalTabProps) {
  const {
    showEntryModal,
    setShowEntryModal,
    editingEntry,
    entryFormData,
    setEntryFormData,
    handleSaveEntry,
    openAddEntryModal,
    openEditEntryModal,
  } = jobEntryActions;

  const selectedItem = jobPriceList.find((j) => j.itemName === entryFormData.itemName);
  const availableJobTypes = (['CLEANING', 'LAUNDRY', 'INVENTARIS'] as JobType[]).filter(
    (jt) => selectedItem && priceFor(selectedItem, jt) !== undefined
  );
  const unitPrice = priceFor(selectedItem, entryFormData.jobType);
  const total = unitPrice !== undefined ? unitPrice * entryFormData.quantity : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">OPERATIONAL</h2>
          <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Catat pekerjaan cleaning/laundry/inventaris yang sudah dilakukan.</p>
        </div>

        <button
          onClick={openAddEntryModal}
          className="bg-black hover:bg-brand hover:text-black text-brand font-black text-xs px-5 py-3 rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] border-2 border-black transition-all flex items-center self-start sm:self-auto uppercase tracking-widest cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-2 stroke-[3]" />
          Tambah Pekerjaan
        </button>
      </div>

      <div className="border-2 border-black rounded-none overflow-hidden shadow-[4px_4px_0px_rgba(0,0,0,1)] bg-white overflow-x-auto">
        <table className="w-full text-left min-w-[700px]">
          <thead className="bg-black text-white text-[10px] uppercase tracking-wider font-black">
            <tr>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {jobEntries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-zinc-400 font-bold uppercase">
                  Belum ada pekerjaan tercatat.
                </td>
              </tr>
            ) : (
              jobEntries.map((entry) => (
                <tr key={entry.id} className="text-xs font-bold">
                  <td className="px-4 py-3 text-black uppercase">{entry.employeeName}</td>
                  <td className="px-4 py-3 font-mono text-zinc-600">{formatDateLabel(entry.entryDate)}</td>
                  <td className="px-4 py-3 uppercase">{entry.itemName}</td>
                  <td className="px-4 py-3 uppercase">{JOB_TYPE_LABELS[entry.jobType]}</td>
                  <td className="px-4 py-3 font-mono">{entry.quantity}</td>
                  <td className="px-4 py-3 font-mono">Rp {entry.total.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 border font-black uppercase text-[10px] ${
                      entry.status === 'Paid' ? 'bg-emerald-100 border-emerald-800 text-emerald-800' : 'bg-amber-100 border-amber-800 text-amber-800'
                    }`}>
                      {entry.status === 'Paid' ? 'Dibayar' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {entry.status === 'Pending' && (
                      <button
                        onClick={() => openEditEntryModal(entry)}
                        className="text-[10px] font-black uppercase text-black underline cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showEntryModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] border-4 border-black overflow-hidden">
            <div className="bg-black text-white px-5 py-4 flex justify-between items-center border-b-2 border-black">
              <h3 className="font-display font-black text-sm uppercase tracking-wider">
                {editingEntry ? 'EDIT PEKERJAAN' : 'TAMBAH PEKERJAAN'}
              </h3>
              <button
                onClick={() => setShowEntryModal(false)}
                className="text-brand hover:text-white font-mono font-black text-xs uppercase cursor-pointer"
              >
                CLOSE
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="p-5 space-y-4 bg-white text-black">
              <div>
                <label className="block text-xs font-black text-black uppercase">Tanggal</label>
                <input
                  type="date"
                  required
                  value={entryFormData.entryDate}
                  onChange={(e) => setEntryFormData({ ...entryFormData, entryDate: e.target.value })}
                  className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black font-mono focus:bg-brand/10 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black text-black uppercase">Item</label>
                <select
                  required
                  value={entryFormData.itemName}
                  onChange={(e) => setEntryFormData({ ...entryFormData, itemName: e.target.value, jobType: '' })}
                  className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none cursor-pointer"
                >
                  <option value="">PILIH ITEM</option>
                  {jobPriceList.map((item) => (
                    <option key={item.id} value={item.itemName}>{item.itemName}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-black uppercase">Jenis Pekerjaan</label>
                <select
                  required
                  disabled={!selectedItem}
                  value={entryFormData.jobType}
                  onChange={(e) => setEntryFormData({ ...entryFormData, jobType: e.target.value as JobType })}
                  className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none cursor-pointer disabled:opacity-50"
                >
                  <option value="">PILIH JENIS</option>
                  {availableJobTypes.map((jt) => (
                    <option key={jt} value={jt}>{JOB_TYPE_LABELS[jt]}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-black uppercase">Nominal / Unit</label>
                  <div className="mt-1 block w-full rounded-none border-2 border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs font-black font-mono text-zinc-600">
                    {unitPrice !== undefined ? `Rp ${unitPrice.toLocaleString('id-ID')}` : '-'}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-black text-black uppercase">Qty</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={entryFormData.quantity}
                    onChange={(e) => setEntryFormData({ ...entryFormData, quantity: Number(e.target.value) })}
                    className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black font-mono focus:bg-brand/10 focus:outline-none"
                  />
                </div>
              </div>

              <div className="border-t-2 border-black pt-3 flex justify-between font-black text-xs uppercase">
                <span>Total</span>
                <span className="font-mono">{total !== undefined ? `Rp ${total.toLocaleString('id-ID')}` : '-'}</span>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-xs border-2 border-black rounded-none shadow-[4px_4px_0px_var(--brand-color)] hover:shadow-[4px_4px_0px_rgba(0,0,0,1)] uppercase tracking-widest transition-all mt-4 cursor-pointer"
              >
                Simpan Pekerjaan
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
