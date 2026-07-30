import { JobEntry, JobType } from '../../types';
import { useApprovalActions } from '../../hooks/useApprovalActions';

interface ApprovalTabProps {
  jobEntries: JobEntry[];
  approvalActions: ReturnType<typeof useApprovalActions>;
}

const JOB_TYPE_LABELS: Record<JobType, string> = {
  CLEANING: 'Cleaning',
  LAUNDRY: 'Laundry',
  INVENTARIS: 'Inventaris',
};

export default function ApprovalTab({ jobEntries, approvalActions }: ApprovalTabProps) {
  const {
    selectedIds,
    toggleSelected,
    paymentDateInput,
    setPaymentDateInput,
    handleApproveBatch,
  } = approvalActions;

  const pendingEntries = jobEntries.filter((e) => e.status === 'Pending');
  const paidEntries = jobEntries.filter((e) => e.status === 'Paid');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">APPROVAL PEKERJAAN</h2>
        <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Setujui dan bayar pekerjaan yang sudah dicatat karyawan.</p>
      </div>

      <div className="border-2 border-black bg-red-50 p-4 rounded-none flex flex-col sm:flex-row sm:items-center gap-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-wider shrink-0">Tanggal Pembayaran</label>
        <input
          type="date"
          value={paymentDateInput}
          onChange={(e) => setPaymentDateInput(e.target.value)}
          className="bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
        />
        <button
          onClick={handleApproveBatch}
          disabled={selectedIds.length === 0}
          className="ml-auto bg-red-600 hover:bg-black text-white font-black text-xs border-2 border-black px-5 py-2.5 rounded-none transition-colors uppercase tracking-widest cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Setujui & Bayar Terpilih ({selectedIds.length})
        </button>
      </div>

      <div className="border-2 border-black rounded-none overflow-hidden shadow-[4px_4px_0px_rgba(0,0,0,1)] bg-white overflow-x-auto">
        <table className="w-full text-left min-w-[750px]">
          <thead className="bg-black text-white text-[10px] uppercase tracking-wider font-black">
            <tr>
              <th className="px-4 py-3 w-10"></th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {pendingEntries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-xs text-zinc-400 font-bold uppercase">
                  Tidak ada pekerjaan yang menunggu approval.
                </td>
              </tr>
            ) : (
              pendingEntries.map((entry) => (
                <tr key={entry.id} className="text-xs font-bold">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(entry.id)}
                      onChange={() => toggleSelected(entry.id)}
                      className="w-4 h-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3 text-black uppercase">{entry.employeeName}</td>
                  <td className="px-4 py-3 font-mono text-zinc-600">{entry.entryDate}</td>
                  <td className="px-4 py-3 uppercase">{entry.itemName}</td>
                  <td className="px-4 py-3 uppercase">{JOB_TYPE_LABELS[entry.jobType]}</td>
                  <td className="px-4 py-3 font-mono">{entry.quantity}</td>
                  <td className="px-4 py-3 font-mono">Rp {entry.total.toLocaleString('id-ID')}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {paidEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-black text-black uppercase tracking-wider">Riwayat Dibayar</h3>
          <div className="border-2 border-black rounded-none overflow-hidden shadow-[4px_4px_0px_rgba(0,0,0,1)] bg-white overflow-x-auto">
            <table className="w-full text-left min-w-[750px]">
              <thead className="bg-zinc-100 text-black text-[10px] uppercase tracking-wider font-black">
                <tr>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">Tanggal Bayar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {paidEntries.map((entry) => (
                  <tr key={entry.id} className="text-xs font-bold">
                    <td className="px-4 py-3 text-black uppercase">{entry.employeeName}</td>
                    <td className="px-4 py-3 uppercase">{entry.itemName}</td>
                    <td className="px-4 py-3 uppercase">{JOB_TYPE_LABELS[entry.jobType]}</td>
                    <td className="px-4 py-3 font-mono">Rp {entry.total.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3 font-mono text-emerald-700">{entry.paymentDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
