// RAG Engine — TF-IDF vectorized retrieval + knowledge base
import { db } from '@/lib/db';

// Stop words — common English words that don't carry semantic meaning.
// Filtered out before vectorization to improve signal-to-noise ratio.
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'any', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use',
  'a', 'an', 'in', 'on', 'at', 'to', 'of', 'is', 'it', 'as', 'be', 'by', 'or', 'we', 'if', 'so', 'no', 'do', 'go', 'me', 'my', 'up', 'he', 'us',
  'this', 'that', 'with', 'from', 'they', 'will', 'would', 'there', 'their', 'what', 'about', 'which', 'when', 'your', 'have', 'more', 'been',
  'into', 'than', 'them', 'these', 'those', 'only', 'also', 'may', 'might', 'must', 'should', 'could', 'would',
  'after', 'before', 'during', 'while', 'since', 'until', 'because', 'although', 'unless', 'whereas',
  'some', 'many', 'most', 'other', 'such', 'very', 'much', 'well', 'even', 'still', 'just',
  // Domain stop words (security docs)
  'via', 'etc', 'eg', 'ie',
]);

// Simple Porter-like stemmer — reduces inflected words to their stem.
// E.g. "encrypted" → "encrypt", "processes" → "process", "running" → "run".
function stem(word: string): string {
  if (word.length <= 3) return word;
  // plurals
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  // -ing
  if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
  // -ed
  if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
  // -tion → -t
  if (word.endsWith('tion')) return word.slice(0, -4) + 't';
  return word;
}

export class TfidfVectorizer {
  private vocabulary: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private dim = 1024; // 4x larger than before — captures more vocabulary
  fit(docs: string[]) {
    const df: Map<string, number> = new Map();
    for (const doc of docs) { const terms = new Set(this.tokenize(doc)); for (const t of terms) df.set(t, (df.get(t) || 0) + 1); }
    // Sort by document frequency (rare terms carry more signal) but drop terms that appear in only 1 doc (too rare) or in >80% of docs (too common)
    const totalDocs = docs.length || 1;
    [...df.entries()]
      .filter(([_, freq]) => freq >= 1 && freq / totalDocs < 0.8)
      .sort((a, b) => {
        // Prefer terms in 2-10 docs (specific but not rare)
        const aScore = a[1] >= 2 ? a[1] : 0.5;
        const bScore = b[1] >= 2 ? b[1] : 0.5;
        return bScore - aScore;
      })
      .slice(0, this.dim)
      .forEach(([term], idx) => {
        this.vocabulary.set(term, idx);
        this.idf.set(term, Math.log(totalDocs / (df.get(term) || 1)));
      });
  }
  vectorize(text: string): number[] {
    const vec = new Array(this.dim).fill(0);
    const tokens = this.tokenize(text);
    if (tokens.length === 0) return vec;
    const tf: Map<string, number> = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const [token, count] of tf) {
      const idx = this.vocabulary.get(token);
      if (idx !== undefined) { const idf = this.idf.get(token) || 0; vec[idx] = (count / tokens.length) * idf; }
    }
    const norm = Math.sqrt(vec.reduce((a, v) => a + v * v, 0));
    if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] /= norm;
    return vec;
  }
  tokenize(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .filter((t) => !STOP_WORDS.has(t))
      .map(stem);
  }
}

// Get the vocabulary (for debugging / inspection)
export function getVocabulary(vectorizer: TfidfVectorizer | null): { size: number; terms: string[] } {
  if (!vectorizer) return { size: 0, terms: [] };
  return {
    size: (vectorizer as any).vocabulary.size,
    terms: [...(vectorizer as any).vocabulary.keys()].slice(0, 100),
  };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return na === 0 || nb === 0 ? 0 : dot / (na * nb);
}

export function chunkDocument(text: string, chunkSize = 400, overlap = 80): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 50) chunks.push(chunk);
    if (i + chunkSize >= words.length) break;
  }
  return chunks;
}

let vectorizer: TfidfVectorizer | null = null;
let isBuilding = false;

export async function buildVectorIndex(): Promise<{ documents: number; chunks: number }> {
  if (isBuilding) return { documents: 0, chunks: 0 };
  isBuilding = true;
  try {
    const docs = await db.knowledgeDocument.findMany({ include: { chunks: true } });
    if (docs.length === 0) { vectorizer = null; return { documents: 0, chunks: 0 }; }
    const v = new TfidfVectorizer();
    const allTexts: string[] = [];
    for (const doc of docs) for (const chunk of doc.chunks) allTexts.push(chunk.content);
    v.fit(allTexts);
    for (const doc of docs) {
      for (const chunk of doc.chunks) {
        const vec = v.vectorize(chunk.content);
        await db.knowledgeChunk.update({ where: { id: chunk.id }, data: { vector: JSON.stringify(vec) } });
      }
      if (!doc.embedded) await db.knowledgeDocument.update({ where: { id: doc.id }, data: { embedded: true } });
    }
    vectorizer = v;
    return { documents: docs.length, chunks: allTexts.length };
  } finally { isBuilding = false; }
}

export async function retrieve(query: string, topK = 5, sources?: string[], rerank = true): Promise<any[]> {
  if (!vectorizer) await buildVectorIndex();
  if (!vectorizer) return [];

  // Expand the query with related security terms (ransomware → vssadmin, T1486, etc.)
  // This catches docs that don't contain the literal query word but discuss the same topic.
  const { expandQuery, scoreSemanticRelevance, combineScores } = await import('./semantic-search');
  const expandedTerms = await expandQuery(query);
  const expandedQuery = [...new Set([query.toLowerCase(), ...expandedTerms])].join(' ');

  // Vectorize with the expanded query
  const queryVec = vectorizer.vectorize(expandedQuery);
  const chunks = await db.knowledgeChunk.findMany({
    include: { document: true },
    where: sources && sources.length > 0 ? { document: { source: { in: sources } } } : undefined,
  });

  // Stage 1: TF-IDF cosine similarity (fast, broad recall)
  let scored = chunks.map((c) => {
    let vec: number[] = [];
    try { vec = JSON.parse(c.vector || '[]'); } catch {}
    return {
      chunkId: c.id,
      documentId: c.documentId,
      title: c.document.title,
      source: c.document.source,
      content: c.content,
      score: cosineSimilarity(queryVec, vec),
      tfidfScore: cosineSimilarity(queryVec, vec),
      semanticScore: 0,
    };
  })
  .filter((r) => r.score > 0.02)  // lower threshold to catch more candidates
  .sort((a, b) => b.score - a.score)
  .slice(0, rerank ? Math.max(topK * 5, 15) : topK);  // take more candidates for reranking

  // Stage 2: Term overlap rerank (deterministic, no LLM call)
  if (rerank && scored.length > 0) {
    const queryTerms = new Set(expandedTerms);
    for (const r of scored) {
      const contentTerms = r.content.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
      const overlap = contentTerms.filter((t) => queryTerms.has(t)).length;
      r.score = 0.6 * r.tfidfScore + 0.4 * (overlap / Math.max(1, queryTerms.size));
    }
    scored.sort((a, b) => b.score - a.score);
  }

  // Stage 3: Semantic rerank via LLM (top 5 only, to limit API calls)
  // This is the key improvement — the LLM actually understands that
  // "ransomware" is semantically related to "encryption" even if they
  // don't share any terms.
  if (rerank && scored.length > 0) {
    const topForSemantic = scored.slice(0, Math.min(5, scored.length));
    const semanticScores = await Promise.all(
      topForSemantic.map(async (r) => ({
        chunkId: r.chunkId,
        semanticScore: await scoreSemanticRelevance(query, r.content, r.title),
      }))
    );
    for (const r of scored) {
      const match = semanticScores.find((s) => s.chunkId === r.chunkId);
      if (match) {
        r.semanticScore = match.semanticScore;
        r.score = combineScores(r.tfidfScore, r.semanticScore, 0.3); // 30% TF-IDF, 70% semantic
      }
    }
    scored.sort((a, b) => b.score - a.score);
  }

  await db.retrievalLog.create({
    data: {
      query,
      resultsCount: scored.length,
      topScore: scored[0]?.score || 0,
      retrievedChunks: JSON.stringify(scored.slice(0, topK).map((s) => s.chunkId)),
      reranked: rerank,
    },
  });

  return scored.slice(0, topK).map(({ chunkId, documentId, title, source, content, score, tfidfScore, semanticScore }) => ({
    chunkId, documentId, title, source, content, score,
    tfidfScore, semanticScore,
    expandedTerms: expandedTerms.slice(0, 10),
  }));
}

export async function ingestDocument(source: string, title: string, content: string, url?: string, category?: string, tags?: string[]): Promise<{ documentId: string; chunkCount: number }> {
  const doc = await db.knowledgeDocument.create({ data: { source, title, content, url, category, tags: JSON.stringify(tags || []) } });
  const chunks = chunkDocument(content, 400, 80);
  for (let i = 0; i < chunks.length; i++) await db.knowledgeChunk.create({ data: { documentId: doc.id, content: chunks[i], chunkIndex: i, tokenCount: chunks[i].split(/\s+/).length } });
  await db.knowledgeDocument.update({ where: { id: doc.id }, data: { chunkCount: chunks.length } });
  vectorizer = null;
  return { documentId: doc.id, chunkCount: chunks.length };
}

export async function seedKnowledgeBase(): Promise<{ ingested: number }> {
  const existing = await db.knowledgeDocument.count();
  if (existing > 0) return { ingested: 0 };
  const docs = [
    { source: 'mitre_attack', title: 'T1486 - Data Encrypted for Impact', content: 'Adversaries may encrypt data on target systems or on large numbers of systems in a network to interrupt availability to system and network resources. They may attempt to render stored data inaccessible by encrypting files or data on local and remote drives, withholding access to an encryption key needed to decrypt stored data. This behavior is a hallmark of ransomware operations, where financial demands are paired with the encryption of victim data. Common ransomware families include LockBit, Conti, BlackCat (ALPHV), REvil, Ryuk, Maze, and Petya.' },
    { source: 'mitre_attack', title: 'T1490 - Inhibit System Recovery', content: 'Adversaries may delete or remove built-in OS data and delete or remove critical system files, backups, or shadow copies to inhibit system recovery. Common techniques include: vssadmin delete shadows, wbadmin delete catalog, bcdedit /set {default} recoveryenabled no, and cipher /w:. These commands are often chained together by ransomware to maximize impact by ensuring the victim cannot restore from local backups or system restore points.' },
    { source: 'mitre_attack', title: 'T1547.001 - Registry Run Keys', content: 'Adding an entry to the Run Keys in the Windows Registry will cause the program referenced to be executed when a user logs in. The HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run and HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run keys are commonly abused by malware for persistence.' },
    { source: 'ransomware', title: 'Ransomware Response Playbook', content: 'When ransomware activity is detected: (1) ISOLATE the affected host(s) from the network. (2) PRESERVE evidence — capture memory dumps, running processes, network connections. (3) IDENTIFY the ransomware family. (4) CONTAIN by blocking known C2 IPs. (5) ERADICATE the malware. (6) RECOVER from known-good backups — verify backup integrity (SHA-256) before restore. (7) REPORT to incident response team and law enforcement.' },
    { source: 'incident_response', title: 'NIST SP 800-61 Incident Response Lifecycle', content: 'Four phases: (1) PREPARATION — establish IR team, policies, tooling. (2) DETECTION & ANALYSIS — monitor alerts, analyze anomalies, prioritize incidents. (3) CONTAINMENT, ERADICATION & RECOVERY — short-term containment, eradication, recovery. (4) POST-INCIDENT ACTIVITY — lessons learned, update runbooks.' },
    { source: 'recovery_procedures', title: 'Backup Integrity Verification', content: 'Before restoring from backup: (1) Locate backup record + integrity_hash. (2) Recompute SHA-256 of on-disk file. (3) Compare — if mismatch, backup tampered. (4) Decrypt with AES-256-GCM. (5) Verify file count. (6) Scan with antivirus. (7) Restore to isolated environment first. (8) Document recovery chain.' },
    { source: 'windows_security', title: 'Suspicious Process Monitoring', content: 'Monitor for: vssadmin.exe (delete shadows), wbadmin.exe (delete catalog), bcdedit.exe (recoveryenabled no), cipher.exe (/w), powershell.exe (-EncodedCommand), cmd.exe (reg add, schtasks), wmic.exe, mshta.exe, rundll32.exe, regsvr32.exe, schtasks.exe.' },
    { source: 'linux_security', title: 'Linux Endpoint Hardening', content: 'Critical measures: disable unused services, enforce SSH key-only auth, install auditd, use AppArmor/SELinux, configure logrotate, enable kernel security modules (dmesg_restrict, kptr_restrict), install AIDE for file integrity monitoring.' },
    { source: 'docker_security', title: 'Docker Container Security', content: 'Use minimal base images, run as non-root, enable read-only root filesystem, drop ALL capabilities, use seccomp profiles, limit resources, disable inter-container communication, scan images with Trivy, never mount Docker socket.' },
    { source: 'kubernetes_security', title: 'Kubernetes Cluster Hardening', content: 'Enable RBAC, use NetworkPolicies (default deny), Pod Security Standards (restricted), etcd with TLS, rotate certificates, audit API server logs, scan images, use Secrets not ConfigMaps, restrict kubelet API, use OPA Gatekeeper.' },
    { source: 'runbooks', title: 'High CPU Usage Investigation Runbook', content: 'When CPU > 85%: (1) Identify top consumers: ps aux --sort=-%cpu | head. (2) Check if expected traffic. (3) Check for runaway processes. (4) Look for memory pressure causing swap thrashing. (5) Verify no cryptominer activity. (6) Scale out or rate-limit. (7) Document and escalate if > 15 min.' },
    { source: 'runbooks', title: 'Memory Leak Investigation Runbook', content: 'When memory leak detected (slope > 5 MB/hour, R² > 0.6): (1) Identify leaking process via RSS. (2) Capture heap dump. (3) Check for unclosed resources. (4) Restart service as mitigation. (5) Long-term fix: profile, identify, patch. (6) Add monitoring alert on memory slope.' },
  ];
  for (const d of docs) await ingestDocument(d.source, d.title, d.content);
  await buildVectorIndex();
  return { ingested: docs.length };
}