/**
 * Safe, finite arithmetic expression parser for parameter inputs.
 *
 * Grammar (whitelist only):
 *   add     := mul (('+' | '-') mul)*
 *   mul     := unary (('*' | '/' | implicit) unary)*
 *   unary   := ('+' | '-') unary | sqrt unary | power
 *   power   := primary ('^' unary)?          // right associative
 *   primary := number | 'π' | '(' add ')'
 *
 * Implicit multiplication is accepted between a value and '(', 'π', '√',
 * 'sqrt' or 'pi'. No JavaScript code is ever executed.
 */

export type MathParseReason =
  | 'incomplete'
  | 'syntax'
  | 'forbidden'
  | 'division-by-zero'
  | 'sqrt-negative'
  | 'non-finite'
  | 'too-complex';

export interface MathParseOk {
  ok: true;
  value: number;
  normalized: string;
}

export interface MathParseError {
  ok: false;
  reason: MathParseReason;
  message: string;
}

export type MathParseResult = MathParseOk | MathParseError;

export const MAX_EXPRESSION_LENGTH = 128;
export const MAX_EXPRESSION_DEPTH = 32;
export const MAX_EXPRESSION_NODES = 256;

type TokenKind =
  | 'number'
  | 'operator'
  | 'lparen'
  | 'rparen'
  | 'constant'
  | 'sqrt'
  | 'identifier'
  | 'eof';

interface Token {
  kind: TokenKind;
  text: string;
  value?: number;
  index: number;
}

type AstNode =
  | { kind: 'number'; value: number }
  | { kind: 'constant' }
  | { kind: 'unary'; op: '+' | '-'; operand: AstNode }
  | { kind: 'sqrt'; operand: AstNode }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: AstNode; right: AstNode };

class ExpressionError extends Error {
  readonly reason: MathParseReason;

  constructor(reason: MathParseReason, message: string) {
    super(message);
    this.reason = reason;
  }
}

const FULL_WIDTH_DIGITS = '０１２３４５６７８９';

export function normalizeExpressionText(raw: string): string {
  let text = raw;
  for (let index = 0; index < FULL_WIDTH_DIGITS.length; index += 1) {
    text = text.replaceAll(FULL_WIDTH_DIGITS[index], String(index));
  }
  return text
    .replaceAll('．', '.')
    .replaceAll('（', '(')
    .replaceAll('）', ')')
    .replaceAll('【', '(')
    .replaceAll('】', ')')
    .replaceAll('［', '(')
    .replaceAll('］', ')')
    .replaceAll('＋', '+')
    .replaceAll('－', '-')
    .replaceAll('＊', '*')
    .replaceAll('／', '/')
    .replaceAll('＾', '^')
    .replaceAll('×', '*')
    .replaceAll('✕', '*')
    .replaceAll('✖', '*')
    .replaceAll('·', '*')
    .replaceAll('⋅', '*')
    .replaceAll('÷', '/')
    .replaceAll('−', '-')
    .replaceAll('–', '-')
    .replaceAll('—', '-')
    .replaceAll('，', ',')
    .replaceAll('　', ' ')
    .trim();
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1;
      continue;
    }
    if (char >= '0' && char <= '9') {
      const start = index;
      while (index < text.length && text[index] >= '0' && text[index] <= '9') index += 1;
      if (text[index] === '.') {
        index += 1;
        while (index < text.length && text[index] >= '0' && text[index] <= '9') index += 1;
      }
      if (text[index] === 'e' || text[index] === 'E') {
        const exponentStart = index;
        index += 1;
        if (text[index] === '+' || text[index] === '-') index += 1;
        const digitStart = index;
        while (index < text.length && text[index] >= '0' && text[index] <= '9') index += 1;
        if (index === digitStart) {
          throw new ExpressionError('incomplete', `科学计数法的指数未写完（位置 ${exponentStart + 1}）。`);
        }
      }
      const rawNumber = text.slice(start, index);
      const value = Number(rawNumber);
      if (!Number.isFinite(value)) {
        throw new ExpressionError('non-finite', `数字「${rawNumber}」超出可表示范围。`);
      }
      tokens.push({ kind: 'number', text: rawNumber, value, index: start });
      continue;
    }
    if (char === '.') {
      const start = index;
      index += 1;
      const digitStart = index;
      while (index < text.length && text[index] >= '0' && text[index] <= '9') index += 1;
      if (index === digitStart) {
        throw new ExpressionError('incomplete', '小数点后缺少数字。');
      }
      const rawNumber = text.slice(start, index);
      tokens.push({ kind: 'number', text: rawNumber, value: Number(rawNumber), index: start });
      continue;
    }
    if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^') {
      tokens.push({ kind: 'operator', text: char, index });
      index += 1;
      continue;
    }
    if (char === '(') {
      tokens.push({ kind: 'lparen', text: char, index });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rparen', text: char, index });
      index += 1;
      continue;
    }
    if (char === 'π') {
      tokens.push({ kind: 'constant', text: char, index });
      index += 1;
      continue;
    }
    if (char === '√') {
      tokens.push({ kind: 'sqrt', text: char, index });
      index += 1;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      const start = index;
      while (index < text.length && /[A-Za-z0-9_]/.test(text[index])) index += 1;
      const identifier = text.slice(start, index);
      const lower = identifier.toLowerCase();
      if (lower === 'pi') {
        tokens.push({ kind: 'constant', text: identifier, index: start });
        continue;
      }
      if (lower === 'sqrt') {
        tokens.push({ kind: 'sqrt', text: identifier, index: start });
        continue;
      }
      throw new ExpressionError(
        'forbidden',
        `不支持名称「${identifier}」。表达式只允许数字、+ − * / ^、括号、π 与 sqrt()。`,
      );
    }
    throw new ExpressionError(
      'syntax',
      `无法识别的字符「${char}」（位置 ${index + 1}）。只允许数字、+ − * / ^、括号、π、√ 与 sqrt()。`,
    );
  }
  tokens.push({ kind: 'eof', text: '', index: text.length });
  return tokens;
}

class Parser {
  private readonly tokens: Token[];
  private position = 0;
  private depth = 0;
  private nodes = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): AstNode {
    const node = this.parseAdditive();
    const token = this.peek();
    if (token.kind !== 'eof') {
      if (token.kind === 'rparen') {
        throw new ExpressionError('syntax', '括号不匹配：多了一个右括号。');
      }
      throw new ExpressionError('syntax', `运算符或括号缺失（位置 ${token.index + 1} 附近的「${token.text}」）。`);
    }
    return node;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.position + offset, this.tokens.length - 1)];
  }

  private consume(): Token {
    const token = this.tokens[this.position];
    if (this.position < this.tokens.length - 1) this.position += 1;
    return token;
  }

  private countNode(): void {
    this.nodes += 1;
    if (this.nodes > MAX_EXPRESSION_NODES) {
      throw new ExpressionError('too-complex', `表达式结构过于复杂（最多 ${MAX_EXPRESSION_NODES} 个节点）。`);
    }
  }

  private enter(): void {
    this.depth += 1;
    if (this.depth > MAX_EXPRESSION_DEPTH) {
      throw new ExpressionError('too-complex', `括号嵌套过深（最多 ${MAX_EXPRESSION_DEPTH} 层）。`);
    }
  }

  private leave(): void {
    this.depth -= 1;
  }

  private parseAdditive(): AstNode {
    let node = this.parseMultiplicative();
    for (;;) {
      const token = this.peek();
      if (token.kind === 'operator' && (token.text === '+' || token.text === '-')) {
        this.consume();
        const right = this.parseMultiplicative();
        this.countNode();
        node = { kind: 'binary', op: token.text, left: node, right };
      } else {
        break;
      }
    }
    return node;
  }

  private parseMultiplicative(): AstNode {
    let node = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.kind === 'operator' && (token.text === '*' || token.text === '/')) {
        this.consume();
        const right = this.parseUnary();
        this.countNode();
        node = { kind: 'binary', op: token.text, left: node, right };
        continue;
      }
      if (this.startsImplicitFactor(token)) {
        const right = this.parseUnary();
        this.countNode();
        node = { kind: 'binary', op: '*', left: node, right };
        continue;
      }
      break;
    }
    return node;
  }

  private startsImplicitFactor(token: Token): boolean {
    return token.kind === 'lparen' || token.kind === 'constant' || token.kind === 'sqrt';
  }

  private parseUnary(): AstNode {
    const token = this.peek();
    if (token.kind === 'operator' && (token.text === '+' || token.text === '-')) {
      this.consume();
      this.enter();
      const operand = this.parseUnary();
      this.leave();
      if (token.text === '+') return operand;
      this.countNode();
      return { kind: 'unary', op: '-', operand };
    }
    if (token.kind === 'sqrt') {
      this.consume();
      this.enter();
      const operand = this.parsePower();
      this.leave();
      this.countNode();
      return { kind: 'sqrt', operand };
    }
    return this.parsePower();
  }

  private parsePower(): AstNode {
    const base = this.parsePrimary();
    if (this.peek().kind === 'operator' && this.peek().text === '^') {
      this.consume();
      this.enter();
      const exponent = this.parseUnary();
      this.leave();
      this.countNode();
      return { kind: 'binary', op: '^', left: base, right: exponent };
    }
    return base;
  }

  private parsePrimary(): AstNode {
    const token = this.consume();
    if (token.kind === 'number') {
      this.countNode();
      return { kind: 'number', value: token.value as number };
    }
    if (token.kind === 'constant') {
      this.countNode();
      return { kind: 'constant' };
    }
    if (token.kind === 'lparen') {
      this.enter();
      const node = this.parseAdditive();
      this.leave();
      const next = this.peek();
      if (next.kind === 'eof') {
        throw new ExpressionError('incomplete', '括号未闭合，请继续输入。');
      }
      if (next.kind !== 'rparen') {
        throw new ExpressionError('syntax', '括号未闭合。');
      }
      this.consume();
      return node;
    }
    if (token.kind === 'eof') {
      throw new ExpressionError('incomplete', '表达式尚未输入完整。');
    }
    if (token.kind === 'rparen') {
      throw new ExpressionError('syntax', '括号不匹配或缺少运算符。');
    }
    if (token.kind === 'operator') {
      throw new ExpressionError('syntax', `运算符「${token.text}」的位置不合法。`);
    }
    throw new ExpressionError('syntax', `此处不能使用「${token.text}」。`);
  }
}

function evaluateNode(node: AstNode): number {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'constant':
      return Math.PI;
    case 'unary': {
      const value = evaluateNode(node.operand);
      return node.op === '-' ? -value : value;
    }
    case 'sqrt': {
      const value = evaluateNode(node.operand);
      if (value < 0) {
        throw new ExpressionError('sqrt-negative', '负数不能开平方（实数范围内）。');
      }
      return Math.sqrt(value);
    }
    case 'binary': {
      const left = evaluateNode(node.left);
      const right = evaluateNode(node.right);
      let result: number;
      switch (node.op) {
        case '+':
          result = left + right;
          break;
        case '-':
          result = left - right;
          break;
        case '*':
          result = left * right;
          break;
        case '/':
          if (right === 0) {
            throw new ExpressionError('division-by-zero', '除数不能为 0。');
          }
          result = left / right;
          break;
        case '^':
          result = Math.pow(left, right);
          break;
      }
      if (!Number.isFinite(result)) {
        throw new ExpressionError('non-finite', '计算结果不是有限实数，已拒绝。');
      }
      return result;
    }
  }
}

function containsForbiddenPattern(text: string): string | null {
  const lower = text.toLowerCase();
  const forbidden = ['__proto__', 'constructor', 'prototype', 'window', 'document', 'globalthis', 'eval', 'function', 'alert', 'fetch', 'xmlhttprequest'];
  for (const word of forbidden) {
    if (lower.includes(word)) return word;
  }
  return null;
}

export function parseParameterExpression(raw: string): MathParseResult {
  if (raw.length > MAX_EXPRESSION_LENGTH) {
    return {
      ok: false,
      reason: 'too-complex',
      message: `表达式过长（${raw.length} 字符，最多 ${MAX_EXPRESSION_LENGTH} 字符）。`,
    };
  }
  const normalized = normalizeExpressionText(raw);
  if (normalized.length === 0) {
    return { ok: false, reason: 'incomplete', message: '请输入数值或数学表达式。' };
  }
  const forbiddenWord = containsForbiddenPattern(normalized);
  if (forbiddenWord) {
    return {
      ok: false,
      reason: 'forbidden',
      message: `表达式包含不支持的名称「${forbiddenWord}」；这里只做实数算术，不执行代码。`,
    };
  }
  try {
    const tokens = tokenize(normalized);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const value = evaluateNode(ast);
    if (!Number.isFinite(value)) {
      return { ok: false, reason: 'non-finite', message: '计算结果不是有限实数，已拒绝。' };
    }
    return { ok: true, value, normalized };
  } catch (error) {
    if (error instanceof ExpressionError) {
      return { ok: false, reason: error.reason, message: error.message };
    }
    return { ok: false, reason: 'syntax', message: '表达式格式错误。' };
  }
}

export function isIncompleteExpression(result: MathParseResult): boolean {
  return !result.ok && result.reason === 'incomplete';
}
