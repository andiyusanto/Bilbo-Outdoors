import { forwardRef, InputHTMLAttributes } from 'react';
import { formatDateLabel, formatDateTimeInputLabel } from '../lib/date';

// Wraps a native <input type="date"|"datetime-local"> with a fixed DD-MM-YYYY
// (or DD-MM-YYYY, HH:mm) overlay - the native control's own segments are
// hidden via the `date-input-hide-native` class (src/index.css) since they
// otherwise render in the visitor's browser/OS locale, not this app's format.
// Every date/datetime input in the app should go through this one component
// rather than a bare <input>, so the fix stays consistent in one place.
interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  type?: 'date' | 'datetime-local';
  value: string;
  onChange: (value: string) => void;
  leftPadding?: 3 | 4;
  // Sizing classes (e.g. "flex-1", "w-full") belong here, not in `className` -
  // they need to apply to this outer wrapper div for the parent's layout
  // (flex/grid) to size it correctly, not to the inner <input>.
  wrapperClassName?: string;
}

const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { type = 'date', value, onChange, className = '', leftPadding = 3, wrapperClassName = '', ...rest },
  ref
) {
  const display = value
    ? (type === 'datetime-local' ? formatDateTimeInputLabel(value) : formatDateLabel(value))
    : (type === 'datetime-local' ? 'DD-MM-YYYY, --:--' : 'DD-MM-YYYY');

  return (
    <div className={`relative ${wrapperClassName}`}>
      <input
        ref={ref}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`date-input-hide-native ${className}`}
        {...rest}
      />
      <span
        className={`date-input-overlay pointer-events-none absolute inset-y-0 ${leftPadding === 4 ? 'left-4' : 'left-3'} items-center text-xs font-bold uppercase text-black`}
      >
        {display}
      </span>
    </div>
  );
});

export default DateInput;
