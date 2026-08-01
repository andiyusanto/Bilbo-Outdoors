import { forwardRef, InputHTMLAttributes, MouseEvent, useImperativeHandle, useRef } from 'react';
import { Calendar } from 'lucide-react';
import { formatDateLabel, formatDateTimeInputLabel } from '../lib/date';

// A native <input type="date"|"datetime-local"> renders its own segments in
// the visitor's browser/OS locale (e.g. MM/DD/YYYY), not this app's
// lang="id" - and Firefox exposes none of the shadow parts that would let a
// stylesheet hide just that text (unlike Chromium/WebKit), so there is no
// CSS-only fix that works in every browser. This instead makes the real
// input fully invisible (opacity-0, stretched over the whole box) and draws
// an entirely custom-looking box + icon in its place - identical in every
// browser, since nothing here depends on browser-specific styling hooks.
// The real input still receives every click (it's the positioned element,
// so it paints - invisibly - on top) and still drives focus, keyboard entry,
// and native required/min/max validation exactly as before.
interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  type?: 'date' | 'datetime-local';
  value: string;
  onChange: (value: string) => void;
  // Sizing classes (e.g. "flex-1", "w-full") belong here, not in `className` -
  // they need to apply to this outer wrapper div for the parent's layout
  // (flex/grid) to size it correctly, not to the visible fake box.
  wrapperClassName?: string;
}

const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { type = 'date', value, onChange, className = '', wrapperClassName = '', onClick, ...rest },
  ref
) {
  const innerRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

  const placeholder = type === 'datetime-local' ? 'DD-MM-YYYY, --:--' : 'DD-MM-YYYY';
  const display = value
    ? (type === 'datetime-local' ? formatDateTimeInputLabel(value) : formatDateLabel(value))
    : placeholder;

  // Desktop only (mouse/trackpad) - mobile already opens its own native
  // picker on tap, calling showPicker() there too is redundant at best.
  const handleClick = (e: MouseEvent<HTMLInputElement>) => {
    if (window.matchMedia('(pointer: fine)').matches) {
      innerRef.current?.showPicker?.();
    }
    onClick?.(e);
  };

  return (
    <div className={`relative focus-within:ring-2 focus-within:ring-brand ${wrapperClassName}`}>
      <div className={`pointer-events-none flex items-center justify-between gap-2 ${className}`}>
        <span className={value ? '' : 'text-zinc-400'}>{display}</span>
        <Calendar className="w-4 h-4 shrink-0 text-zinc-500 stroke-[2.5]" />
      </div>
      <input
        ref={innerRef}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={handleClick}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        {...rest}
      />
    </div>
  );
});

export default DateInput;
