"""Generador del sistema de marca Flow (herramientas corporativas Dimassi).

Símbolo: anillo de tres arcos (formas rellenas, extremos redondos) alrededor de un centro.
Nombre: letras geométricas monolínea. El prefijo de la herramienta va sólido (trazo grueso, marino);
"flow" va siempre como línea (trazo fino, azul Dimassi): es lo que une a la familia.
"""
import math, os, sys

NAVY, BLUE, SKY, TEAL, GREEN, LIME = '#152C75', '#0066B3', '#00A1E4', '#00B6BE', '#50B848', '#BFD730'

# Cada herramienta de la línea: arcos (azul y celeste fijos + acento propio) y centro marino.
PRODUCTS = {
    'team': {'name': 'Team', 'accent': GREEN},
    'doc': {'name': 'Doc', 'accent': LIME},     # ejemplo de futura herramienta
    'sales': {'name': 'Sales', 'accent': TEAL},  # ejemplo de futura herramienta
}

# ---------------------------------------------------------------- símbolo
def ring_paths(colors, cx=128, cy=128, r=82, w=34, gap_deg=50, dot_r=20, dot_color=NAVY, rot=0):
    h = w / 2
    out = []
    for i, col in enumerate(colors):
        a0 = rot - 60 + i * 120 + gap_deg / 2
        a1 = rot + 60 + i * 120 - gap_deg / 2
        P = lambda rad, a: (cx + rad * math.cos(math.radians(a)), cy + rad * math.sin(math.radians(a)))
        o0, o1, i1, i0 = P(r + h, a0), P(r + h, a1), P(r - h, a1), P(r - h, a0)
        d = (f'M{o0[0]:.2f} {o0[1]:.2f} A{r+h} {r+h} 0 0 1 {o1[0]:.2f} {o1[1]:.2f} '
             f'A{h} {h} 0 0 1 {i1[0]:.2f} {i1[1]:.2f} A{r-h} {r-h} 0 0 0 {i0[0]:.2f} {i0[1]:.2f} '
             f'A{h} {h} 0 0 1 {o0[0]:.2f} {o0[1]:.2f} Z')
        out.append(f'<path d="{d}" fill="{col}"/>')
    out.append(f'<circle cx="{cx}" cy="{cy}" r="{dot_r}" fill="{dot_color}"/>')
    return ''.join(out)

def symbol_svg(colors, dot=NAVY, title='Logo', **kw):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>{title}</title>'
            f'{ring_paths(colors, dot_color=dot, **kw)}</svg>')

# ---------------------------------------------------------------- letras (líneas centrales)
XH, BASE, ASC = 120, 200, 40   # x-height, línea base, ascendente

def glyph(ch, x, w):
    """Devuelve (path_d, avance) para la letra en x con trazo w."""
    top = BASE - XH + w / 2          # borde superior de las minúsculas (línea central)
    bot = BASE - w / 2
    R = (XH - w) / 2                 # radio de los círculos
    cy = BASE - XH / 2
    if ch == 'T':
        W = 92
        return f'M{x} {ASC+w/2} H{x+W} M{x+W/2} {ASC+w/2} V{bot}', W
    if ch == 'D':
        W = 96; t = ASC + w / 2; Rr = (bot - t) / 2
        return f'M{x} {t} V{bot} H{x+W-Rr} A{Rr} {Rr} 0 0 0 {x+W-Rr} {t} Z', W
    if ch == 'S':
        W = 86; t = ASC + w / 2; rr = (bot - t) / 4
        return (f'M{x+W} {t+rr*0.7} A{W/2} {rr} 0 0 0 {x+W/2} {t} A{W/2} {rr} 0 0 0 {x+W/2} {t+2*rr} '
                f'A{W/2} {rr} 0 0 1 {x+W/2} {bot} A{W/2} {rr} 0 0 1 {x} {bot-rr*0.7}'), W
    if ch in 'oe a'.replace(' ', ''):
        c = x + R
        if ch == 'o':
            return f'M{c-R} {cy} A{R} {R} 0 1 1 {c+R} {cy} A{R} {R} 0 1 1 {c-R} {cy} Z', 2 * R
        if ch == 'e':
            ex, ey = c + R * math.cos(math.radians(40)), cy + R * math.sin(math.radians(40))
            return f'M{c-R} {cy} H{c+R} A{R} {R} 0 1 0 {ex:.2f} {ey:.2f}', 2 * R
        if ch == 'a':
            return (f'M{c+R} {cy} A{R} {R} 0 1 0 {c-R} {cy} A{R} {R} 0 1 0 {c+R} {cy} '
                    f'M{c+R} {top} V{bot}'), 2 * R
    if ch == 'c':
        c = x + R
        sx, sy = c + R * math.cos(math.radians(-45)), cy + R * math.sin(math.radians(-45))
        ex, ey = c + R * math.cos(math.radians(45)), cy + R * math.sin(math.radians(45))
        return f'M{sx:.2f} {sy:.2f} A{R} {R} 0 1 0 {ex:.2f} {ey:.2f}', 2 * R
    if ch == 's':
        W = 2 * R * 0.82; rr = (bot - top) / 4
        return (f'M{x+W} {top+rr*0.6} A{W/2} {rr} 0 0 0 {x+W/2} {top} A{W/2} {rr} 0 0 0 {x+W/2} {top+2*rr} '
                f'A{W/2} {rr} 0 0 1 {x+W/2} {bot} A{W/2} {rr} 0 0 1 {x} {bot-rr*0.6}'), W
    if ch == 'l':
        return f'M{x} {ASC+w/2} V{bot}', 0
    if ch == 'f':
        rr = 26
        return (f'M{x} {bot} V{ASC+w/2+rr} A{rr} {rr} 0 0 1 {x+rr} {ASC+w/2} H{x+rr+10} '
                f'M{x-22} {top} H{x+32}'), rr + 10
    if ch == 'm':
        r1 = (XH - w) / 2 * 0.86
        return (f'M{x} {bot} V{top} M{x} {top+r1} A{r1} {r1} 0 0 1 {x+2*r1} {top+r1} V{bot} '
                f'M{x+2*r1} {top+r1} A{r1} {r1} 0 0 1 {x+4*r1} {top+r1} V{bot}'), 4 * r1
    if ch == 'w':
        u = 30
        return f'M{x} {top} L{x+u} {bot} L{x+2*u} {top+18} L{x+3*u} {bot} L{x+4*u} {top}', 4 * u
    raise ValueError(ch)

GAP = {('T', 'e'): -6, ('e', 'a'): 0, ('a', 'm'): 6, ('f', 'l'): 4, ('l', 'o'): 8, ('o', 'w'): 2}

def word_paths(text, x, w, color, prev_last=None):
    parts = []
    last = prev_last
    for ch in text:
        if last is not None:
            x += 30 + GAP.get((last, ch), 0) + (w - 12) * 0.35
        d, adv = glyph(ch, x, w)
        parts.append(d)
        x += adv
        last = ch
    path = (f'<path d="{" ".join(parts)}" fill="none" stroke="{color}" stroke-width="{w}" '
            f'stroke-linecap="round" stroke-linejoin="round"/>')
    return path, x, last

def wordmark(prefix, x0=0, heavy=26, light=11, prefix_color=NAVY, flow_color=BLUE):
    a, x, last = word_paths(prefix, x0 + heavy / 2, heavy, prefix_color)
    b, x, _ = word_paths('flow', x + 14, light, flow_color, prev_last=last)
    return a + b, x + heavy / 2

def lockup_horizontal(key, mono=None, endorse=True):
    p = PRODUCTS[key]
    colors = [BLUE, SKY, p['accent']] if not mono else [mono] * 3
    sym = f'<g transform="translate(0 0)">{ring_paths(colors, dot_color=mono or NAVY)}</g>'
    wm, end = wordmark(p['name'], x0=300, prefix_color=mono or NAVY, flow_color=mono or BLUE)
    tag = ''
    if endorse:
        tag = (f'<text x="{300}" y="244" font-family="Helvetica Neue, Arial, sans-serif" font-size="22" '
               f'letter-spacing="5" fill="{mono or NAVY}" opacity="0.75">HERRAMIENTAS DIMASSI</text>')
    W = int(end + 30)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} 256"><title>{p["name"]}flow</title>'
            f'{sym}{wm}{tag}</svg>')

def lockup_stacked(key, mono=None):
    p = PRODUCTS[key]
    colors = [BLUE, SKY, p['accent']] if not mono else [mono] * 3
    wm, end = wordmark(p['name'], x0=0, prefix_color=mono or NAVY, flow_color=mono or BLUE)
    W = max(256, int(end))
    sym_x = (W - 256) / 2
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} 480"><title>{p["name"]}flow</title>'
            f'<g transform="translate({sym_x:.1f} 0)">{ring_paths(colors, dot_color=mono or NAVY)}</g>'
            f'<g transform="translate({(W-end)/2:.1f} 250)">{wm}</g></svg>')

if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else '.'
    os.makedirs(out, exist_ok=True)
    def save(name, svg):
        open(os.path.join(out, name), 'w').write(svg)
    for key, p in PRODUCTS.items():
        slug = p['name'].lower() + 'flow'
        save(f'{slug}-symbol.svg', symbol_svg([BLUE, SKY, p['accent']], title=f'{p["name"]}flow'))
        save(f'{slug}-horizontal.svg', lockup_horizontal(key))
        save(f'{slug}-horizontal-sin-respaldo.svg', lockup_horizontal(key, endorse=False))
        save(f'{slug}-stacked.svg', lockup_stacked(key))
        save(f'{slug}-horizontal-white.svg', lockup_horizontal(key, mono='#FFFFFF'))
        save(f'{slug}-horizontal-black.svg', lockup_horizontal(key, mono='#000000'))
    save('teamflow-symbol-black.svg', symbol_svg(['#000000'] * 3, dot='#000000', title='Teamflow'))
    save('teamflow-symbol-white.svg', symbol_svg(['#FFFFFF'] * 3, dot='#FFFFFF', title='Teamflow'))
    # Corte para tamaños chicos: arcos más gruesos, huecos y centro más grandes.
    save('teamflow-symbol-small.svg', symbol_svg([BLUE, SKY, GREEN], title='Teamflow', w=46, r=78, gap_deg=58, dot_r=26))
    print('ok')


def react_component(path):
    """Componente React del logo de Teamflow, con colores que se adaptan al modo claro u oscuro."""
    import re
    small = ring_paths([BLUE, SKY, GREEN], w=46, r=78, gap_deg=58, dot_r=26, dot_color='DOT')
    small = small.replace('fill="DOT"', 'className="fill-[#152C75] dark:fill-white"')
    wm, end = wordmark('Team', x0=0, prefix_color='PREFIX', flow_color='FLOW')
    wm = wm.replace('stroke="PREFIX"', 'className="stroke-[#152C75] dark:stroke-white"')
    wm = wm.replace('stroke="FLOW"', 'className="stroke-[#0066B3] dark:stroke-[#00A1E4]"')
    to_jsx = lambda s: (s.replace('stroke-width', 'strokeWidth').replace('stroke-linecap', 'strokeLinecap')
                         .replace('stroke-linejoin', 'strokeLinejoin'))
    W = int(end) + 4
    code = f'''// Generado por brand/flow/src/flow_brand.py — no editar a mano.
// Logo de Teamflow (línea Flow de herramientas Dimassi). El símbolo usa el corte para tamaños chicos.

export function TeamflowSymbol({{ className = 'h-7 w-7' }}: {{ className?: string }}) {{
  return (
    <svg viewBox="0 0 256 256" className={{className}} role="img" aria-label="Teamflow">
      {to_jsx(small)}
    </svg>
  )
}}

export function TeamflowLogo({{ className = 'h-7' }}: {{ className?: string }}) {{
  return (
    <span className={{`inline-flex items-center gap-2 ${{className}}`}}>
      <TeamflowSymbol className="h-full w-auto" />
      <svg viewBox="-6 30 {W + 6} 182" className="h-[62%] w-auto" role="img" aria-label="Teamflow">
        {to_jsx(wm)}
      </svg>
    </span>
  )
}}
'''
    open(path, 'w').write(code)


if __name__ == '__main__' and len(sys.argv) > 2 and sys.argv[2] == '--react':
    react_component(sys.argv[3])
