import {type Node} from 'postcss';

interface Position {
    column: number;
    line: number;
    offset?: number;
}

interface MutableSource {
    readonly input: {
        css: string;
    };
    end?: Position;
    start?: Position;
}

export interface AngularRaws {
    angularCodeAfter?: string;
    angularCodeBefore?: string;
    angularSource?: string;
}

export function getRaws(node: Node): AngularRaws {
    return node.raws;
}

function getPosition(source: string, offset: number): Position {
    const prefix = source.slice(0, offset);
    const lastLineBreak = prefix.lastIndexOf('\n');
    const line = prefix.split('\n').length;

    return {
        column: offset - lastLineBreak,
        line,
        offset,
    };
}

function remapPosition(position: Position, base: Position, offset: number): void {
    const localLine = position.line;

    position.line += base.line - 1;

    if (localLine === 1) {
        position.column += base.column - 1;
    }

    if (typeof position.offset === 'number') {
        position.offset += offset;
    }
}

export function remapNodeSource(node: Node, source: string, rangeStart: number): void {
    if (!node.source) {
        return;
    }

    const nodeSource = node.source as unknown as MutableSource;
    const base = getPosition(source, rangeStart);

    nodeSource.input.css = source;

    if (nodeSource.start) {
        remapPosition(nodeSource.start, base, rangeStart);
    }

    if (nodeSource.end) {
        remapPosition(nodeSource.end, base, rangeStart);
    }
}
