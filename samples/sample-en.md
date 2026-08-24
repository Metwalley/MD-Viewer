# 🚀 MD-Viewer Sample (English)

Welcome to **MD-Viewer** — a fast, minimal Markdown reader for Windows.

> This file showcases everything the renderer supports. Drag any `.md` file onto the window to open it as a tab.

## Why MD-Viewer?

- Opens instantly — no IDE, no project, no noise
- Multiple **tabs** for multiple files
- Toggle between **Preview** and **Code** with one click (`Ctrl+Shift+V`)
- Full **Arabic / RTL** support — see `sample-ar.md`
- Files always open in **Preview** mode, because reading comes first

## Text formatting

You can write **bold**, *italic*, ~~strikethrough~~, and `inline code`.
Links work too: [GitHub — Metwalley](https://github.com/Metwalley)

## Lists

1. Open a file with `Ctrl+O`
2. Or drag & drop it onto the window
3. Read. That's it.

### Task list

- [x] Multiple tabs
- [x] Preview / Code toggle
- [x] Arabic RTL support
- [ ] Your feature request here

## Tables

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` | Open file |
| `Ctrl+W` | Close tab |
| `Ctrl+Tab` | Next tab |
| `Ctrl+Shift+V` | Toggle Preview / Code |
| `Ctrl+S` | Save (after editing in Code view) |

## Code blocks

```python
def fibonacci(n: int) -> list[int]:
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq[:n]

print(fibonacci(10))
```

```javascript
const greet = (name) => `Hello, ${name}!`;
console.log(greet('world'));
```

## Blockquotes

> "Simplicity is the ultimate sophistication."
> — Leonardo da Vinci

---

**Tip:** hover over any code block for a **Copy** button. Selecting and copying text from the preview works exactly as you'd expect.
