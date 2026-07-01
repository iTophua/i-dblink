/**
 * Pure functions for generating fake data for test data generation.
 * No external faker library required.
 */

// ── Data type enum ──

export type DataGenType =
  | 'auto'
  | 'sequentialId'
  | 'randomInt'
  | 'randomDecimal'
  | 'firstName'
  | 'lastName'
  | 'fullName'
  | 'email'
  | 'phone'
  | 'address'
  | 'city'
  | 'country'
  | 'company'
  | 'url'
  | 'date'
  | 'timestamp'
  | 'uuid'
  | 'boolean'
  | 'fixedValue'
  | 'null'
  | 'skip';

export interface ColumnGenConfig {
  columnName: string;
  dbType: string;
  genType: DataGenType;
  fixedValue?: string;
  rangeMin?: number;
  rangeMax?: number;
  precision?: number;
  dateFrom?: string;
  dateTo?: string;
}

// ── Static name pools ──

const FIRST_NAMES = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda',
  'William', 'Elizabeth', 'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Steven', 'Ashley',
  'Andrew', 'Dorothy', 'Paul', 'Kimberly', 'Joshua', 'Emily', 'Kenneth', 'Donna',
  'Wei', 'Fang', 'Lei', 'Mei', 'Yuki', 'Hiroshi', 'Sakura', 'Kenji',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Wang', 'Li', 'Zhang', 'Liu', 'Chen', 'Yang', 'Huang', 'Zhao',
  'Tanaka', 'Sato', 'Suzuki', 'Takahashi', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura',
];

const CITIES = [
  'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
  'San Antonio', 'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville',
  'London', 'Paris', 'Tokyo', 'Berlin', 'Madrid', 'Rome', 'Beijing', 'Shanghai',
  'Sydney', 'Melbourne', 'Toronto', 'Vancouver', 'Mumbai', 'Singapore', 'Seoul',
  'Dubai', 'Amsterdam', 'Stockholm', 'Vienna', 'Zurich', 'Barcelona',
];

const COUNTRIES = [
  'United States', 'Canada', 'United Kingdom', 'Germany', 'France', 'Japan',
  'Australia', 'Brazil', 'India', 'China', 'South Korea', 'Mexico', 'Italy',
  'Spain', 'Netherlands', 'Sweden', 'Switzerland', 'Singapore', 'New Zealand',
  'Ireland', 'Norway', 'Denmark', 'Finland', 'Belgium', 'Austria',
];

const STREET_NAMES = [
  'Main', 'Oak', 'Maple', 'Cedar', 'Elm', 'Pine', 'Walnut', 'Birch',
  'Washington', 'Park', 'Lake', 'Hill', 'River', 'Forest', 'Sunset', 'Valley',
  'Broadway', 'High', 'Church', 'Market', 'Spring', 'Academy', 'Union', 'Court',
];

const STREET_TYPES = ['Street', 'Avenue', 'Boulevard', 'Drive', 'Lane', 'Road', 'Way', 'Place'];

const COMPANY_NAMES = [
  'Acme Corp', 'Globex', 'Initech', 'Umbrella Corp', 'Wayne Enterprises',
  'Stark Industries', 'Cyberdyne Systems', 'Soylent Corp', 'Tyrell Corp',
  'Oscorp', 'LexCorp', 'Wonka Industries', 'Dunder Mifflin', 'Hooli',
  'Pied Piper', 'Massive Dynamic', 'Virtucon', 'Prestige Worldwide',
  'Aperture Science', 'Black Mesa', 'Nakatomi Trading', 'Dharma Initiative',
];

const EMAIL_DOMAINS = [
  'example.com', 'test.com', 'demo.org', 'sample.net', 'mail.com',
  'dev.io', 'corp.com', 'business.org', 'company.net', 'work.com',
];

const PROTOCOLS = ['https://www.', 'http://www.'];
const URL_DOMAINS = [
  'example.com', 'demo.org', 'test.io', 'sample.net', 'mysite.com',
  'website.org', 'platform.io', 'portal.com', 'app.dev', 'service.net',
];

// ── Random helpers ──

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function padZero(n: number | string, len: number): string {
  return String(n).padStart(len, '0');
}

// ── Generator functions ──

let _seqCounter = 0;

export function resetSequence(): void {
  _seqCounter = 0;
}

export function generateSequentialId(): number {
  return ++_seqCounter;
}

export function generateRandomInt(min = 0, max = 10000): number {
  return randomInt(min, max);
}

export function generateRandomDecimal(min = 0, max = 10000, precision = 2): number {
  const val = Math.random() * (max - min) + min;
  return parseFloat(val.toFixed(precision));
}

export function generateFirstName(): string {
  return randomElement(FIRST_NAMES);
}

export function generateLastName(): string {
  return randomElement(LAST_NAMES);
}

export function generateFullName(): string {
  return `${randomElement(FIRST_NAMES)} ${randomElement(LAST_NAMES)}`;
}

export function generateEmail(): string {
  const first = randomElement(FIRST_NAMES).toLowerCase();
  const last = randomElement(LAST_NAMES).toLowerCase();
  const domain = randomElement(EMAIL_DOMAINS);
  const sep = randomElement(['.', '_', '']);
  const num = randomInt(1, 999);
  return `${first}${sep}${last}${num}@${domain}`;
}

export function generatePhone(): string {
  const area = randomInt(200, 999);
  const mid = randomInt(200, 999);
  const end = randomInt(1000, 9999);
  return `(${area}) ${mid}-${end}`;
}

export function generateAddress(): string {
  const num = randomInt(1, 9999);
  return `${num} ${randomElement(STREET_NAMES)} ${randomElement(STREET_TYPES)}`;
}

export function generateCity(): string {
  return randomElement(CITIES);
}

export function generateCountry(): string {
  return randomElement(COUNTRIES);
}

export function generateCompany(): string {
  return randomElement(COMPANY_NAMES);
}

export function generateUrl(): string {
  return `${randomElement(PROTOCOLS)}${randomElement(URL_DOMAINS)}/${randomElement(['products', 'about', 'services', 'blog', 'contact', 'portfolio', 'docs', 'pricing'])}`;
}

export function generateDate(from?: string, to?: string): string {
  const rawFrom = from ? new Date(from).getTime() : NaN;
  const rawTo = to ? new Date(to).getTime() : NaN;
  const fromDate = Number.isNaN(rawFrom) ? new Date('2020-01-01').getTime() : rawFrom;
  const toDate = Number.isNaN(rawTo) ? new Date('2025-12-31').getTime() : rawTo;
  const ts = randomInt(Math.min(fromDate, toDate), Math.max(fromDate, toDate));
  const d = new Date(ts);
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1, 2)}-${padZero(d.getDate(), 2)}`;
}

export function generateTimestamp(from?: string, to?: string): string {
  const rawFrom = from ? new Date(from).getTime() : NaN;
  const rawTo = to ? new Date(to).getTime() : NaN;
  const fromDate = Number.isNaN(rawFrom) ? new Date('2020-01-01').getTime() : rawFrom;
  const toDate = Number.isNaN(rawTo) ? new Date('2025-12-31').getTime() : rawTo;
  const ts = randomInt(Math.min(fromDate, toDate), Math.max(fromDate, toDate));
  const d = new Date(ts);
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1, 2)}-${padZero(d.getDate(), 2)} ${padZero(d.getHours(), 2)}:${padZero(d.getMinutes(), 2)}:${padZero(d.getSeconds(), 2)}`;
}

export function generateUuid(): string {
  const h = (n: number) =>
    Array.from({ length: n }, () => '0123456789abcdef'[randomInt(0, 15)]).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${randomElement(['8', '9', 'a', 'b'])}${h(3)}-${h(12)}`;
}

export function generateBoolean(): boolean {
  return Math.random() >= 0.5;
}

// ── Auto-infer from DB column type ──

export function inferGenType(dbType: string, columnName: string): DataGenType {
  const lower = columnName.toLowerCase();
  const dt = dbType.toLowerCase();

  // Column name heuristics
  if (lower === 'id' || lower.endsWith('_id') || lower.endsWith('id')) return 'sequentialId';
  if (lower.includes('email') || lower.includes('mail')) return 'email';
  if (lower.includes('phone') || lower.includes('tel') || lower.includes('mobile')) return 'phone';
  if (lower.includes('first_name') || lower.includes('firstname') || lower === 'fname') return 'firstName';
  if (lower.includes('last_name') || lower.includes('lastname') || lower === 'lname') return 'lastName';
  if (lower.includes('name') && !lower.includes('user') && !lower.includes('file')) return 'fullName';
  if (lower.includes('address') || lower.includes('street')) return 'address';
  if (lower.includes('city')) return 'city';
  if (lower.includes('country')) return 'country';
  if (lower.includes('company') || lower.includes('organization') || lower.includes('org')) return 'company';
  if (lower.includes('url') || lower.includes('website') || lower.includes('link')) return 'url';
  if (lower.includes('uuid') || lower.includes('guid')) return 'uuid';
  if (lower.includes('active') || lower.includes('enabled') || lower.includes('is_') || lower.includes('has_')) return 'boolean';
  if (lower.includes('created') || lower.includes('updated') || lower.includes('modified') || lower.includes('deleted_at')) return 'timestamp';
  if (lower.includes('date') || lower.includes('birthday') || lower.includes('birth')) return 'date';
  if (lower.includes('description') || lower.includes('comment') || lower.includes('note') || lower.includes('content') || lower.includes('text')) return 'fullName'; // placeholder text

  // DB type heuristics
  if (dt.includes('int') || dt.includes('serial') || dt.includes('bigint') || dt.includes('smallint')) return 'randomInt';
  if (dt.includes('decimal') || dt.includes('numeric') || dt.includes('float') || dt.includes('double') || dt.includes('real') || dt.includes('money')) return 'randomDecimal';
  if (dt.includes('bool')) return 'boolean';
  if (dt.includes('timestamp') || dt.includes('datetime')) return 'timestamp';
  if (dt.includes('date')) return 'date';
  if (dt.includes('uuid')) return 'uuid';
  if (dt.includes('char') || dt.includes('text') || dt.includes('varchar') || dt.includes('clob') || dt.includes('nvarchar')) return 'fullName';

  return 'fullName';
}

// ── Generate a single value ──

export function generateValue(config: ColumnGenConfig, rowIndex: number): unknown {
  switch (config.genType) {
    case 'auto':
      return generateValue(
        { ...config, genType: inferGenType(config.dbType, config.columnName) },
        rowIndex,
      );
    case 'sequentialId':
      return rowIndex + 1;
    case 'randomInt':
      return generateRandomInt(config.rangeMin ?? 1, config.rangeMax ?? 10000);
    case 'randomDecimal':
      return generateRandomDecimal(config.rangeMin ?? 0, config.rangeMax ?? 10000, config.precision ?? 2);
    case 'firstName':
      return generateFirstName();
    case 'lastName':
      return generateLastName();
    case 'fullName':
      return generateFullName();
    case 'email':
      return generateEmail();
    case 'phone':
      return generatePhone();
    case 'address':
      return generateAddress();
    case 'city':
      return generateCity();
    case 'country':
      return generateCountry();
    case 'company':
      return generateCompany();
    case 'url':
      return generateUrl();
    case 'date':
      return generateDate(config.dateFrom, config.dateTo);
    case 'timestamp':
      return generateTimestamp(config.dateFrom, config.dateTo);
    case 'uuid':
      return generateUuid();
    case 'boolean':
      return generateBoolean();
    case 'fixedValue':
      return config.fixedValue ?? '';
    case 'null':
      return null;
    case 'skip':
      return undefined; // should not be included
    default:
      return null;
  }
}

// ── Generate a batch of rows ──

export function generateBatchRows(
  configs: ColumnGenConfig[],
  startRow: number,
  count: number,
): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const row: Record<string, unknown> = {};
    for (const col of configs) {
      if (col.genType === 'skip') continue;
      const value = generateValue(col, startRow + i);
      if (value !== undefined) {
        row[col.columnName] = value;
      }
    }
    rows.push(row);
  }
  return rows;
}
