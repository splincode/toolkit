import {rule} from '../rules/recommended/prefer-early-return';
import {withCrLf} from './utils/line-endings';

const RuleTester = require('@typescript-eslint/rule-tester').RuleTester;

const ruleTester = new RuleTester({
    languageOptions: {
        parser: require('@typescript-eslint/parser'),
        parserOptions: {projectService: {allowDefaultProject: ['*.ts*']}},
    },
});

const nested = /* TypeScript */ `
function sync(changed: boolean, same: boolean, value: number | null): void {
    if (changed && !same) {
        if (value) {
            setDate(value);
        } else {
            onChange(null);
        }
    }
}
`;

const flattened = /* TypeScript */ `
function sync(changed: boolean, same: boolean, value: number | null): void {
    if (!changed || same) {
        return;
    }

    if (value) {
        setDate(value);
    } else {
        onChange(null);
    }
}
`;

ruleTester.run('prefer-early-return', rule, {
    invalid: [
        {
            code: nested,
            errors: [{messageId: 'preferEarlyReturn'}],
            output: flattened,
        },
        {
            code: withCrLf(nested),
            errors: [{messageId: 'preferEarlyReturn'}],
            output: withCrLf(flattened),
        },
        {
            code: /* TypeScript */ `
function run(a: boolean, b: boolean): void {
    if (a || b) {
        doFirst();
        doSecond();
    }
}
`,
            errors: [{messageId: 'preferEarlyReturn'}],
            output: /* TypeScript */ `
function run(a: boolean, b: boolean): void {
    if (!a && !b) {
        return;
    }

    doFirst();
    doSecond();
}
`,
        },
        {
            code: /* TypeScript */ `
function run(a: boolean, b: boolean, c: boolean): void {
    if (a && (b || c)) {
        if (a) {
            doWork();
        }
    }
}
`,
            errors: [{messageId: 'preferEarlyReturn'}],
            output: /* TypeScript */ `
function run(a: boolean, b: boolean, c: boolean): void {
    if (!a || (!b && !c)) {
        return;
    }

    if (a) {
        doWork();
    }
}
`,
        },
    ],
    valid: [
        {
            code: /* TypeScript */ `
function run(flag: boolean): void {
    if (flag) {
        doWork();
    }
}
`,
        },
        {
            code: /* TypeScript */ `
function run(flag: boolean): void {
    if (flag) {
        doWork();
    } else {
        doOtherWork();
    }
}
`,
        },
        {
            code: /* TypeScript */ `
function run(flag: boolean): void {
    if (flag) {
        if (ready) doWork();
    }

    finish();
}
`,
        },
        {
            code: /* TypeScript */ `
function run(flag: boolean): void {
    if (flag) {
        const value = compute();
        use(value);
    }
}
`,
        },
        {
            code: /* TypeScript */ `
function run(flag: boolean): void {
    if (flag) {
        // Keep this explanation inside its original scope.
        if (ready) doWork();
    }
}
`,
        },
        {
            code: /* TypeScript */ `
while (ready) {
    if (flag) {
        doFirst();
        doSecond();
    }
}
`,
        },
    ],
});
