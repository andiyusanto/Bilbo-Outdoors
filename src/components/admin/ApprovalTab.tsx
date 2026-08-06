import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { JobEntry, JobType } from '../../types';
import { useApprovalActions } from '../../hooks/useApprovalActions';
import { formatDateLabel, getDefaultDateRange } from '../../lib/date';
import DateInput from '../DateInput';

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
    toggleSelectAll,
    paymentDateInput,
    setPaymentDateInput,
    handleApproveBatch,
    rejectingEntry,
    rejectReason,
    setRejectReason,
    openRejectModal,
    closeRejectModal,
    handleReject,
  } = approvalActions;

  const [approvalSearch, setApprovalSearch] = useState<string>('');
  const [approvalDateFrom, setApprovalDateFrom] = useState<string>(() => getDefaultDateRange().from);
  const [approvalDateTo, setApprovalDateTo] = useState<string>(() => getDefaultDateRange().to);

  const matchesFilters = (entry: JobEntry) => {
    const matchesSearch = entry.employeeName.toLowerCase().includes(approvalSearch.toLowerCase());
    const matchesFrom = !approvalDateFrom || entry.entryDate >= approvalDateFrom;
    const matchesTo = !approvalDateTo || entry.entryDate <= approvalDateTo;
    return matchesSearch && matchesFrom && matchesTo;
  };

  const hasActiveFilter = Boolean(approvalSearch || approvalDateFrom || approvalDateTo);
  const allPaidEntries = jobEntries.filter((e) => e.status === 'Paid');
  const allRejectedEntries = jobEntries.filter((e) => e.status === 'Rejected');
  const pendingEntries = jobEntries.filter((e) => e.status === 'Pending').filter(matchesFilters);
  const paidEntries = allPaidEntries.filter(matchesFilters);
  const rejectedEntries = allRejectedEntries.filter(matchesFilters);

  const pendingTotal = pendingEntries.reduce((sum, e) => sum + e.total, 0);
  const paidTotal = paidEntries.reduce((sum, e) => sum + e.total, 0);

  const pendingIds = pendingEntries.map((e) => e.id);
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedIds.includes(id));
  const somePendingSelected = pendingIds.some((id) => selectedIds.includes(id));
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = somePendingSelected && !allPendingSelected;
    }
  }, [somePendingSelected, allPendingSelected]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-display font-black text-black uppercase tracking-tight">APPROVAL PEKERJAAN</h2>
        <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider mt-1">Setujui dan bayar pekerjaan yang sudah dicatat karyawan.</p>
      </div>

      <div className="border-2 border-black bg-red-50 p-4 rounded-none flex flex-col sm:flex-row sm:items-center gap-3 shadow-[2px_2px_0px_rgba(0,0,0,1)]">
        <label className="text-[10px] font-black text-zinc-600 uppercase tracking-wider shrink-0">Tanggal Pembayaran</label>
        <DateInput
          value={paymentDateInput}
          onChange={setPaymentDateInput}
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

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative">
          <Search className="w-4 h-4 text-black absolute left-3 top-3.5 stroke-[2.5]" />
          <input
            type="text"
            placeholder="Cari nama karyawan..."
            value={approvalSearch}
            onChange={(e) => setApprovalSearch(e.target.value)}
            className="pl-9 pr-4 py-2.5 text-xs bg-white border-2 border-black rounded-none focus:bg-brand/10 focus:outline-none w-full sm:w-52 font-black tracking-wider"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-zinc-600 uppercase tracking-wider shrink-0">Dari</label>
          <DateInput
            value={approvalDateFrom}
            onChange={setApprovalDateFrom}
            className="bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black text-zinc-600 uppercase tracking-wider shrink-0">Sampai</label>
          <DateInput
            value={approvalDateTo}
            onChange={setApprovalDateTo}
            className="bg-white border-2 border-black px-3 py-2 text-xs font-bold rounded-none focus:outline-none"
          />
        </div>
      </div>

      <div className="border-2 border-black rounded-none overflow-hidden shadow-[4px_4px_0px_rgba(0,0,0,1)] bg-white overflow-x-auto">
        <table className="w-full text-left min-w-[750px]">
          <thead className="bg-black text-white text-[10px] uppercase tracking-wider font-black">
            <tr>
              <th className="px-4 py-3 w-10">
                {pendingEntries.length > 0 && (
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allPendingSelected}
                    onChange={() => toggleSelectAll(pendingIds)}
                    aria-label="Pilih semua"
                    className="w-4 h-4 cursor-pointer"
                  />
                )}
              </th>
              <th className="px-4 py-3">Nama</th>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {pendingEntries.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-xs text-zinc-400 font-bold uppercase">
                  {hasActiveFilter ? 'Tidak ada pekerjaan pending yang cocok dengan filter.' : 'Tidak ada pekerjaan yang menunggu approval.'}
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
                  <td className="px-4 py-3 font-mono text-zinc-600">{formatDateLabel(entry.entryDate)}</td>
                  <td className="px-4 py-3 uppercase">{entry.itemName}</td>
                  <td className="px-4 py-3 uppercase">{JOB_TYPE_LABELS[entry.jobType]}</td>
                  <td className="px-4 py-3 font-mono">{entry.quantity}</td>
                  <td className="px-4 py-3 font-mono">Rp {entry.total.toLocaleString('id-ID')}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openRejectModal(entry)}
                      className="text-[10px] font-black uppercase text-red-700 underline cursor-pointer"
                    >
                      Tolak
                    </button>
                  </td>
                </tr>
              ))
            )}
            {pendingEntries.length > 0 && (
              <tr className="text-xs font-black bg-zinc-50 border-t-2 border-black">
                <td colSpan={6} className="px-4 py-3 text-right uppercase">Total</td>
                <td className="px-4 py-3 font-mono">Rp {pendingTotal.toLocaleString('id-ID')}</td>
                <td className="px-4 py-3"></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {allRejectedEntries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-black text-black uppercase tracking-wider">Riwayat Ditolak</h3>
          <div className="border-2 border-black rounded-none overflow-hidden shadow-[4px_4px_0px_rgba(0,0,0,1)] bg-white overflow-x-auto">
            <table className="w-full text-left min-w-[750px]">
              <thead className="bg-zinc-100 text-black text-[10px] uppercase tracking-wider font-black">
                <tr>
                  <th className="px-4 py-3">Nama</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3">Alasan</th>
                  <th className="px-4 py-3">Tanggal Ditolak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rejectedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-zinc-400 font-bold uppercase">
                      Tidak ada riwayat ditolak yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  rejectedEntries.map((entry) => (
                    <tr key={entry.id} className="text-xs font-bold">
                      <td className="px-4 py-3 text-black uppercase">{entry.employeeName}</td>
                      <td className="px-4 py-3 uppercase">{entry.itemName}</td>
                      <td className="px-4 py-3 uppercase">{JOB_TYPE_LABELS[entry.jobType]}</td>
                      <td className="px-4 py-3 text-red-700">{entry.rejectionReason}</td>
                      <td className="px-4 py-3 font-mono text-red-700">{entry.rejectedAt ? formatDateLabel(entry.rejectedAt.split('T')[0]) : '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rejectingEntry && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-none shadow-[8px_8px_0px_rgba(0,0,0,1)] border-4 border-black overflow-hidden">
            <div className="bg-black text-white px-5 py-4 flex justify-between items-center border-b-2 border-black">
              <h3 className="font-display font-black text-sm uppercase tracking-wider">TOLAK PEKERJAAN</h3>
              <button
                onClick={closeRejectModal}
                className="text-brand hover:text-white font-mono font-black text-xs uppercase cursor-pointer"
              >
                CLOSE
              </button>
            </div>

            <div className="p-5 space-y-4 bg-white text-black">
              <p className="text-xs font-bold uppercase text-zinc-600">
                {rejectingEntry.employeeName} — {rejectingEntry.itemName} ({JOB_TYPE_LABELS[rejectingEntry.jobType]}, Qty {rejectingEntry.quantity})
              </p>

              <div>
                <label className="block text-xs font-black text-black uppercase">Alasan Penolakan</label>
                <textarea
                  required
                  autoFocus
                  rows={3}
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Contoh: Qty salah, seharusnya 3 bukan 5"
                  className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black focus:bg-brand/10 focus:outline-none"
                ></textarea>
              </div>

              <button
                type="button"
                onClick={handleReject}
                disabled={!rejectReason.trim()}
                className="w-full py-3 bg-red-600 hover:bg-black text-white font-black text-xs border-2 border-black rounded-none uppercase tracking-widest transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Tolak Pekerjaan
              </button>
            </div>
          </div>
        </div>
      )}

      {allPaidEntries.length > 0 && (
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
                {paidEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-xs text-zinc-400 font-bold uppercase">
                      Tidak ada riwayat dibayar yang cocok dengan filter.
                    </td>
                  </tr>
                ) : (
                  paidEntries.map((entry) => (
                    <tr key={entry.id} className="text-xs font-bold">
                      <td className="px-4 py-3 text-black uppercase">{entry.employeeName}</td>
                      <td className="px-4 py-3 uppercase">{entry.itemName}</td>
                      <td className="px-4 py-3 uppercase">{JOB_TYPE_LABELS[entry.jobType]}</td>
                      <td className="px-4 py-3 font-mono">Rp {entry.total.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3 font-mono text-emerald-700">{entry.paymentDate ? formatDateLabel(entry.paymentDate) : '-'}</td>
                    </tr>
                  ))
                )}
                {paidEntries.length > 0 && (
                  <tr className="text-xs font-black bg-zinc-50 border-t-2 border-black">
                    <td colSpan={3} className="px-4 py-3 text-right uppercase">Total</td>
                    <td className="px-4 py-3 font-mono">Rp {paidTotal.toLocaleString('id-ID')}</td>
                    <td className="px-4 py-3"></td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
