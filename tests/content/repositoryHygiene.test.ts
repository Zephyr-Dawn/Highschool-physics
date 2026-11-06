import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

describe('repository licensing and hygiene', () => {
  it('ships the unmodified GNU GPLv3 text and SPDX metadata', () => {
    const license = readFileSync(join(root, 'LICENSE'), 'utf8');
    expect(license).toContain('GNU GENERAL PUBLIC LICENSE');
    expect(license).toContain('Version 3, 29 June 2007');
    expect(license).toContain('END OF TERMS AND CONDITIONS');
    expect(license).not.toContain('GPL-3.0-or-later');

    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      license?: string;
      private?: boolean;
    };
    expect(pkg.license).toBe('GPL-3.0-only');
    expect(pkg.private).toBe(true);
  });

  it('links the license and third-party notice from the README', () => {
    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme).toContain('GPL-3.0-only');
    expect(readme).toContain('](LICENSE)');
    expect(readme).toContain('docs/THIRD_PARTY_LICENSES.md');
    expect(readme).toContain('](NOTICE)');
  });

  it('does not ignore all Markdown or the retained product screenshots', () => {
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8');
    expect(ignore).not.toMatch(/^\*\.md$/m);
    expect(ignore).toContain('docs/screenshots/*');
    expect(ignore).toContain('!docs/screenshots/product-overview.png');
  });
});
