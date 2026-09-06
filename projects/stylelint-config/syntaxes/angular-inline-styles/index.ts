import {type Node, type ProcessOptions, type Root, root} from 'postcss';
import less from 'postcss-less';

import {extractComponentStyles} from './extract-component-styles';
import {getRaws, remapNodeSource} from './remap-source';

type Builder = (output: string, node?: Node, type?: string) => void;

type Stringifiable = string | {toString(): string};

function parseStyle(
    snippet: string,
    opts: ProcessOptions,
    dynamic: boolean,
): Root | null {
    try {
        return less.parse(snippet, opts);
    } catch (error) {
        if (dynamic) {
            return null;
        }

        throw error;
    }
}

function parse(sourceInput: Stringifiable, opts: ProcessOptions = {}): Root {
    const source = String(sourceInput);
    const output = root();
    let lastNode: Node | null = null;
    let previousRangeEnd = 0;

    getRaws(output).angularSource = source;

    for (const range of extractComponentStyles(source, opts.from ?? 'component.ts')) {
        const snippet = source.slice(range.start, range.end);
        const parsed = parseStyle(snippet, opts, range.dynamic);

        if (!parsed) {
            continue;
        }

        const nodes = [...parsed.nodes];

        if (nodes.length === 0) {
            continue;
        }

        let previousLocalEnd = 0;

        nodes.forEach((node, index) => {
            const localStart = node.source?.start?.offset ?? 0;
            const localEnd = node.source?.end?.offset ?? localStart;
            const raws = getRaws(node);
            const angularPrefix =
                index === 0 ? source.slice(previousRangeEnd, range.start) : '';

            const localPrefix = snippet.slice(previousLocalEnd, localStart);

            raws.angularCodeBefore = `${angularPrefix}${localPrefix}`;

            if (index === nodes.length - 1) {
                raws.angularCodeAfter = snippet.slice(localEnd);
            }

            previousLocalEnd = localEnd;
        });

        parsed.walk((node) => remapNodeSource(node, source, range.start));
        output.append(nodes);
        previousRangeEnd = range.end;
        lastNode = nodes[nodes.length - 1] ?? null;
    }

    if (lastNode) {
        const raws = getRaws(lastNode);
        const angularSuffix = source.slice(previousRangeEnd);

        raws.angularCodeAfter = `${raws.angularCodeAfter ?? ''}${angularSuffix}`;
    }

    return output;
}

function stringify(node: Node, builder: Builder): void {
    const raws = getRaws(node);

    if (node.type !== 'root' || raws.angularSource === undefined) {
        less.stringify(node, builder);

        return;
    }

    const angularRoot = node as Root;

    if (angularRoot.nodes.length === 0) {
        builder(raws.angularSource, node);

        return;
    }

    for (const child of angularRoot.nodes) {
        const childRaws = getRaws(child);

        if (childRaws.angularCodeBefore) {
            builder(childRaws.angularCodeBefore, child, 'raw');
        }

        less.stringify(child, builder);

        if (childRaws.angularCodeAfter) {
            builder(childRaws.angularCodeAfter, child, 'raw');
        }
    }
}

export default {parse, stringify};
