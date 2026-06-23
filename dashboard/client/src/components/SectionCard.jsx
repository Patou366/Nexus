export function SectionCard({ title, description, children }) {
  return (
    <div className="bg-[#1a1d27] border border-[#1e2130] rounded-xl p-6 mb-5">
      {(title || description) && (
        <div className="mb-5 pb-4 border-b border-[#1e2130]">
          {title && <h2 className="text-white font-semibold text-base">{title}</h2>}
          {description && <p className="text-gray-500 text-sm mt-0.5">{description}</p>}
        </div>
      )}
      <div className="space-y-5">{children}</div>
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
      <div className="sm:w-52 shrink-0">
        <p className="text-gray-200 text-sm font-medium">{label}</p>
        {hint && <p className="text-gray-500 text-xs mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}

export function TextInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent placeholder-gray-600"
    />
  )
}

export function Toggle({ value, onChange, label }) {
  const checked = Boolean(value)
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div className="relative shrink-0" style={{ width: '2.5rem', height: '1.375rem' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          className="sr-only"
        />
        <div
          onClick={() => onChange(!checked)}
          className={`absolute inset-0 rounded-full transition-colors duration-200 ${checked ? 'bg-brand-600' : 'bg-gray-700'}`}
        />
        <span
          onClick={() => onChange(!checked)}
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </div>
      {label && <span className="text-gray-300 text-sm">{label}</span>}
    </label>
  )
}

export function SliderInput({ value, onChange, min = 0, max = 100, step = 1, unit = '' }) {
  return (
    <div className="flex items-center gap-4">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? min}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 accent-brand-500 cursor-pointer"
      />
      <span className="text-gray-300 text-sm w-14 text-right tabular-nums">
        {value ?? min}{unit}
      </span>
    </div>
  )
}

export function SelectInput({ value, onChange, options, placeholder }) {
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      className="w-full bg-[#0f1117] border border-[#2a2d3e] text-gray-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

export function SaveButton({ onClick, saving, saved }) {
  return (
    <button
      onClick={onClick}
      disabled={saving}
      className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
        saved
          ? 'bg-green-600/20 text-green-400 border border-green-600/30'
          : 'bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
      }`}
    >
      {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
    </button>
  )
}

export function useSectionSave(fn) {
  return fn
}
