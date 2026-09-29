#!/usr/bin/env python3
"""
InfraMind-SentinelX Setup Guide PDF generator.
Uses ReportLab to produce a clean, professional setup guide PDF.
"""

import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm, mm
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether, ListFlowable, ListItem, HRFlowable
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus.flowables import HRFlowable

# ---------- Palette (cascade, minimal mode) ----------
PAGE_BG       = colors.HexColor('#f3f3f2')
SECTION_BG    = colors.HexColor('#f2f2f1')
CARD_BG       = colors.HexColor('#eae9e6')
TABLE_STRIPE  = colors.HexColor('#f0f0ee')
HEADER_FILL   = colors.HexColor('#2c3142')   # dark navy for headers
COVER_BLOCK   = colors.HexColor('#1a1d2e')
BORDER        = colors.HexColor('#ccc8ba')
ICON          = colors.HexColor('#9c8950')
ACCENT        = colors.HexColor('#3b6ea5')    # blue accent
ACCENT_2      = colors.HexColor('#7051ce')
TEXT_PRIMARY  = colors.HexColor('#201f1d')
TEXT_MUTED    = colors.HexColor('#7d7a73')
SEM_SUCCESS   = colors.HexColor('#3d8254')
SEM_WARNING   = colors.HexColor('#a68b56')
SEM_ERROR     = colors.HexColor('#974c45')
SEM_INFO      = colors.HexColor('#426990')
CODE_BG       = colors.HexColor('#1e2128')
CODE_FG       = colors.HexColor('#e0e0e0')

# ---------- Font registration (use Noto Sans/Serif for broad coverage) ----------
try:
    pdfmetrics.registerFont(TTFont('NotoSans', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'))
    pdfmetrics.registerFont(TTFont('NotoSans-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'))
    pdfmetrics.registerFont(TTFont('NotoMono', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'))
    pdfmetrics.registerFont(TTFont('NotoMono-Bold', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf'))
    BASE_FONT = 'NotoSans'
    BOLD_FONT = 'NotoSans-Bold'
    MONO_FONT = 'NotoMono'
except Exception:
    BASE_FONT = 'Helvetica'
    BOLD_FONT = 'Helvetica-Bold'
    MONO_FONT = 'Courier'

# ---------- Styles ----------
styles = getSampleStyleSheet()

style_title = ParagraphStyle(
    'CoverTitle', parent=styles['Title'],
    fontName=BOLD_FONT, fontSize=28, leading=34,
    textColor=colors.white, alignment=TA_LEFT, spaceAfter=8
)
style_subtitle = ParagraphStyle(
    'CoverSubtitle', parent=styles['Normal'],
    fontName=BASE_FONT, fontSize=13, leading=18,
    textColor=colors.HexColor('#b8c2d4'), alignment=TA_LEFT
)
style_h1 = ParagraphStyle(
    'H1', parent=styles['Heading1'],
    fontName=BOLD_FONT, fontSize=18, leading=22,
    textColor=HEADER_FILL, spaceBefore=14, spaceAfter=10,
    borderPadding=0
)
style_h2 = ParagraphStyle(
    'H2', parent=styles['Heading2'],
    fontName=BOLD_FONT, fontSize=13, leading=17,
    textColor=ACCENT, spaceBefore=10, spaceAfter=6
)
style_body = ParagraphStyle(
    'Body', parent=styles['Normal'],
    fontName=BASE_FONT, fontSize=10.5, leading=15,
    textColor=TEXT_PRIMARY, alignment=TA_LEFT, spaceAfter=6
)
style_bullet = ParagraphStyle(
    'Bullet', parent=style_body, leftIndent=14, bulletIndent=0, spaceAfter=3
)
style_note = ParagraphStyle(
    'Note', parent=style_body,
    fontSize=10, leading=14, textColor=TEXT_MUTED,
    leftIndent=12, rightIndent=12,
    backColor=CARD_BG, borderPadding=6,
    borderColor=BORDER, borderWidth=0.5
)
style_code = ParagraphStyle(
    'Code', parent=styles['Code'],
    fontName=MONO_FONT, fontSize=9, leading=12,
    textColor=CODE_FG, backColor=CODE_BG,
    leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=8,
    borderPadding=6
)

# ---------- Helpers ----------
def code_block(text):
    """Render a multi-line code block with proper escaping."""
    # Escape XML special chars
    escaped = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    # Preserve line breaks
    escaped = escaped.replace('\n', '<br/>')
    # Preserve leading spaces
    lines = escaped.split('<br/>')
    processed = []
    for line in lines:
        # Count leading spaces and replace with &nbsp;
        stripped = line.lstrip(' ')
        n_spaces = len(line) - len(stripped)
        processed.append('&nbsp;' * n_spaces + stripped)
    return Paragraph('<br/>'.join(processed), style_code)

def bullet_list(items, style=None):
    s = style or style_bullet
    return ListFlowable(
        [ListItem(Paragraph(item, s), leftIndent=14, value='circle') for item in items],
        bulletType='bullet', bulletColor=ACCENT, bulletFontSize=8,
        leftIndent=14, bulletIndent=2, spaceAfter=6
    )

def numbered_list(items):
    return ListFlowable(
        [ListItem(Paragraph(item, style_body), leftIndent=18) for item in items],
        bulletType='1', bulletFontName=BOLD_FONT, bulletColor=ACCENT,
        leftIndent=18, bulletFontSize=10, spaceAfter=4
    )

def info_box(text, color=SEM_INFO, bg=CARD_BG):
    style = ParagraphStyle(
        'InfoBox', parent=style_body,
        fontSize=10, leading=14,
        textColor=color, backColor=bg,
        leftIndent=10, rightIndent=10, topPadding=6, bottomPadding=6,
        borderColor=color, borderWidth=0, borderPadding=8
    )
    return Paragraph(text, style)

def make_table(data, col_widths=None, header=True):
    """Create a styled table with header row."""
    if col_widths is None:
        col_widths = [None] * len(data[0])
    t = Table(data, colWidths=col_widths, repeatRows=1 if header else 0)
    style_cmds = [
        ('FONTNAME', (0, 0), (-1, -1), BASE_FONT),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('LEADING', (0, 0), (-1, -1), 12),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TEXTCOLOR', (0, 0), (-1, -1), TEXT_PRIMARY),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('GRID', (0, 0), (-1, -1), 0.4, BORDER),
        ('ROWBACKGROUNDS', (0, 1 if header else 0), (-1, -1), [colors.white, TABLE_STRIPE]),
    ]
    if header:
        style_cmds += [
            ('BACKGROUND', (0, 0), (-1, 0), HEADER_FILL),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), BOLD_FONT),
            ('FONTSIZE', (0, 0), (-1, 0), 9.5),
        ]
    t.setStyle(TableStyle(style_cmds))
    return t

# ---------- Page decorations ----------
def header_footer(canvas, doc):
    canvas.saveState()
    # Footer
    canvas.setFillColor(TEXT_MUTED)
    canvas.setFont(BASE_FONT, 8)
    canvas.drawString(2*cm, 1.2*cm, 'InfraMind-SentinelX Setup Guide')
    canvas.drawRightString(A4[0] - 2*cm, 1.2*cm, f'Page {doc.page}')
    # Top accent line
    canvas.setStrokeColor(ACCENT)
    canvas.setLineWidth(2)
    canvas.line(2*cm, A4[1] - 1.5*cm, A4[0] - 2*cm, A4[1] - 1.5*cm)
    canvas.restoreState()

def cover_page(canvas, doc):
    """Render the cover page background."""
    canvas.saveState()
    # Full-page dark background
    canvas.setFillColor(COVER_BLOCK)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    # Accent stripe (left vertical)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, 0, 0.6*cm, A4[1], fill=1, stroke=0)
    # Accent stripe (right thin)
    canvas.setFillColor(ACCENT_2)
    canvas.rect(A4[0] - 0.2*cm, 0, 0.2*cm, A4[1], fill=1, stroke=0)
    # Decorative top bar
    canvas.setFillColor(colors.HexColor('#3b6ea5'))
    canvas.rect(2*cm, A4[1] - 3.5*cm, 4*cm, 0.15*cm, fill=1, stroke=0)
    canvas.restoreState()

# ---------- Build content ----------
def build_story():
    story = []

    # ===== Cover page =====
    story.append(Spacer(1, 5*cm))
    story.append(Paragraph('InfraMind-SentinelX', style_title))
    story.append(Spacer(1, 0.3*cm))
    story.append(Paragraph('Complete Setup Guide', style_title))
    story.append(Spacer(1, 0.8*cm))
    story.append(Paragraph(
        'Production-Ready Autonomous SecOps + AIOps Platform<br/>'
        'Real-time Docker, Kubernetes, load injection, and<br/>'
        'SentinelX threat detection in one Next.js application.',
        style_subtitle
    ))
    story.append(Spacer(1, 4*cm))
    story.append(Paragraph(
        '<font color="#b8c2d4">Audience:</font> Developer / System Administrator<br/>'
        '<font color="#b8c2d4">Stack:</font> Next.js 16 + TypeScript + Prisma + SQLite<br/>'
        '<font color="#b8c2d4">Runtime:</font> Node.js 20+ or Bun',
        style_subtitle
    ))
    story.append(PageBreak())

    # ===== Table of contents =====
    story.append(Paragraph('Contents', style_h1))
    story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceAfter=10))
    toc_data = [
        ['Section', 'Page'],
        ['1. Prerequisites', '3'],
        ['2. Extract the .tar file', '4'],
        ['3. Open a terminal in the project folder', '4'],
        ['4. Create the .env file', '5'],
        ['5. Create the db/ directory', '5'],
        ['6. Install dependencies', '6'],
        ['7. Initialize the database', '6'],
        ['8. Start the dev server', '7'],
        ['9. Verify each subsystem is working', '7'],
        ['10. Trigger the orchestrator\'s first SRE cycle', '8'],
        ['11. Test the InfraMind load generator', '8'],
        ['12. Test SentinelX threat simulation', '9'],
        ['13. Optional: Enable Docker monitoring', '10'],
        ['14. Optional: Enable Kubernetes monitoring', '10'],
        ['15. Troubleshooting', '11'],
        ['16. Quick reference - all commands', '12'],
        ['17. Final verification checklist', '13'],
    ]
    story.append(make_table(toc_data, col_widths=[12*cm, 3*cm]))
    story.append(PageBreak())

    # ===== Section 1: Prerequisites =====
    story.append(Paragraph('1. Prerequisites', style_h1))
    story.append(Paragraph(
        'Before you begin, install the following tools on your computer. '
        'These are the foundational dependencies required to run the InfraMind-SentinelX platform. '
        'Each tool serves a specific purpose in the development and runtime stack, '
        'and missing any of them will cause setup failures later in the process.',
        style_body
    ))

    story.append(Paragraph('Required tools', style_h2))
    story.append(make_table([
        ['Tool', 'Why it\'s needed', 'Install source'],
        ['Node.js 20 LTS', 'Required to run Next.js and npm/bun packages', 'https://nodejs.org/ (pick LTS)'],
        ['Bun (optional but recommended)', 'Faster dev server, used in README scripts', 'PowerShell: irm bun.sh/install.ps1 | iex'],
        ['Git for Windows', 'Needed to extract .tar files and run shell scripts', 'https://git-scm.com/download/win'],
        ['VS Code (optional)', 'Code editor for browsing/editing source', 'https://code.visualstudio.com/'],
        ['Docker Desktop (optional)', 'Enables real Docker container monitoring', 'https://www.docker.com/products/docker-desktop/'],
    ], col_widths=[4.5*cm, 6.5*cm, 6*cm]))

    story.append(Spacer(1, 8))
    story.append(info_box(
        '<b>Docker Desktop note:</b> After installing Docker Desktop, open it and go to '
        'Settings &rarr; Resources &rarr; WSL Integration &rarr; enable your Ubuntu distro '
        '(or just "Enable integration with additional distros"). '
        'You can skip this entirely if you do not want Docker monitoring &mdash; the platform '
        'still works perfectly without it and will simply return "available: false" from the '
        'containers endpoint.',
        SEM_INFO
    ))

    story.append(Paragraph('Verify Node is installed', style_h2))
    story.append(Paragraph(
        'Open PowerShell or Command Prompt and run the following two commands. '
        'Both must return version numbers &mdash; if either fails, reinstall Node.js from the link above '
        'and restart your terminal before proceeding.',
        style_body
    ))
    story.append(code_block('node --version\n# should print v20.x.x\nnpm --version'))

    story.append(PageBreak())

    # ===== Section 2: Extract the .tar =====
    story.append(Paragraph('2. Extract the .tar file', style_h1))
    story.append(Paragraph(
        'The .tar file you downloaded contains the complete project source tree. '
        'You need to extract it to a location where you have read/write permissions. '
        'Avoid paths with spaces (like "Program Files") because some Node.js tools handle spaces poorly. '
        'A safe choice is your user home directory or Downloads folder.',
        style_body
    ))

    story.append(Paragraph('Option A: Using Git Bash (recommended on Windows)', style_h2))
    story.append(Paragraph(
        'Right-click the .tar file and choose "7-Zip &rarr; Extract here" '
        '(or use WinRAR). Alternatively, open Git Bash and run:',
        style_body
    ))
    story.append(code_block('cd ~/Downloads\ntar -xvf inframind-sentinelx-*.tar'))

    story.append(Paragraph('Option B: Using WSL (if you have it installed)', style_h2))
    story.append(code_block('cd /mnt/c/Users/$USER/Downloads\ntar -xvf inframind-sentinelx-*.tar'))

    story.append(Spacer(1, 6))
    story.append(info_box(
        'This will create a folder like <b>inframind-sentinelx/</b> with everything inside: '
        '<b>src/</b>, <b>prisma/</b>, <b>public/</b>, <b>scripts/</b>, <b>package.json</b>, '
        '<b>tsconfig.json</b>, <b>tailwind.config.ts</b>, and so on. '
        'Do not move individual files out of this folder &mdash; Next.js requires the project structure to stay intact.',
        SEM_INFO
    ))

    # ===== Section 3: Open terminal =====
    story.append(Paragraph('3. Open a terminal in the project folder', style_h1))
    story.append(Paragraph(
        'Open a terminal (PowerShell on Windows, Terminal on Mac/Linux) and navigate into the extracted folder. '
        'You must be in the project root &mdash; the folder that contains <b>package.json</b>. '
        'All subsequent commands in this guide assume you are running them from this location.',
        style_body
    ))
    story.append(Paragraph('On Windows (PowerShell or CMD):', style_body))
    story.append(code_block('cd C:\\Users\\YourName\\Downloads\\inframind-sentinelx'))
    story.append(Paragraph('On Mac / Linux / WSL / Git Bash:', style_body))
    story.append(code_block('cd ~/Downloads/inframind-sentinelx'))

    story.append(Paragraph('Verify you are in the right place:', style_body))
    story.append(code_block('ls package.json\n# should print: package.json'))
    story.append(PageBreak())

    # ===== Section 4: .env file =====
    story.append(Paragraph('4. Create the .env file', style_h1))
    story.append(Paragraph(
        'The project uses SQLite as its database (no separate database server needed). '
        'You only need to tell Prisma where to put the SQLite file. '
        'This is done via a single environment variable in a <b>.env</b> file '
        'that lives in the project root.',
        style_body
    ))

    story.append(Paragraph('On Mac / Linux / WSL / Git Bash:', style_body))
    story.append(code_block('cat > .env << \'EOF\'\nDATABASE_URL="file:./db/custom.db"\nEOF'))

    story.append(Paragraph('On Windows (PowerShell):', style_body))
    story.append(code_block('@\'\nDATABASE_URL="file:./db/custom.db"\n\'@ | Out-File -Encoding utf8 -FilePath .env'))

    story.append(Spacer(1, 6))
    story.append(info_box(
        '<b>Manual alternative:</b> Open a text editor (Notepad, VS Code), create a new file '
        'called literally <b>.env</b> (no name, just the extension), and paste '
        '<font face="NotoMono">DATABASE_URL="file:./db/custom.db"</font> as its only content. '
        'Save it in the project root.',
        SEM_INFO
    ))

    # ===== Section 5: db dir =====
    story.append(Paragraph('5. Create the db/ directory', style_h1))
    story.append(Paragraph(
        'The SQLite database file will live inside a <b>db/</b> subdirectory. '
        'You need to create this directory before initializing the database. '
        'Prisma will not create it automatically.',
        style_body
    ))
    story.append(code_block('mkdir -p db\n# Windows PowerShell: New-Item -ItemType Directory -Force -Path db'))

    # ===== Section 6: Install deps =====
    story.append(Paragraph('6. Install dependencies', style_h1))
    story.append(Paragraph(
        'The project depends on roughly 200 npm packages (Next.js, Prisma, Radix UI, '
        'Recharts, Lucide icons, and many more). Installing them downloads about 400 MB '
        'and takes 1 to 7 minutes depending on your network speed. '
        'Use Bun for faster installs if available.',
        style_body
    ))

    story.append(Paragraph('With Bun (faster &mdash; recommended):', style_body))
    story.append(code_block('bun install'))
    story.append(Paragraph('With npm (if you did not install Bun):', style_body))
    story.append(code_block('npm install'))

    story.append(PageBreak())

    # ===== Section 7: Init DB =====
    story.append(Paragraph('7. Initialize the database', style_h1))
    story.append(Paragraph(
        'The Prisma schema defines 50+ tables (Organizations, Users, AuditEvents, Metrics, '
        'Forecasts, Anomalies, SecurityEvents, Threats, Incidents, Containers, K8sResources, '
        'Backups, Policies, Agents, Knowledge chunks, and many more). '
        'You need to generate the Prisma client (TypeScript ORM) and push the schema '
        'to the SQLite file to create all these tables.',
        style_body
    ))

    story.append(Paragraph('Step 7a &mdash; Generate the Prisma client:', style_body))
    story.append(code_block('bunx prisma generate\n# OR: npx prisma generate'))

    story.append(Paragraph('Step 7b &mdash; Push schema to SQLite (creates tables):', style_body))
    story.append(code_block('bunx prisma db push --accept-data-loss\n# OR: npx prisma db push --accept-data-loss'))

    story.append(Paragraph('You should see output like:', style_body))
    story.append(code_block('Your database is now in sync with your Prisma schema.\nRun prisma generate to generate the client.'))

    story.append(Paragraph('Verify the database file was created:', style_body))
    story.append(code_block('ls db/custom.db\n# db/custom.db'))

    # ===== Section 8: Start dev server =====
    story.append(Paragraph('8. Start the dev server', style_h1))
    story.append(Paragraph(
        'With dependencies installed and the database initialized, you are ready to start the development server. '
        'The dev server runs Next.js in hot-reload mode, which means changes to source files '
        'are reflected in the browser within milliseconds.',
        style_body
    ))
    story.append(code_block('bun run dev\n# OR: npm run dev'))
    story.append(Paragraph('You should see:', style_body))
    story.append(code_block('Next.js 16.1.3 (Turbopack)\n- Local:        http://localhost:3000\nReady in 1200ms'))

    story.append(Spacer(1, 6))
    story.append(info_box(
        '<b>Open this URL in your browser:</b> http://localhost:3000<br/><br/>'
        'The dashboard will load with all 30 modules visible in the sidebar. '
        'The first page load may take a few seconds because Turbopack compiles '
        'each route on-demand. Subsequent loads are instant.',
        SEM_SUCCESS
    ))

    story.append(PageBreak())

    # ===== Section 9: Verify subsystems =====
    story.append(Paragraph('9. Verify each subsystem is working', style_h1))
    story.append(Paragraph(
        'Open these URLs in your browser (or curl them from another terminal) to confirm each piece of the platform is functioning. '
        'Each endpoint returns JSON, so you can read the response directly. '
        'If any endpoint returns an error, refer to the Troubleshooting section.',
        style_body
    ))

    story.append(make_table([
        ['URL', 'What you should see'],
        ['http://localhost:3000', 'The main dashboard with sidebar'],
        ['http://localhost:3000/api/v1/live', 'Real CPU/mem/disk/net JSON from /proc'],
        ['http://localhost:3000/api/v1/status', 'Platform status JSON'],
        ['http://localhost:3000/api/v1/overview', 'Bootstrap data with seed counts'],
        ['http://localhost:3000/api/v1/sentinelx/dashboard', 'SOC summary with event counts'],
        ['http://localhost:3000/api/v1/containers', 'Docker monitoring (may say available:false)'],
        ['http://localhost:3000/api/v1/k8s', 'K8s monitoring (may say available:false)'],
    ], col_widths=[8*cm, 9*cm]))

    # ===== Section 10: Trigger SRE =====
    story.append(Paragraph('10. Trigger the orchestrator\'s first SRE cycle', style_h1))
    story.append(Paragraph(
        'The orchestrator runs an end-to-end pipeline on every cycle: '
        'collect real telemetry from /proc, normalize events to OCSF format, '
        'run the threat engine and policy compiler, detect anomalies via four algorithms '
        '(Interquartile Range, DBSCAN, Z-Score, memory-leak slope), forecast the next 7 days '
        'using four forecasting models, generate threshold incidents, '
        'generate recommendations, and compute health + risk scores per host. '
        'Run one cycle manually to populate the dashboard with real data.',
        style_body
    ))

    story.append(code_block('# Trigger one cycle now\ncurl -X POST http://localhost:3000/api/v1/cron'))
    story.append(Paragraph('Or start auto-cycle (runs every 60 seconds):', style_body))
    story.append(code_block(
        'curl -X POST http://localhost:3000/api/v1/cron \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  -d \'{"action":"auto-start","intervalMs":60000}\''
    ))
    story.append(Paragraph('Stop auto-cycle:', style_body))
    story.append(code_block(
        'curl -X POST http://localhost:3000/api/v1/cron \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  -d \'{"action":"auto-stop"}\''
    ))

    story.append(PageBreak())

    # ===== Section 11: Load generator =====
    story.append(Paragraph('11. Test the InfraMind load generator', style_h1))
    story.append(Paragraph(
        'The InfraMind load generator spawns real worker processes on your host to generate CPU, '
        'memory, disk, and network load. This is the key feature for testing the anomaly + incident '
        'pipeline end-to-end. The user flow is: inject CPU load, watch the live monitor react, '
        'trigger a SRE cycle, and observe the resulting incident appear automatically.',
        style_body
    ))

    story.append(Paragraph('Step 11a &mdash; Start a CPU load (50% intensity, 2 minutes):', style_body))
    story.append(code_block(
        'curl -X POST http://localhost:3000/api/v1/load \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  -d \'{"type":"cpu","host":"localhost","intensity":0.5,"durationMin":2}\''
    ))
    story.append(Paragraph(
        'Then open http://localhost:3000/api/v1/live in your browser. '
        'CPU should jump from baseline to 60&ndash;100% within 3 seconds and stay elevated '
        'for the duration of the load.',
        style_body
    ))

    story.append(Paragraph('Step 11b &mdash; Other load types:', style_h2))
    story.append(make_table([
        ['Load type', 'Body JSON', 'Expected impact'],
        ['Memory', '{"type":"memory","host":"localhost","intensity":0.75,"durationMin":2}', '~384MB allocated and held for 2 min'],
        ['Disk I/O', '{"type":"disk","host":"localhost","intensity":0.8,"durationMin":2}', 'Continuous fsync writes for 2 min'],
        ['Network', '{"type":"network","host":"localhost","intensity":0.7,"durationMin":2}', 'Concurrent HTTP GETs for 2 min'],
    ], col_widths=[2.5*cm, 8.5*cm, 6*cm]))

    story.append(Spacer(1, 6))
    story.append(Paragraph('Step 11c &mdash; Trigger an SRE cycle after the load runs:', style_body))
    story.append(code_block('curl -X POST http://localhost:3000/api/v1/cron'))
    story.append(Paragraph(
        'A new incident should appear at http://localhost:3000/api/v1/incidents with severity '
        'warning (60% CPU) or critical (85% CPU). The thresholds are: '
        'CPU 60/85, Memory 60/85, Disk 70/90, Disk IO 50/100 MB/s, Network 100/500 Mbps, '
        'Load avg 2/4 per core.',
        style_body
    ))

    # ===== Section 12: SentinelX =====
    story.append(Paragraph('12. Test SentinelX threat simulation', style_h1))
    story.append(Paragraph(
        'The SentinelX simulator injects real observable threat events on your host so the threat engine '
        'and policy compiler pipeline can be exercised without needing actual malware. '
        'Each simulation spawns a real process, creates a real file, or logs a real network event &mdash; '
        'then immediately persists a SecurityEvent record and runs the threat engine + policy compiler '
        'to classify it and recommend a response action.',
        style_body
    ))

    story.append(Paragraph('Step 12a &mdash; Run a ransomware recon simulation:', style_body))
    story.append(code_block(
        'curl -X POST http://localhost:3000/api/v1/sentinelx/simulate \\\n'
        '  -H "Content-Type: application/json" \\\n'
        '  -d \'{"type":"ransomware_recon"}\''
    ))
    story.append(Paragraph('You should see a response with:', style_body))
    story.append(code_block(
        '{\n'
        '  "ok": true,\n'
        '  "type": "ransomware_recon",\n'
        '  "triggeredEvent": {\n'
        '    "threatScore": 90,\n'
        '    "classification": "ransomware",\n'
        '    "policyMatch": true,\n'
        '    "policyAction": "create_incident",\n'
        '    "mitreAttackId": "T1490"\n'
        '  }\n'
        '}'
    ))

    story.append(Paragraph('Step 12b &mdash; Other simulations available:', style_h2))
    story.append(make_table([
        ['Simulation type', 'MITRE ATT&CK', 'Description'],
        ['ransomware_recon', 'T1490', 'Spawn vssadmin-like process (delete shadows)'],
        ['encoded_powershell', 'T1059.001', 'Spawn PowerShell with -EncodedCommand flag'],
        ['ransomware_extension', 'T1486', 'Create a .encrypted file in /tmp'],
        ['suspicious_registry', 'T1547', 'Modify a tracked bashrc/persistence file'],
        ['c2_beacon', 'T1071', 'Log suspicious outbound connection to port 4444'],
        ['malicious_download', 'T1486', 'Create a .locky file in /tmp'],
        ['high_cpu_process', 'T1497', 'Spawn CPU-burning process (auto-kill 30s)'],
        ['usb_insert', 'T1091', 'Simulate USB device mount event'],
    ], col_widths=[4.5*cm, 2.5*cm, 10*cm]))

    story.append(Paragraph('Step 12c &mdash; View all incidents:', style_body))
    story.append(code_block('curl http://localhost:3000/api/v1/sentinelx/incidents'))

    story.append(PageBreak())

    # ===== Section 13: Docker =====
    story.append(Paragraph('13. Optional: Enable Docker monitoring', style_h1))
    story.append(Paragraph(
        'If you installed Docker Desktop, you can enable real-time container monitoring. '
        'Without Docker installed, the /api/v1/containers endpoint simply returns '
        '"available: false" with a reason field explaining what is needed &mdash; '
        'the rest of the platform works fine without Docker.',
        style_body
    ))

    story.append(numbered_list([
        'Open Docker Desktop and ensure it says "Running" in the bottom-left corner.',
        'Verify in your terminal: <font face="NotoMono">docker ps</font> should print a header row.',
        'Run a demo container so the dashboard has something to show: '
        '<font face="NotoMono">docker run -d --name inframind-demo --restart unless-stopped '
        'alpine:latest sh -c "while true; do sleep 60; done"</font>',
        'Refresh http://localhost:3000/api/v1/containers &mdash; now shows your container with live CPU/mem stats.',
    ]))

    # ===== Section 14: K8s =====
    story.append(Paragraph('14. Optional: Enable Kubernetes monitoring (advanced)', style_h1))
    story.append(Paragraph(
        'Kubernetes monitoring requires installing kubectl and minikube. '
        'On Windows, the easiest path is via WSL2 (Ubuntu). '
        'Skip this step if you do not need K8s monitoring &mdash; the platform works fine without it.',
        style_body
    ))

    story.append(numbered_list([
        'Open WSL Ubuntu (install from Microsoft Store if missing).',
        'Run the included setup script: <font face="NotoMono">cd /mnt/c/Users/YourName/Downloads/inframind-sentinelx</font>',
        '<font face="NotoMono">chmod +x scripts/wsl-setup.sh</font>',
        '<font face="NotoMono">./scripts/wsl-setup.sh k8s</font> &mdash; installs kubectl, minikube, metrics-server, and a demo nginx deployment.',
        'After about 5 minutes, refresh http://localhost:3000/api/v1/k8s &mdash; now shows real pods, deployments, and nodes with live CPU/mem.',
    ]))

    # ===== Section 15: Troubleshooting =====
    story.append(Paragraph('15. Troubleshooting', style_h1))
    story.append(Paragraph(
        'This section covers the most common errors you may encounter during setup. '
        'Each entry lists the error message, the root cause, and the exact fix. '
        'If you encounter an error not listed here, copy the full error output '
        'and check the worklog.md file or the project README for additional context.',
        style_body
    ))

    story.append(Paragraph('bun: command not found', style_h2))
    story.append(Paragraph('You do not have Bun installed. Use npx and npm instead:', style_body))
    story.append(code_block('npx prisma generate\nnpx prisma db push --accept-data-loss\nnpm run dev'))

    story.append(Paragraph('Error: ENOENT: no such file or directory, ./db/custom.db', style_h2))
    story.append(Paragraph('The db/ folder does not exist. Create it and retry:', style_body))
    story.append(code_block('mkdir db       # Mac / Linux / Git Bash\nNew-Item -ItemType Directory db    # Windows PowerShell'))

    story.append(Paragraph('Port 3000 already in use', style_h2))
    story.append(Paragraph('Find what is using it and kill it, or run on a different port:', style_body))
    story.append(code_block(
        '# Windows PowerShell\n'
        'Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force\n\n'
        '# Mac / Linux\n'
        'lsof -i :3000\nkill -9 <PID>\n\n'
        '# Or run on a different port\n'
        'PORT=3001 bun run dev'
    ))

    story.append(Paragraph('Prisma errors (PrismaClientInitializationError)', style_h2))
    story.append(Paragraph('Regenerate the client and re-push the schema:', style_body))
    story.append(code_block('rm -rf node_modules/.prisma\nbunx prisma generate\nbunx prisma db push --accept-data-loss'))

    story.append(Paragraph('Docker monitoring returns available: false', style_h2))
    story.append(Paragraph(
        'This is <b>expected</b> if you did not install Docker. The endpoint still works &mdash; '
        'it returns a graceful fallback with a reason field explaining what is needed. '
        'The rest of the platform works fine without Docker.',
        style_body
    ))

    story.append(Paragraph('Kubernetes monitoring returns available: false', style_h2))
    story.append(Paragraph(
        'Same as Docker &mdash; expected if no kubectl is installed. '
        'Skip if you do not need K8s monitoring.',
        style_body
    ))

    story.append(Paragraph('Dashboard loads but Live Monitor is empty', style_h2))
    story.append(Paragraph('The orchestrator has not run yet. Trigger one cycle:', style_body))
    story.append(code_block('curl -X POST http://localhost:3000/api/v1/cron'))

    story.append(Paragraph('Cannot find module @/lib/...', style_h2))
    story.append(Paragraph(
        'You are running from the wrong folder. Make sure you are in the project root '
        '(where package.json lives):',
        style_body
    ))
    story.append(code_block('pwd\n# /Users/yourname/Downloads/inframind-sentinelx\nls package.json'))

    story.append(PageBreak())

    # ===== Section 16: Quick reference =====
    story.append(Paragraph('16. Quick reference - all commands', style_h1))
    story.append(Paragraph(
        'A one-page summary of every command you will need during setup and ongoing use. '
        'Copy-paste friendly.',
        style_body
    ))
    story.append(make_table([
        ['Task', 'Command'],
        ['Install dependencies', 'bun install   (or: npm install)'],
        ['Generate Prisma client', 'bunx prisma generate   (or: npx prisma generate)'],
        ['Create SQLite database', 'bunx prisma db push --accept-data-loss'],
        ['Start dev server', 'bun run dev   (or: npm run dev)'],
        ['Build for production', 'bun run build'],
        ['Start production server', 'bun run start'],
        ['Lint the codebase', 'bun run lint'],
        ['Trigger one SRE cycle', 'curl -X POST http://localhost:3000/api/v1/cron'],
        ['Start auto-cycle (60s)', 'curl -X POST http://localhost:3000/api/v1/cron -H "Content-Type: application/json" -d \'{"action":"auto-start","intervalMs":60000}\''],
        ['Stop auto-cycle', 'curl -X POST http://localhost:3000/api/v1/cron -H "Content-Type: application/json" -d \'{"action":"auto-stop"}\''],
        ['Inject CPU load', 'curl -X POST http://localhost:3000/api/v1/load -H "Content-Type: application/json" -d \'{"type":"cpu","host":"localhost","intensity":0.5,"durationMin":2}\''],
        ['List active loads', 'curl http://localhost:3000/api/v1/load'],
        ['Run ransomware sim', 'curl -X POST http://localhost:3000/api/v1/sentinelx/simulate -H "Content-Type: application/json" -d \'{"type":"ransomware_recon"}\''],
        ['List SentinelX incidents', 'curl http://localhost:3000/api/v1/sentinelx/incidents'],
        ['Compile a custom policy', 'curl -X POST http://localhost:3000/api/v1/sentinelx/compiler/compile -H "Content-Type: application/json" -d \'{"policy_text":"POLICY Test { IF process.name == \\"cmd.exe\\" THEN ACTION block_process }"}\''],
        ['Create encrypted backup', 'curl -X POST http://localhost:3000/api/v1/sentinelx/backup -H "Content-Type: application/json" -d \'{"sourcePath":"/tmp","triggeredBy":"manual"}\''],
    ], col_widths=[4.5*cm, 12.5*cm]))

    # ===== Section 17: Verification =====
    story.append(Paragraph('17. Final verification checklist', style_h1))
    story.append(Paragraph(
        'Run through this checklist to confirm everything works end-to-end. '
        'Each item is a concrete verification you can perform in your terminal or browser. '
        'If all items pass, your setup is complete and production-ready.',
        style_body
    ))

    checklist_items = [
        'node --version prints v20+',
        'bun --version prints v1+ (if installed)',
        '.env file exists with DATABASE_URL="file:./db/custom.db"',
        'db/custom.db file exists after running prisma db push',
        'bun run dev starts the server at http://localhost:3000',
        'Browser opens the dashboard at http://localhost:3000',
        'http://localhost:3000/api/v1/live returns JSON with real CPU/memory values',
        'curl -X POST http://localhost:3000/api/v1/cron returns {ok: true, result: {...}}',
        'curl -X POST http://localhost:3000/api/v1/load with a CPU load makes CPU jump in /api/v1/live',
        'curl -X POST http://localhost:3000/api/v1/sentinelx/simulate with ransomware_recon returns threatScore: 90',
        '(Optional, if Docker installed) http://localhost:3000/api/v1/containers shows your containers',
        '(Optional, if WSL+minikube) http://localhost:3000/api/v1/k8s shows pods',
    ]
    for item in checklist_items:
        story.append(Paragraph('&#9744;&nbsp;&nbsp;' + item, style_bullet))

    story.append(Spacer(1, 12))
    story.append(HRFlowable(width='100%', thickness=1, color=BORDER, spaceAfter=8))
    story.append(Paragraph(
        '<b>Need help?</b> Refer to <b>docs/WSL-SETUP.md</b> for WSL-specific instructions, '
        '<b>scripts/wsl-setup.sh</b> for an automated installer, '
        'and <b>worklog.md</b> for a complete log of all changes made to the project.',
        style_body
    ))

    return story


def main():
    output_path = '/home/z/my-project/download/InfraMind-SentinelX-Setup-Guide.pdf'
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        leftMargin=2*cm, rightMargin=2*cm,
        topMargin=2*cm, bottomMargin=2*cm,
        title='InfraMind-SentinelX Setup Guide',
        author='Z.ai',
        subject='Complete setup instructions for the InfraMind-SentinelX Next.js platform',
        creator='Z.ai PDF Skill',
    )

    story = build_story()

    # First page = cover (no header/footer), rest = with header/footer
    doc.build(story, onFirstPage=cover_page, onLaterPages=header_footer)

    size_kb = os.path.getsize(output_path) / 1024
    print(f'Generated: {output_path}')
    print(f'Size: {size_kb:.1f} KB')


if __name__ == '__main__':
    main()
