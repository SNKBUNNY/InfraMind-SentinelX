import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reportId = searchParams.get('id');
  const format = (searchParams.get('format') || 'md').toLowerCase();
  if (!reportId) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const report = await db.report.findUnique({ where: { id: reportId } });
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  let data: any = {}; try { data = JSON.parse(report.content); } catch {}
  let content = '';
  let mimeType = 'text/plain';
  let ext = format;
  if (format === 'md') { content = generateMarkdown(report, data); mimeType = 'text/markdown'; }
  else if (format === 'json') { content = JSON.stringify(data, null, 2); mimeType = 'application/json'; }
  else if (format === 'csv') { content = generateCSV(report, data); mimeType = 'text/csv'; }
  else if (format === 'html') { content = generateHTML(report, data); mimeType = 'text/html'; }
  else if (format === 'xlsx') { content = generateHTML(report, data); mimeType = 'application/vnd.ms-excel'; ext = 'xls'; }
  else if (format === 'pdf') { content = `# ${report.title}\nType: ${report.type}\nGenerated: ${report.createdAt}\nSummary: ${report.summary}`; mimeType = 'application/pdf'; }
  else if (format === 'docx') { content = generateHTML(report, data); mimeType = 'application/msword'; ext = 'doc'; }
  else return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
  const buffer = Buffer.from(content, 'utf8');
  return new NextResponse(buffer, { status: 200, headers: { 'Content-Type': mimeType, 'Content-Disposition': `attachment; filename="${report.type}_${report.id.substring(0, 8)}.${ext}"`, 'Content-Length': String(buffer.length) } });
}

function generateMarkdown(report: any, data: any): string {
  const lines: string[] = [];
  lines.push(`# ${report.title}`); lines.push('');
  lines.push(`**Type**: ${report.type}  `); lines.push(`**Generated**: ${new Date(report.createdAt).toLocaleString()}  `); lines.push(`**Summary**: ${report.summary || ''}  `); lines.push('---'); lines.push('');
  if (report.type === 'security' && data.threats) {
    lines.push('## Active Threats'); lines.push('');
    data.threats.forEach((t: any, i: number) => { lines.push(`### ${i + 1}. ${t.threatType} [${t.severity}]`); lines.push(`- MITRE: ${t.mitreAttackId || 'N/A'}`); lines.push(`- Confidence: ${(t.confidence * 100).toFixed(0)}%`); lines.push(`- ${t.description}`); lines.push(''); });
  }
  return lines.join('\n');
}

function generateCSV(report: any, data: any): string {
  if (data.events?.length) { const rows = ['Timestamp,Type,Classification,Score,Host']; data.events.forEach((e: any) => rows.push(`${e.timestamp || ''},${e.eventType},${e.classification},${e.threatScore},${e.host || ''}`)); return rows.join('\n'); }
  return 'Field,Value\n' + `Report Type,${report.type}\nGenerated,${report.createdAt}\nSummary,${report.summary || ''}`;
}

function generateHTML(report: any, data: any): string {
  const sections: string[] = [];
  sections.push(`<h1>${report.title}</h1><p><strong>Type:</strong> ${report.type} | <strong>Generated:</strong> ${new Date(report.createdAt).toLocaleString()}</p><p>${report.summary || ''}</p>`);
  if (data.threats?.length) { sections.push('<h2>Active Threats</h2><table border="1" cellpadding="5"><tr><th>Type</th><th>Severity</th><th>MITRE</th><th>Confidence</th><th>Description</th></tr>'); data.threats.forEach((t: any) => sections.push(`<tr><td>${t.threatType}</td><td>${t.severity}</td><td>${t.mitreAttackId || ''}</td><td>${(t.confidence * 100).toFixed(0)}%</td><td>${t.description}</td></tr>`)); sections.push('</table>'); }
  return `<html><head><meta charset="utf-8"><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse}th,td{padding:5px 10px}</style></head><body>${sections.join('\n')}</body></html>`;
}