# prefer-early-return

<sup>`✅ Recommended`</sup> <sup>`Fixable`</sup>

Prefer a guard clause when the final `if` in a function wraps another `if` or multiple
statements. The autofix inverts the condition, returns early, and moves the nested
statements to the function's top level.

To avoid changing block scope, this rule skips direct variable/type declarations,
comments, and other cases that cannot be safely moved. It also leaves single-statement
wrappers (other than a nested `if`) unchanged.

```ts
// ❌ error
function sync(changed: boolean, same: boolean, value: number | null) {
    if (changed && !same) {
        if (value) {
            setDate(value);
        } else {
            onChange(null);
        }
    }
}

// ✅ after autofix
function sync(changed: boolean, same: boolean, value: number | null) {
    if (!changed || same) {
        return;
    }

    if (value) {
        setDate(value);
    } else {
        onChange(null);
    }
}
```

```ts
// ✅ unchanged: a single simple statement
function update(flag: boolean) {
    if (flag) {
        render();
    }
}

// ✅ unchanged: moving the declaration would change block scope
function update(flag: boolean) {
    if (flag) {
        const value = compute();
        render(value);
    }
}
```
