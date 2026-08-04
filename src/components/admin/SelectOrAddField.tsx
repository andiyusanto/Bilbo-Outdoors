import { useState } from 'react';
import { Plus } from 'lucide-react';

interface SelectOrAddFieldProps {
  label: string;
  value: string;
  options: string[]; // distinct existing values, non-empty
  onChange: (value: string) => void;
  addButtonLabel: string;
  newInputPlaceholder: string;
  allowEmpty?: boolean; // adds a blank "(Tidak Ada)" option to the select
}

export default function SelectOrAddField({
  label,
  value,
  options,
  onChange,
  addButtonLabel,
  newInputPlaceholder,
  allowEmpty = false,
}: SelectOrAddFieldProps) {
  const [adding, setAdding] = useState(false);
  const [newInput, setNewInput] = useState('');

  // Defensive union so the currently-selected value is never missing from the
  // dropdown, even if it's not in the live product-derived list (e.g. the
  // product being edited is the only one left with a value since renamed
  // elsewhere).
  const selectOptions = Array.from(new Set([...options, value].filter(Boolean)));

  const confirmNew = () => {
    const trimmed = newInput.trim();
    if (!trimmed) return;
    const existingMatch = selectOptions.find((o) => o.toLowerCase() === trimmed.toLowerCase());
    onChange(existingMatch ?? trimmed);
    setAdding(false);
    setNewInput('');
  };

  return (
    // sm:col-span-3 lets this field temporarily take over the whole Varian/Ukuran/Warna
    // grid row while "adding" - a single grid column (~1/3 of the box width) is too
    // narrow to fit "input + Gunakan + Batal" without them overlapping the next field.
    <div className={adding ? 'sm:col-span-3' : undefined}>
      <label className="block text-xs font-black text-black uppercase">{label}</label>
      {adding ? (
        <div className="mt-1 flex gap-2">
          <input
            type="text"
            autoFocus
            value={newInput}
            onChange={(e) => setNewInput(e.target.value)}
            placeholder={newInputPlaceholder}
            className="block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black tracking-wider focus:bg-brand/10 focus:outline-none"
          />
          <button
            type="button"
            onClick={confirmNew}
            className="shrink-0 px-3 bg-black hover:bg-brand hover:text-black text-brand font-black text-[10px] border-2 border-black uppercase tracking-widest cursor-pointer"
          >
            Gunakan
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewInput(''); }}
            className="shrink-0 px-3 bg-white hover:bg-zinc-100 text-black font-black text-[10px] border-2 border-black uppercase tracking-widest cursor-pointer"
          >
            Batal
          </button>
        </div>
      ) : (
        <>
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 block w-full rounded-none border-2 border-black px-3 py-2.5 text-xs font-black uppercase tracking-wider focus:bg-brand/10 focus:outline-none cursor-pointer"
          >
            {allowEmpty && <option value="">(Tidak Ada)</option>}
            {selectOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-1.5 flex items-center text-[10px] font-black text-zinc-600 hover:text-black uppercase tracking-wider cursor-pointer"
          >
            <Plus className="w-3 h-3 mr-1 stroke-[3]" />
            {addButtonLabel}
          </button>
        </>
      )}
    </div>
  );
}
