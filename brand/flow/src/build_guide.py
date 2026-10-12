"""Construye la guía de marca de la línea Flow (brand-kit.html) con los SVG reales del sistema."""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
import flow_brand as fb

HERE = os.path.dirname(os.path.dirname(__file__))

def inner(svg):
    return svg.split('>', 1)[1].rsplit('</svg>', 1)[0]

def lock(key, mono=None, endorse=False):
    return fb.lockup_horizontal(key, mono=mono, endorse=endorse)

sym = fb.symbol_svg([fb.BLUE, fb.SKY, fb.GREEN], title='Símbolo Teamflow')
sym_small = fb.symbol_svg([fb.BLUE, fb.SKY, fb.GREEN], title='Corte chico', w=46, r=78, gap_deg=58, dot_r=26)
sym_white = fb.symbol_svg(['#FFFFFF'] * 3, dot='#FFFFFF', title='Símbolo en blanco')
sym_black = fb.symbol_svg(['#000000'] * 3, dot='#000000', title='Símbolo en negro')

# Construcción: símbolo con guías
guides = ('<circle cx="128" cy="128" r="82" fill="none" stroke="#E11D48" stroke-width="1.2" stroke-dasharray="4 4"/>'
          '<circle cx="128" cy="128" r="99" fill="none" stroke="#94A3B8" stroke-width="1" stroke-dasharray="2 4"/>'
          '<circle cx="128" cy="128" r="65" fill="none" stroke="#94A3B8" stroke-width="1" stroke-dasharray="2 4"/>'
          + ''.join(f'<line x1="128" y1="128" x2="{128+120*__import__("math").cos(__import__("math").radians(a)):.1f}" '
                    f'y2="{128+120*__import__("math").sin(__import__("math").radians(a)):.1f}" stroke="#94A3B8" stroke-width="1" stroke-dasharray="2 4"/>'
                    for a in (35, 85, 155, 205, 275, 325)))
construction = sym.replace('</svg>', guides + '</svg>')

# Área de seguridad: x = diámetro del centro
clear = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -60 376 376" role="img" aria-label="Área de seguridad">'
         f'<rect x="-40" y="-40" width="336" height="336" fill="none" stroke="#E11D48" stroke-width="2" stroke-dasharray="6 5"/>'
         f'{inner(sym)}'
         f'<circle cx="-20" cy="128" r="20" fill="none" stroke="#E11D48" stroke-width="2"/>'
         f'<text x="-20" y="135" font-size="20" text-anchor="middle" fill="#E11D48" font-family="Manrope, sans-serif">x</text></svg>')

products = [('team', 'Teamflow', 'Gestión de tareas e iniciativas del equipo de marketing', 'En uso', fb.GREEN),
            ('doc', 'Docflow', 'Ejemplo de futura herramienta: documentos y aprobaciones', 'Ejemplo', fb.LIME),
            ('sales', 'Salesflow', 'Ejemplo de futura herramienta: seguimiento comercial', 'Ejemplo', fb.TEAL)]

palette = [('Azul Dimassi', fb.BLUE, 'Arco principal de todas las herramientas · línea "flow" · botones'),
           ('Celeste Dimassi', fb.SKY, 'Segundo arco de todas las herramientas · "flow" sobre fondo oscuro'),
           ('Marino Dimassi', fb.NAVY, 'Centro del anillo · nombre de la herramienta · títulos'),
           ('Verde Dimassi', fb.GREEN, 'Acento de Teamflow'),
           ('Turquesa Dimassi', fb.TEAL, 'Acento reservado (ej. Salesflow)'),
           ('Lima Dimassi', fb.LIME, 'Acento reservado (ej. Docflow)')]

def rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def cmyk(h):
    r, g, b = [v / 255 for v in rgb(h)]
    k = 1 - max(r, g, b)
    if k == 1: return (0, 0, 0, 100)
    return tuple(round(100 * x) for x in ((1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k))

swatches = ''.join(
    f'<div class="sw"><div class="chip" style="background:{h}"></div><div class="sw-b"><div class="sw-n">{n}</div>'
    f'<button class="hex" type="button" data-copy="{h}">{h}</button>'
    f'<div class="sw-m">RGB {", ".join(map(str, rgb(h)))} · CMYK aprox. {"/".join(map(str, cmyk(h)))}</div>'
    f'<div class="sw-r">{role}</div></div></div>' for n, h, role in palette)

family = ''.join(
    f'<article class="prod"><div class="tile light">{lock(k)}</div><div class="prod-b"><div class="prod-h">'
    f'<span class="prod-n">{name}</span><span class="tag {"live" if st == "En uso" else ""}">{st}</span></div>'
    f'<p>{desc}</p><div class="acc"><span class="dot" style="background:{acc}"></span>Acento {acc}</div></div></article>'
    for k, name, desc, st, acc in products)

misuse_base = inner(lock('team'))
W = lock('team').split('viewBox="0 0 ')[1].split(' ')[0]
def mis(transform='', style='', extra=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} 256" role="img" aria-label="Uso incorrecto">'
            f'<g transform="{transform}" style="{style}">{extra or misuse_base}</g></svg>')
wrong_colors = misuse_base.replace(fb.BLUE, '#E11D48').replace(fb.SKY, '#F59E0B').replace(fb.GREEN, '#7C3AED')
bold_flow = misuse_base.replace('stroke-width="11"', 'stroke-width="26"')
misuse = [
    (mis(transform=f'scale(1.35 0.75) translate(-60 40)'), 'No lo estires ni lo deformes.'),
    (mis(extra=wrong_colors), 'No cambies los colores fuera de la paleta.'),
    (mis(extra=bold_flow), '"flow" siempre va como línea fina, nunca en grueso.'),
    (mis(transform='rotate(-12 400 128)'), 'No lo rotes ni lo inclines.'),
]
misuse_html = ''.join(f'<figure class="mis"><div class="tile light">{s}</div><figcaption>✕ {c}</figcaption></figure>' for s, c in misuse)

html = open(os.path.join(HERE, 'src', 'guide_template.html')).read()
for k, v in {
    '{{LOCK_HERO}}': lock('team', endorse=True),
    '{{SYM}}': sym, '{{SYM_SMALL}}': sym_small, '{{SYM_WHITE}}': sym_white, '{{SYM_BLACK}}': sym_black,
    '{{CONSTRUCTION}}': construction, '{{CLEAR}}': clear,
    '{{LOCK_H}}': lock('team'), '{{LOCK_STACK}}': fb.lockup_stacked('team'),
    '{{LOCK_WHITE}}': lock('team', mono='#FFFFFF'), '{{LOCK_BLACK}}': lock('team', mono='#000000'),
    '{{LOCK_DARK}}': lock('team').replace(f'stroke="{fb.NAVY}"', 'stroke="#FFFFFF"').replace(f'stroke="{fb.BLUE}"', f'stroke="{fb.SKY}"').replace(f'fill="{fb.NAVY}"', 'fill="#FFFFFF"'),
    '{{SWATCHES}}': swatches, '{{FAMILY}}': family, '{{MISUSE}}': misuse_html,
}.items():
    html = html.replace(k, v)
open(os.path.join(HERE, 'brand-kit.html'), 'w').write(html)
print('brand-kit.html', len(html))
