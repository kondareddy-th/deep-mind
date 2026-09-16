// Tiny DOM builders for viz control panels (kept out of React so each
// visualization is a self-contained vanilla module).

export function slider(parent, label, { min, max, step, value }, onInput) {
  const wrap = document.createElement('label')
  const span = document.createElement('span')
  span.textContent = label
  const input = document.createElement('input')
  input.type = 'range'
  input.min = min
  input.max = max
  input.step = step
  input.value = value
  input.addEventListener('input', () => onInput(parseFloat(input.value)))
  wrap.append(span, input)
  parent.appendChild(wrap)
  return {
    set(v) {
      input.value = v
    },
  }
}

export function readout(parent, initial = '') {
  const el = document.createElement('div')
  el.className = 'readout'
  el.textContent = initial
  parent.appendChild(el)
  return {
    set(text) {
      el.textContent = text
    },
    setHTML(html) {
      el.innerHTML = html
    },
  }
}

export function button(parent, label, onClick) {
  const el = document.createElement('button')
  el.textContent = label
  el.addEventListener('click', onClick)
  parent.appendChild(el)
  return el
}

export function select(parent, label, options, onChange) {
  const wrap = document.createElement('label')
  const span = document.createElement('span')
  span.textContent = label
  const sel = document.createElement('select')
  for (const opt of options) {
    const o = document.createElement('option')
    o.value = opt.value
    o.textContent = opt.label
    sel.appendChild(o)
  }
  sel.addEventListener('change', () => onChange(sel.value))
  wrap.append(span, sel)
  parent.appendChild(wrap)
  return sel
}
