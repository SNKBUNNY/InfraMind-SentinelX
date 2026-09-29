// Policy Compiler — .psec DSL: lexical → syntax → AST → semantic → optimizer → runtime
export interface Token { type: string; value: any; line: number; column: number; }
export interface ASTNode { type: string; [key: string]: any; }
export interface SemanticResult { valid: boolean; errors: string[]; warnings: string[]; passed: boolean; }
export interface CompileResult { status: 'success' | 'error'; tokens: Token[]; ast: ASTNode | null; semantic: SemanticResult; bytecode: any[]; errors?: string[]; }

const TOKEN_SPEC: [string, RegExp][] = [
  ['NUMBER', /\d+(?:\.\d+)?/], ['STRING', /"([^"\\]|\\.)*"/],
  ['GE', />=/], ['LE', /<=/], ['NE', /!=/], ['EQ', /==/],
  ['GT', />/], ['LT', /</],
  ['LBRACE', /\{/], ['RBRACE', /\}/], ['LPAREN', /\(/], ['RPAREN', /\)/],
  ['LBRACKET', /\[/], ['RBRACKET', /\]/], ['COMMA', /,/],
  ['ID', /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/],
  ['NEWLINE', /\n/], ['SKIP', /[ \t\r]+/], ['MISMATCH', /./],
];
const KEYWORDS = new Set(['POLICY', 'IF', 'THEN', 'ACTION', 'AND', 'OR', 'IN', 'TRUE', 'FALSE']);
export const VALID_ACTIONS = new Set(['create_incident', 'isolate_agent', 'trigger_backup', 'block_process', 'notify', 'quarantine_file']);
export const VALID_FIELDS = new Set([
  'event.type', 'process.name', 'process.parent', 'process.pid', 'process.cmdline', 'process.cpu_percent',
  'file.path', 'file.file_path', 'file.extension', 'file.action', 'file.process_name', 'file.encrypt_rate',
  'registry.key', 'registry.value', 'registry.action', 'registry.actor',
  'network.dst_ip', 'network.domain', 'network.port', 'network.process', 'network.bytes_sent', 'network.bytes_recv',
  'usb.device', 'usb.serial', 'usb.action', 'usb.status',
  'system.cpu', 'system.ram', 'system.disk', 'system.gpu', 'system.net_sent', 'system.net_recv',
]);

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0, line = 1, column = 1;
  while (pos < text.length) {
    let matched = false;
    for (const [type, pattern] of TOKEN_SPEC) {
      const regex = new RegExp('^(?:' + pattern.source + ')');
      const m = regex.exec(text.substring(pos));
      if (!m) continue;
      const value = m[0]; matched = true;
      if (type === 'SKIP') { column += value.length; pos += value.length; }
      else if (type === 'NEWLINE') { line++; column = 1; pos += value.length; }
      else if (type === 'MISMATCH') throw new Error(`Unexpected character: ${value} at line ${line}:${column}`);
      else {
        let v: any = value;
        if (type === 'ID' && KEYWORDS.has(value.toUpperCase())) tokens.push({ type: value.toUpperCase(), value: value.toUpperCase(), line, column });
        else if (type === 'STRING') { v = value.slice(1, -1).replace(/\\(.)/g, '$1'); tokens.push({ type, value: v, line, column }); }
        else if (type === 'NUMBER') { v = Number(value); tokens.push({ type, value: v, line, column }); }
        else tokens.push({ type, value: v, line, column });
        column += value.length; pos += value.length;
      }
      break;
    }
    if (!matched) throw new Error(`Unrecognized token at position ${pos}`);
  }
  tokens.push({ type: 'EOF', value: null, line, column });
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}
  private peek() { return this.tokens[this.pos]; }
  private consume(expectedType?: string): Token {
    const tok = this.tokens[this.pos];
    if (expectedType && tok.type !== expectedType) throw new Error(`Expected ${expectedType} but got ${tok.type} at line ${tok.line}:${tok.column}`);
    this.pos++; return tok;
  }
  parsePolicy(): ASTNode {
    this.consume('POLICY'); const name = this.consume('ID').value; this.consume('LBRACE'); this.consume('IF');
    const condition = this.parseExpr(); this.consume('THEN'); this.consume('ACTION');
    const action = this.consume('ID').value; this.consume('RBRACE');
    return { type: 'Policy', name, condition, action };
  }
  private parseExpr(): ASTNode {
    let left = this.parseTerm();
    while (this.peek().type === 'OR') { this.consume('OR'); const right = this.parseTerm(); left = { type: 'Logical', op: 'OR', left, right }; }
    return left;
  }
  private parseTerm(): ASTNode {
    let left = this.parseFactor();
    while (this.peek().type === 'AND') { this.consume('AND'); const right = this.parseFactor(); left = { type: 'Logical', op: 'AND', left, right }; }
    return left;
  }
  private parseFactor(): ASTNode {
    if (this.peek().type === 'LPAREN') { this.consume('LPAREN'); const expr = this.parseExpr(); this.consume('RPAREN'); return expr; }
    return this.parseComparison();
  }
  private parseComparison(): ASTNode {
    const fieldTok = this.consume('ID'); const opTok = this.peek();
    const opTypes = new Set(['EQ', 'NE', 'GT', 'LT', 'GE', 'LE', 'IN']);
    if (!opTypes.has(opTok.type)) throw new Error(`Expected comparison operator but got ${opTok.type} at line ${opTok.line}:${opTok.column}`);
    this.consume(); const op = opTok.type;
    if (op === 'IN') {
      this.consume('LBRACKET'); const values: any[] = [];
      if (this.peek().type !== 'RBRACKET') { values.push(this.parseValue()); while (this.peek().type === 'COMMA') { this.consume('COMMA'); values.push(this.parseValue()); } }
      this.consume('RBRACKET'); return { type: 'Compare', field: fieldTok.value, op: 'IN', value: values };
    }
    const value = this.parseValue();
    return { type: 'Compare', field: fieldTok.value, op, value };
  }
  private parseValue(): any {
    const tok = this.peek();
    if (['NUMBER', 'STRING', 'TRUE', 'FALSE'].includes(tok.type)) {
      this.consume();
      if (tok.type === 'TRUE') return true; if (tok.type === 'FALSE') return false;
      return tok.value;
    }
    throw new Error(`Expected value but got ${tok.type} at line ${tok.line}:${tok.column}`);
  }
}

export function parse(tokens: Token[]): ASTNode {
  const parser = new Parser(tokens);
  const ast = parser.parsePolicy();
  if (parser.peek().type !== 'EOF') throw new Error('Unexpected tokens after policy definition');
  return ast;
}

export function analyzeSemantic(ast: ASTNode): SemanticResult {
  const errors: string[] = []; const warnings: string[] = [];
  if (!VALID_ACTIONS.has(ast.action)) errors.push(`Invalid action: '${ast.action}'`);
  function walk(node: ASTNode) {
    if (node.type === 'Compare') { if (!VALID_FIELDS.has(node.field)) errors.push(`Invalid field: '${node.field}'`); }
    else if (node.type === 'Logical') { walk(node.left); walk(node.right); }
  }
  walk(ast.condition);
  if (ast.action === 'isolate_agent') warnings.push('isolate_agent is high-impact — ensure conditions are restrictive');
  return { valid: errors.length === 0, errors, warnings, passed: errors.length === 0 };
}

export function optimize(ast: ASTNode): any[] {
  const bytecode: any[] = [];
  function flatten(node: ASTNode, depth: number) {
    if (node.type === 'Compare') bytecode.push({ type: 'COMPARE', field: node.field, op: node.op, value: node.value, depth });
    else if (node.type === 'Logical') { flatten(node.left, depth + 1); bytecode.push({ type: 'LOGICAL', op: node.op, depth }); flatten(node.right, depth + 1); }
  }
  flatten(ast.condition, 0);
  return bytecode;
}

export function compile(source: string): CompileResult {
  try {
    const tokens = tokenize(source);
    const ast = parse(tokens);
    const semantic = analyzeSemantic(ast);
    const bytecode = optimize(ast);
    return { status: 'success', tokens, ast, semantic, bytecode };
  } catch (e: any) {
    return { status: 'error', tokens: [], ast: null, semantic: { valid: false, errors: [e.message], warnings: [], passed: false }, bytecode: [], errors: [e.message] };
  }
}

export function evaluateAst(condition: ASTNode, eventType: string, rawData: Record<string, any>): boolean {
  if (condition.type === 'Compare') {
    const fieldParts = condition.field.split('.');
    if (fieldParts[0] !== eventType && eventType !== 'all') {
      if (condition.field === 'event.type') return compareValues(eventType, condition.op, condition.value);
      return false;
    }
    const dataKey = fieldParts.length > 1 ? fieldParts[fieldParts.length - 1] : fieldParts[0];
    const dataValue = rawData[dataKey];
    if (dataValue === undefined || dataValue === null) return false;
    return compareValues(dataValue, condition.op, condition.value);
  }
  if (condition.type === 'Logical') {
    if (condition.op === 'AND') return evaluateAst(condition.left, eventType, rawData) && evaluateAst(condition.right, eventType, rawData);
    if (condition.op === 'OR') return evaluateAst(condition.left, eventType, rawData) || evaluateAst(condition.right, eventType, rawData);
  }
  return false;
}

function compareValues(actual: any, op: string, expected: any): boolean {
  switch (op) {
    case 'EQ': return String(actual).toLowerCase() === String(expected).toLowerCase();
    case 'NE': return String(actual).toLowerCase() !== String(expected).toLowerCase();
    case 'GT': return Number(actual) > Number(expected);
    case 'LT': return Number(actual) < Number(expected);
    case 'GE': return Number(actual) >= Number(expected);
    case 'LE': return Number(actual) <= Number(expected);
    case 'IN': if (Array.isArray(expected)) { const s = String(actual).toLowerCase(); return expected.some((e) => s.includes(String(e).toLowerCase())); } return false;
  }
  return false;
}

export const DEFAULT_POLICIES = [
  `POLICY BlockRansomwareRecon { IF process.name == "vssadmin.exe" THEN ACTION create_incident }`,
  `POLICY EncodedPowerShell { IF process.name == "powershell.exe" AND process.cmdline IN ["EncodedCommand", "-enc"] THEN ACTION create_incident }`,
  `POLICY SuspiciousRegistryRunKey { IF registry.key IN ["Run", "CurrentVersion\\\\Run"] THEN ACTION create_incident }`,
  `POLICY RansomwareFileExtension { IF file.extension IN [".encrypted", ".locked", ".crypto", ".locky"] THEN ACTION quarantine_file }`,
  `POLICY HighCpuProcess { IF process.cpu_percent > 90 THEN ACTION notify }`,
];

export function evaluateEvent(eventType: string, rawData: Record<string, any>, policies?: string[]): string | null {
  const sources = policies || DEFAULT_POLICIES;
  for (const source of sources) {
    const result = compile(source);
    if (result.status === 'success' && result.ast && result.semantic.valid) {
      if (evaluateAst(result.ast.condition, eventType, rawData)) return result.ast.action;
    }
  }
  return null;
}