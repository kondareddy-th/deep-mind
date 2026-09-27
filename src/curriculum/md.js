// Template tag for lesson content that contains CODE.
//
// Lesson text lives in JS template literals, so a raw backtick would end the string.
// This tag behaves exactly like String.raw (LaTeX backslashes survive untouched)
// with one addition: an escaped backtick \` becomes a real backtick. So authors write
//
//     inline code:   \`self.name\`
//     code blocks:   ~~~python ... ~~~        (tilde fences need no escaping at all)
//
// The dollar-brace sequence is still forbidden — it is JS interpolation.
export const md = (strings, ...values) => String.raw(strings, ...values).replace(/\\`/g, '`')
