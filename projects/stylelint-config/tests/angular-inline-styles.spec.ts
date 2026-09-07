import {execFileSync} from 'node:child_process';

import {describe, expect, it} from '@jest/globals';

import angularConfig from '../angular';
import {type LintOutput, lintWithStylelint} from './stylelint-test-utils';

function dedent([source]: TemplateStringsArray): string {
    const indentation = source.match(/^[ \t]*(?=\S)/m)?.[0] ?? '';

    return source.trim().replaceAll(`\n${indentation}`, '\n');
}

async function lint(
    code: string,
    rules: Readonly<Record<string, unknown>>,
    fix = false,
): Promise<LintOutput> {
    return lintWithStylelint({
        code,
        codeFilename: 'test.component.ts',
        config: {
            ...angularConfig,
            rules,
        },
        fix,
    });
}

function lintNative(
    code: string,
    rules?: Readonly<Record<string, unknown>>,
    fix = false,
): LintOutput {
    // Native ESM avoids cross-realm PostCSS nodes and presets in Jest's VM.
    return JSON.parse(
        execFileSync(
            process.execPath,
            [
                '--input-type=module',
                '-e',
                `
                        import {createJiti} from 'jiti';
                        import stylelint from 'stylelint';

                        const jiti = createJiti(${JSON.stringify(__filename)});
                        const config = await jiti.import(
                            ${JSON.stringify(rules ? '../angular' : '../index')},
                            {default: true},
                        );
                        const result = await stylelint.lint({
                            code: ${JSON.stringify(code)},
                            codeFilename: 'test.component.ts',
                            config: {...config, ...${JSON.stringify(rules ? {rules} : {})}},
                            fix: ${JSON.stringify(fix)},
                        });

                        process.stdout.write(JSON.stringify({
                            code: result.code,
                            warnings: result.results.flatMap(({warnings}) => warnings),
                        }));
                    `,
            ],
            {encoding: 'utf8'},
        ),
    );
}

describe('Angular inline styles', () => {
    it('allows the same import in different components', () => {
        const code = dedent`
            @Component({
                styles: \`[data-tui-version='\${TUI_VERSION}'] {
                    @import './subheader.style.less';
                }\`,
            })
            export class First {}

            @Component({
                styles: \`[data-tui-version='\${TUI_VERSION}'] {
                    @import './subheader.style.less';
                }\`,
            })
            export class Second {}
        `;

        const result = lintNative(code, {'no-duplicate-at-import-rules': true});

        expect(result.warnings).toEqual([]);
    });

    it('still reports duplicate imports within one style block', () => {
        const code = dedent`
            @Component({
                styles: \`
                    @import './subheader.style.less';
                    @import './subheader.style.less';
                \`,
            })
            export class Test {}
        `;

        const result = lintNative(code, {'no-duplicate-at-import-rules': true});

        expect(result.warnings).toEqual([
            expect.objectContaining({
                column: 9,
                line: 4,
                rule: 'no-duplicate-at-import-rules',
            }),
        ]);
    });

    it.each([
        {lineBreak: '\n', styles: "':host { color: #ffffff; }'"},
        {lineBreak: '\r\n', styles: "':host { color: #ffffff; }'"},
        {lineBreak: '\n', styles: "''"},
        {lineBreak: '\n', styles: 'externalStyles'},
    ])(
        'lints and fixes $styles with the full config ($lineBreak)',
        ({lineBreak, styles}) => {
            const code = `
import {Component} from '@angular/core';

@Component({styles: ${styles}})
export class Test {}`.replaceAll('\n', lineBreak);

            const result = lintNative(code, undefined, true);

            expect(result.code).toBe(code.replace('#ffffff', '#fff'));
            expect(result.warnings).toEqual([]);
        },
    );

    it('reports Stylelint warnings at the original TypeScript location', async () => {
        const code = dedent`
            import {Component} from '@angular/core';

            @Component({
                styles: \`
                    :host {
                        unknown-property: 1;
                    }
                \`,
            })
            export class Test {}
        `;

        const result = await lint(code, {'property-no-unknown': true});

        expect(result.warnings).toEqual([
            expect.objectContaining({
                column: 13,
                line: 6,
                rule: 'property-no-unknown',
            }),
        ]);
    });

    it('lints a single-quoted style', async () => {
        const code = dedent`
            @Component({
                styles: '.test { unknown-property: 1; }',
            })
            export class Test {}
        `;

        const result = await lint(code, {'property-no-unknown': true});

        expect(result.warnings).toEqual([
            expect.objectContaining({
                line: 2,
                rule: 'property-no-unknown',
                text: expect.stringContaining('unknown-property'),
            }),
        ]);
    });

    it('lints every static style in an array', async () => {
        const code = dedent`
            @Component({
                styles: [
                    \`.first { unknown-first: 1; }\`,
                    '.second { unknown-second: 2; }',
                ],
            })
            export class Test {}
        `;

        const result = await lint(code, {'property-no-unknown': true});

        expect(result.warnings).toHaveLength(2);
        expect(result.warnings.map(({text}) => text)).toEqual([
            expect.stringContaining('unknown-first'),
            expect.stringContaining('unknown-second'),
        ]);
    });

    it('lints literals and ignores unsupported expressions in arrays', async () => {
        const code = dedent`
            @Component({
                styles: [
                    externalStyles,
                    \`.first { unknown-first: 1; }\`,
                    getStyles(),
                    '.second { unknown-second: 2; }',
                ],
            })
            export class Test {}
        `;

        const result = await lint(code, {'property-no-unknown': true});

        expect(result.warnings.map(({text}) => text)).toEqual([
            expect.stringContaining('unknown-first'),
            expect.stringContaining('unknown-second'),
        ]);
    });

    it('supports quoted styles property names', async () => {
        const code = dedent`
            @Component({
                'styles': \`.test { unknown-property: 1; }\`,
            })
            export class Test {}
        `;

        const result = await lint(code, {'property-no-unknown': true});

        expect(result.warnings).toEqual([
            expect.objectContaining({
                line: 2,
                rule: 'property-no-unknown',
                text: expect.stringContaining('unknown-property'),
            }),
        ]);
    });

    it('supports namespace-qualified Component decorators', async () => {
        const code = dedent`
            import * as ng from '@angular/core';

            @ng.Component({
                styles: \`.test { unknown-property: 1; }\`,
            })
            export class Test {}
        `;

        const result = await lint(code, {'property-no-unknown': true});

        expect(result.warnings).toEqual([
            expect.objectContaining({
                line: 4,
                rule: 'property-no-unknown',
                text: expect.stringContaining('unknown-property'),
            }),
        ]);
    });

    it('ignores styles metadata of decorators other than Component', async () => {
        const code = dedent`
            @Directive({
                styles: \`.fake { unknown-property: 1; }\`,
            })
            export class Test {}
        `;

        const result = await lint(code, {'property-no-unknown': true});

        expect(result.warnings).toEqual([]);
    });

    it('lints styles from multiple components in the same file', async () => {
        const code = dedent`
            @Component({
                styles: \`.first { unknown-first: 1; }\`,
            })
            export class First {}

            @Component({
                styles: \`.second { unknown-second: 2; }\`,
            })
            export class Second {}
        `;

        const result = await lint(code, {'property-no-unknown': true});

        expect(result.warnings).toEqual([
            expect.objectContaining({
                line: 2,
                text: expect.stringContaining('unknown-first'),
            }),
            expect.objectContaining({
                line: 7,
                text: expect.stringContaining('unknown-second'),
            }),
        ]);
    });

    it('supports Less in inline styles', async () => {
        const code = dedent`
            @Component({
                styles: \`
                    @color: red;

                    :host {
                        color: @color;
                    }
                \`,
            })
            export class Test {}
        `;

        const result = await lint(code, {'property-no-unknown': true});

        expect(result.warnings).toEqual([]);
    });

    it('supports template expressions inside quoted CSS values', async () => {
        const code = dedent`
            import {ChangeDetectionStrategy, Component, ViewEncapsulation} from '@angular/core';
            import {TUI_VERSION} from '@taiga-ui/cdk/constants';
            import {TUI_PLATFORM} from '@taiga-ui/cdk/tokens';
            import {tuiInjectElement} from '@taiga-ui/cdk/utils/dom';
            import {tuiWithStyles} from '@taiga-ui/cdk/utils/miscellaneous';
            import {tuiChipOptionsProvider} from '@taiga-ui/kit/components/chip';

            const OPTIONS = {
                behavior: 'smooth',
                block: 'nearest',
                container: 'nearest',
                inline: 'center',
            } as const;

            @Component({
                template: '',
                styles: \`
                    [data-tui-version='\${TUI_VERSION}'] {
                        @import './chip-group.styles.less';
                    }
                \`,
                encapsulation: ViewEncapsulation.None,
                changeDetection: ChangeDetectionStrategy.OnPush,
                exportAs: \`tui-chip-group-\${TUI_VERSION}\`,
            })
            class Styles {}
        `;

        const valid = await lint(code, {'property-no-unknown': true});
        const invalid = await lint(
            code.replace("@import './chip-group.styles.less';", 'unknown-property: 1;'),
            {'property-no-unknown': true},
        );

        expect(valid.warnings).toEqual([]);
        expect(invalid.warnings).toEqual([
            expect.objectContaining({
                column: 13,
                line: 19,
                rule: 'property-no-unknown',
                text: expect.stringContaining('unknown-property'),
            }),
        ]);
    });

    it('ignores unparseable template expressions and unrelated styles', async () => {
        const code = dedent`
            const metadata = {styles: \`.fake { unknown-property: 1; }\`};

            @Component({
                styles: \`:host { unknown-property: \${value}; }\`,
            })
            export class Test {}
        `;

        const result = await lint(code, {'property-no-unknown': true});

        expect(result.warnings).toEqual([]);
    });

    it('continues linting after an unparseable dynamic style', async () => {
        const code = dedent`
            @Component({
                styles: \`:host { color: \${value}; }\`,
            })
            export class First {}

            @Component({
                styles: \`.second { unknown-property: 1; }\`,
            })
            export class Second {}
        `;

        const result = await lint(code, {'property-no-unknown': true});

        expect(result.warnings).toEqual([
            expect.objectContaining({
                line: 7,
                text: expect.stringContaining('unknown-property'),
            }),
        ]);
    });

    it('preserves TypeScript when applying Stylelint fixes', async () => {
        const code = dedent`
            @Component({
                selector: 'test',
                styles: \`
                    :host {
                        color: #ffffff;
                    }
                \`,
                template: '',
            })
            export class Test {}
        `;

        const result = await lint(code, {'color-hex-length': 'short'}, true);

        expect(result.code).toBe(code.replace('#ffffff', '#fff'));
    });

    it.each(['\n', '\r\n'])(
        'preserves code between components during autofix (%j)',
        (lineBreak) => {
            const code = dedent`
            @Component({
                styles: [
                    \`.first { color: #ffffff; }\`,
                    '.second { background: #000000; }',
                ],
            })
            export class First {}

            const untouched = true;

            @Component({
                styles: \`.third { border-color: #aabbcc; }\`,
            })
            export class Second {}
        `.replaceAll('\n', lineBreak);

            const result = lintNative(code, {'color-hex-length': 'short'}, true);

            expect(result.code).toBe(
                code
                    .replace('#ffffff', '#fff')
                    .replace('#000000', '#000')
                    .replace('#aabbcc', '#abc'),
            );
        },
    );

    it('preserves a component without extractable styles during autofix', async () => {
        const code = dedent`
            @Component({
                styles: externalStyles,
                template: '<div />',
            })
            export class Test {}
        `;

        const result = await lint(code, {'color-hex-length': 'short'}, true);

        expect(result.code).toBe(code);
        expect(result.warnings).toEqual([]);
    });
});
